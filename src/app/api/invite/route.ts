import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";

function generateCode(prefix: string): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let result = "";
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `${prefix}${result}`;
}

function isSuperAdmin(user: Record<string, unknown>): boolean {
  return user.role === "super_admin" && user.status === "approved";
}

function isAdmin(user: Record<string, unknown>): boolean {
  return (
    (user.role === "admin" || user.role === "super_admin") &&
    user.status === "approved"
  );
}

function mapInviteCode(item: Record<string, unknown>) {
  const usedBy = item.used_by as string | null;
  const revokedAt = item.revoked_at as string | null;
  return {
    id: item.code,
    code: item.code,
    created_by: item.owner_id,
    created_by_id: item.owner_id,
    owner_id: item.owner_id,
    role_type: item.role_type,
    max_uses: 1,
    use_count: usedBy ? 1 : 0,
    is_active: !usedBy && !revokedAt,
    used_by: usedBy,
    used_by_id: usedBy,
    used_at: null,
    revoked_at: revokedAt,
    created_at: item.created_at,
    note: `role:${item.role_type}`,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, username, code,  note, key, value, count = 1 } = body;

    const supabase = await getSupabaseClient();

    // ========== 生成邀请码（管理员） ==========
    if (action === "generate") {
      if (!username) {
        return NextResponse.json({ error: "缺少用户名" }, { status: 400 });
      }

      const { data: user } = await supabase
        .from("users")
        .select("id, username, role, status, level")
        .eq("username", username)
        .single();

      if (!user || (!isAdmin(user) && !isSuperAdmin(user))) {
        return NextResponse.json({ error: "无权操作：你不是管理员" }, { status: 403 });
      }

      const superAdmin = isSuperAdmin(user);
      const roleType = body.roleType || (note ? note.replace("role:", "") : "user");
      const targetRole = roleType === "admin" && superAdmin ? "admin" : "user";

      if (!superAdmin && targetRole === "admin") {
        return NextResponse.json(
          { error: "普通管理员只能生成普通用户邀请码" },
          { status: 403 }
        );
      }

      const generateCount = Math.min(Math.max(parseInt(String(count), 10) || 1, 1), 100);

      if (!superAdmin) {
        const { count: existingCount, error: countError } = await supabase
          .from("invite_codes")
          .select("*", { count: "exact", head: true })
          .eq("owner_id", user.id);

        if (countError) {
          return NextResponse.json(
            { error: "查询邀请码失败: " + countError.message },
            { status: 500 }
          );
        }

        if ((existingCount || 0) + generateCount > 10) {
          return NextResponse.json(
            { error: "普通管理员最多持有10个邀请码" },
            { status: 403 }
          );
        }
      }

      const prefix = targetRole === "admin" ? "ADMIN-" : "MIMI-";
      const generated: Record<string, unknown>[] = [];

      for (let i = 0; i < generateCount; i++) {
        let inviteCode = generateCode(prefix);
        let attempts = 0;
        while (attempts < 5) {
          const { data: existing } = await supabase
            .from("invite_codes")
            .select("code")
            .eq("code", inviteCode)
            .single();
          if (!existing) break;
          inviteCode = generateCode(prefix);
          attempts++;
        }

        const { data, error } = await supabase
          .from("invite_codes")
          .insert({
            code: inviteCode,
            owner_id: user.id,
            role_type: targetRole,
          })
          .select()
          .single();

        if (error) {
          return NextResponse.json({ error: error.message }, { status: 500 });
        }
        generated.push(mapInviteCode(data as Record<string, unknown>));
      }

      return NextResponse.json({
        success: true,
        data: generated.length === 1 ? generated[0] : generated,
      });
    }

    // ========== 验证邀请码 ==========
    if (action === "validate") {
      if (!code) {
        return NextResponse.json({ valid: false, error: "请输入邀请码" });
      }

      const { data: invite, error } = await supabase
        .from("invite_codes")
        .select("*")
        .eq("code", code.toUpperCase().trim())
        .single();

      if (error || !invite) {
        return NextResponse.json({ valid: false, error: "邀请码无效" });
      }

      if (invite.revoked_at) {
        return NextResponse.json({ valid: false, error: "邀请码已作废" });
      }

      if (invite.used_by) {
        return NextResponse.json({ valid: false, error: "邀请码已被使用" });
      }

      return NextResponse.json({
        valid: true,
        data: {
          code: invite.code,
          createdBy: invite.owner_id,
          roleType: invite.role_type,
          remainingUses: 1,
        },
      });
    }

    // ========== 使用邀请码（注册时调用）- 已迁移到 /api/auth/register，此处保留兼容 ==========
    if (action === "use") {
      return NextResponse.json(
        { error: "请使用 /api/auth/register 完成注册并自动消耗邀请码" },
        { status: 400 }
      );
    }

    // ========== 获取所有邀请码列表（管理员） ==========
    if (action === "list") {
      const { data, error } = await supabase
        .from("invite_codes")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        data: (data || []).map((item) => mapInviteCode(item as Record<string, unknown>)),
      });
    }

    // ========== 获取邀请关系树（管理员） ==========
    if (action === "tree") {
      const { data: users, error } = await supabase
        .from("users")
        .select("id, username, display_name, level, role, status, referrer_id, created_at")
        .not("referrer_id", "is", null)
        .order("created_at", { ascending: true });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      const { data: admins } = await supabase
        .from("users")
        .select("id, username, display_name, level, role, status, created_at")
        .eq("role", "admin")
        .order("created_at", { ascending: true });

      return NextResponse.json({
        success: true,
        data: {
          invited: users || [],
          admins: admins || [],
        },
      });
    }

    // ========== 获取我的邀请码 ==========
    if (action === "my_codes") {
      if (!username) {
        return NextResponse.json({ error: "缺少用户名" }, { status: 400 });
      }

      const { data: user } = await supabase
        .from("users")
        .select("id")
        .eq("username", username)
        .single();

      if (!user) {
        return NextResponse.json({ error: "用户不存在" }, { status: 404 });
      }

      const { data, error } = await supabase
        .from("invite_codes")
        .select("*")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: false });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      const { data: invitedUsers } = await supabase
        .from("users")
        .select("username, display_name, created_at")
        .eq("referrer_id", user.id);

      return NextResponse.json({
        success: true,
        data: {
          codes: (data || []).map((item) => mapInviteCode(item as Record<string, unknown>)),
          invitedUsers: invitedUsers || [],
          totalInvited: (invitedUsers || []).length,
        },
      });
    }

    // ========== 获取系统设置 ==========
    if (action === "get_settings") {
      const { data } = await supabase.from("system_settings").select("*");

      const settings: Record<string, string> = {};
      if (data) {
        data.forEach((item: { key: string; value: string }) => {
          settings[item.key] = item.value;
        });
      }

      return NextResponse.json({ success: true, data: settings });
    }

    // ========== 更新系统设置（管理员） ==========
    if (action === "update_settings") {
      if (!key) {
        return NextResponse.json({ error: "缺少参数" }, { status: 400 });
      }

      if (username) {
        const { data: user } = await supabase
          .from("users")
          .select("role, status, level")
          .eq("username", username)
          .single();

        if (!user || (!isAdmin(user) && !isSuperAdmin(user))) {
          return NextResponse.json({ error: "无权操作" }, { status: 403 });
        }
      }

      await supabase
        .from("system_settings")
        .upsert({ key, value: String(value), updated_at: new Date().toISOString() });

      return NextResponse.json({ success: true });
    }

    // ========== 停用/作废邀请码 ==========
    if (action === "deactivate") {
      if (!code) {
        return NextResponse.json({ error: "缺少邀请码" }, { status: 400 });
      }

      const { data: invite } = await supabase
        .from("invite_codes")
        .select("used_by")
        .eq("code", code.toUpperCase().trim())
        .single();

      if (invite?.used_by) {
        return NextResponse.json(
          { error: "已使用的邀请码不能作废" },
          { status: 400 }
        );
      }

      await supabase
        .from("invite_codes")
        .update({ revoked_at: new Date().toISOString() })
        .eq("code", code.toUpperCase().trim());

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "无效的操作" }, { status: 400 });
  } catch (err) {
    console.error("Invite API error:", err);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}
