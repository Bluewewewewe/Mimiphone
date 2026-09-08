import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { rateLimit } from "@/lib/rate-limit";

function generateInviteCode(prefix: string): string {
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

async function getUserByToken(
  supabase: Awaited<ReturnType<typeof getSupabaseClient>>,
  authToken: string
): Promise<{ user: Record<string, unknown>; session: Record<string, unknown> } | null> {
  const { data: session } = await supabase
    .from("user_sessions")
    .select("*")
    .eq("token", authToken)
    .gte("expires_at", new Date().toISOString())
    .single();

  if (!session) return null;

  const { data: user } = await supabase
    .from("users")
    .select("*")
    .eq("id", session.user_id as string)
    .single();

  if (!user) return null;
  return { user, session };
}

async function requireAdminAuth(
  supabase: Awaited<ReturnType<typeof getSupabaseClient>>,
  authToken: string | undefined
): Promise<{ user: Record<string, unknown> | null; error: NextResponse | null }> {
  if (!authToken) {
    return { user: null, error: NextResponse.json({ error: "缺少token" }, { status: 401 }) };
  }
  const userData = await getUserByToken(supabase, authToken);
  if (!userData) {
    return { user: null, error: NextResponse.json({ error: "未登录或token已过期" }, { status: 401 }) };
  }
  const { user } = userData;
  if (user.role !== "admin" && user.role !== "super_admin") {
    return { user: null, error: NextResponse.json({ error: "权限不足" }, { status: 403 }) };
  }
  if (user.status !== "approved") {
    return { user: null, error: NextResponse.json({ error: "账号未审核通过" }, { status: 403 }) };
  }
  return { user, error: null };
}

async function logAudit(
  supabase: Awaited<ReturnType<typeof getSupabaseClient>>,
  adminId: string,
  adminUsername: string,
  action: string,
  targetType: string,
  targetId: string,
  details?: Record<string, unknown>
): Promise<void> {
  try {
    await supabase.from("audit_log").insert({
      operator_id: adminId,
      operator_username: adminUsername,
      action_type: action,
      target_type: targetType,
      target_id: targetId,
      details: details || {},
    });
  } catch (err) {
    console.error("审计日志写入失败:", err);
  }
}

async function checkDefaultPassword(
  plaintext: string,
  passwordHash: string | null,
  username: string | null
): Promise<boolean> {
  if (!plaintext || !passwordHash) return false;
  const commonDefaults = ["admin123", username || ""].filter(Boolean);
  for (const candidate of commonDefaults) {
    if (plaintext === candidate) return true;
    if (passwordHash.startsWith("$2")) {
      try {
        if (await bcrypt.compare(candidate, passwordHash)) return true;
      } catch {
        /* ignore */
      }
    }
  }
  return false;
}

async function createDefaultInviteCodes(
  supabase: Awaited<ReturnType<typeof getSupabaseClient>>,
  userId: string
): Promise<void> {
  const quota = parseInt(process.env.INVITE_QUOTA_DEFAULT || "10", 10);
  const { count } = await supabase
    .from("invite_codes")
    .select("*", { count: "exact", head: true })
    .eq("owner_id", userId);
  if ((count ?? 0) > 0) return;

  const codes: string[] = [];
  for (let i = 0; i < quota; i++) {
    let code = generateInviteCode("MIMI-");
    let attempts = 0;
    while (attempts < 5) {
      const { data: existing } = await supabase
        .from("invite_codes")
        .select("code")
        .eq("code", code)
        .single();
      if (!existing) break;
      code = generateInviteCode("MIMI-");
      attempts++;
    }
    codes.push(code);
  }

  const insertData = codes.map((code) => ({
    code,
    owner_id: userId,
    role_type: "user",
    status: "active",
    created_at: new Date().toISOString(),
  }));

  const { error } = await supabase.from("invite_codes").insert(insertData);
  if (error) {
    console.error("自动生成邀请码失败:", error);
  } else {
    await supabase
      .from("users")
      .update({ invite_quota: quota })
      .eq("id", userId);
  }
}

async function cascadingBan(
  supabase: Awaited<ReturnType<typeof getSupabaseClient>>,
  userId: string,
  reason: string,
  adminUser: { id: string; username: string | null },
  visited = new Set<string>()
): Promise<number> {
  if (visited.has(userId)) return 0;
  visited.add(userId);

  const { data: invites } = await supabase
    .from("invite_codes")
    .select("used_by")
    .eq("owner_id", userId)
    .eq("status", "used")
    .not("used_by", "is", null);

  let bannedCount = 0;
  if (!invites || invites.length === 0) return 0;

  for (const invite of invites) {
    const downstreamId = invite.used_by as string;
    if (!downstreamId || visited.has(downstreamId)) continue;

    const { data: target } = await supabase
      .from("users")
      .select("ban_status")
      .eq("id", downstreamId)
      .single();
    if (!target) continue;
    if (target.ban_status === "perma_banned" || target.ban_status === "temp_banned") continue;

    const banUntil = new Date();
    banUntil.setDate(banUntil.getDate() + 30);

    await supabase
      .from("users")
      .update({
        ban_status: "temp_banned",
        ban_reason: `连坐封禁：上游用户被封禁/拒绝。${reason}`,
        ban_until: banUntil.toISOString(),
        banned_by: adminUser.id,
        banned_at: new Date().toISOString(),
        violation_count: 1,
      })
      .eq("id", downstreamId);

    await logAudit(supabase, adminUser.id, String(adminUser.username ?? ""), "cascading_ban", "user", downstreamId, {
      upstream_id: userId,
      reason,
      banned_by: adminUser.username,
    });

    bannedCount += 1;
    bannedCount += await cascadingBan(supabase, downstreamId, reason, adminUser, visited);
  }

  return bannedCount;
}

async function applyInviterViolation(
  supabase: Awaited<ReturnType<typeof getSupabaseClient>>,
  userId: string,
  adminUser: { id: string; username: string | null }
): Promise<{ inviterId: string | null; penalty: string }> {
  const { data: invite } = await supabase
    .from("invite_codes")
    .select("owner_id")
    .eq("used_by", userId)
    .eq("status", "used")
    .single();

  const inviterId = invite?.owner_id as string | null;
  if (!inviterId) return { inviterId: null, penalty: "none" };

  const { data: inviter } = await supabase
    .from("users")
    .select("violation_count, invite_quota, vote_weight, username")
    .eq("id", inviterId)
    .single();
  if (!inviter) return { inviterId, penalty: "none" };

  const nextCount = (inviter.violation_count || 0) + 1;
  let penalty = "warning";
  const updates: Record<string, unknown> = { violation_count: nextCount };

  if (nextCount === 2) {
    penalty = "quota_minus_5";
    updates.invite_quota = Math.max(0, (inviter.invite_quota || 0) - 5);
  } else if (nextCount === 3) {
    penalty = "quota_zero";
    updates.invite_quota = 0;
  } else if (nextCount >= 4) {
    penalty = "vote_weight_half";
    updates.vote_weight = 0.5;
  }

  await supabase.from("users").update(updates).eq("id", inviterId);

  await logAudit(supabase, adminUser.id, String(adminUser.username ?? ""), "inviter_violation", "user", inviterId, {
    downstream_id: userId,
    previous_count: inviter.violation_count,
    new_count: nextCount,
    penalty,
    inviter_username: inviter.username,
  });

  return { inviterId, penalty };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      action,
      username,
      password,
      displayName,
      deviceInfo,
      token,
      targetUserId,
      targetUserIds,
      invitationCode,
      weiboName,
      reason,
      authToken,
      currentPassword,
      newPassword,
      newDisplayName,
      bio,
      count,
      roleType,
      code,
      owner_id,
    } = body;

    const supabase = await getSupabaseClient();

    // 速率限制：注册/登录更严格（同一IP每分钟5次）
    if (action === "register" || action === "login") {
      const limit = rateLimit(request, `auth:${action}`, 5, 60);
      if (!limit.allowed) {
        return NextResponse.json(
          { error: "请求过于频繁，请稍后再试" },
          { status: 429, headers: { "X-RateLimit-Reset": String(limit.resetAt) } }
        );
      }
    }

    // 写操作/admin操作通用限流（每分钟30次）
    if (
      action &&
      !["register", "login", "get_session", "list_pending_users", "list_users", "get_invite_settings"].includes(action as string)
    ) {
      const limit = rateLimit(request, `auth:${action as string}`, 30, 60);
      if (!limit.allowed) {
        return NextResponse.json(
          { error: "请求过于频繁，请稍后再试" },
          { status: 429, headers: { "X-RateLimit-Reset": String(limit.resetAt) } }
        );
      }
    }

    // ========== 注册 ==========
    if (action === "register") {
      if (!username || !password || !invitationCode || !weiboName) {
        return NextResponse.json(
          { error: "请填写用户名、密码、微博昵称和邀请码" },
          { status: 400 }
        );
      }

      const { data: existing } = await supabase
        .from("users")
        .select("id")
        .eq("username", username)
        .single();

      if (existing) {
        return NextResponse.json(
          { error: "用户名已存在，请换一个" },
          { status: 409 }
        );
      }

      if (password.toLowerCase() === username.toLowerCase()) {
        return NextResponse.json(
          { error: "密码不能和用户名相同，请设置一个不同的密码" },
          { status: 400 }
        );
      }

      const normalizedCode = invitationCode.toUpperCase().trim();

      // 验证邀请码
      const { data: invite } = await supabase
        .from("invite_codes")
        .select("*")
        .eq("code", normalizedCode)
        .single();

      if (!invite) {
        return NextResponse.json(
          { error: "邀请码无效" },
          { status: 400 }
        );
      }

      if (invite.revoked_at) {
        return NextResponse.json(
          { error: "邀请码已作废" },
          { status: 400 }
        );
      }

      if (invite.used_by) {
        return NextResponse.json(
          { error: "邀请码已被使用" },
          { status: 400 }
        );
      }

      if (invite.status !== "active") {
        return NextResponse.json(
          { error: "邀请码无效或已被使用" },
          { status: 400 }
        );
      }

      // 不可自邀：如果请求带了登录 token，且登录用户就是邀请码拥有者
      const selfInviteCheck = authToken
        ? await getUserByToken(supabase, authToken as string)
        : null;
      if (selfInviteCheck && selfInviteCheck.user.id === invite.owner_id) {
        return NextResponse.json(
          { error: "不能使用自己生成的邀请码注册" },
          { status: 400 }
        );
      }

      const role = invite.role_type === "admin" ? "admin" : "user";
      const passwordHash = await bcrypt.hash(password, 10);

      const { data, error } = await supabase
        .from("users")
        .insert({
          username,
          password: passwordHash,
          display_name: displayName || username,
          weibo_name: weiboName,
          role,
          status: "pending",
          invite_code_used: normalizedCode,
          referrer_id: invite.owner_id,
        })
        .select()
        .single();

      if (error) {
        console.error("注册失败:", error);
        return NextResponse.json(
          { error: "注册失败: " + error.message },
          { status: 500 }
        );
      }

      // 标记邀请码已使用
      await supabase
        .from("invite_codes")
        .update({
          used_by: data.id,
          status: "used",
          used_at: new Date().toISOString(),
        })
        .eq("code", normalizedCode);

      return NextResponse.json({
        success: true,
        pending: true,
        message: "注册成功，请等待管理员审核",
        data: {
          id: data.id,
          username: data.username,
          status: data.status,
          role: data.role,
        },
      });
    }

    // ========== 登录 ==========
    if (action === "login") {
      if (!username || !password) {
        return NextResponse.json(
          { error: "请输入用户名和密码" },
          { status: 400 }
        );
      }

      // 首次启动：如果数据库中没有 admin 且配置了 bootstrap 账号，自动创建
      const bootstrapUsername = process.env.BOOTSTRAP_ADMIN_USERNAME;
      const bootstrapPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD;
      if (bootstrapUsername && bootstrapPassword) {
        const { count: adminCount, error: adminCountError } = await supabase
          .from("users")
          .select("*", { count: "exact", head: true })
          .in("role", ["admin", "super_admin"]);
        if (!adminCountError && (adminCount === 0 || adminCount === null)) {
          const bootstrapHash = await bcrypt.hash(bootstrapPassword, 10);
          await supabase.from("users").insert({
            username: bootstrapUsername,
            password: bootstrapHash,
            display_name: bootstrapUsername,
            role: "super_admin",
            status: "approved",
            weibo_name: "",
          });
        }
      }

      const { data: user, error } = await supabase
        .from("users")
        .select("*")
        .eq("username", username)
        .single();

      if (error || !user) {
        return NextResponse.json(
          { error: "用户不存在，请先注册" },
          { status: 404 }
        );
      }

      let passwordValid = false;
      let needsHashUpgrade = false;
      if (user.password.startsWith("$2")) {
        passwordValid = await bcrypt.compare(password, user.password);
      } else {
        passwordValid = user.password === password;
        needsHashUpgrade = passwordValid;
      }

      if (!passwordValid) {
        return NextResponse.json(
          { error: "密码错误" },
          { status: 401 }
        );
      }

      if (needsHashUpgrade) {
        const newHash = await bcrypt.hash(password, 10);
        await supabase.from("users").update({ password: newHash }).eq("id", user.id);
        user.password = newHash;
      }

      if (user.status === "pending") {
        return NextResponse.json(
          { error: "账号正在等待审核，请稍后再试" },
          { status: 403 }
        );
      }

      if (user.status === "rejected") {
        return NextResponse.json(
          { error: "账号审核未通过，请联系管理员" },
          { status: 403 }
        );
      }

      // 封禁状态检查
      const banStatus = user.ban_status as string;
      if (banStatus === "perma_banned") {
        return NextResponse.json(
          {
            error: "账号已被永久封禁",
            banStatus,
            banReason: user.ban_reason || "",
          },
          { status: 403 }
        );
      }
      if (banStatus === "temp_banned" && user.ban_until) {
        const banUntil = new Date(user.ban_until as string).getTime();
        if (banUntil > Date.now()) {
          return NextResponse.json(
            {
              error: `账号被临时封禁，解封时间：${new Date(
                banUntil
              ).toLocaleString()}`,
              banStatus,
              banReason: user.ban_reason || "",
              banUntil: user.ban_until,
            },
            { status: 403 }
          );
        }
      }

      await supabase.from("user_sessions").delete().eq("user_id", user.id);

      const newToken = randomUUID();
      const { error: sessionError } = await supabase.from("user_sessions").insert({
        user_id: user.id,
        token: newToken,
        device_info: deviceInfo || "未知设备",
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      });

      if (sessionError) {
        console.error("创建会话失败:", sessionError);
      }

      const isAdminUser = isAdmin(user) || isSuperAdmin(user);
      const isDefaultPassword = await checkDefaultPassword(
        password,
        user.password,
        user.username
      );

      return NextResponse.json({
        success: true,
        data: {
          id: user.id,
          username: user.username,
          displayName: user.display_name,
          level: user.level,
          role: user.role || "user",
          weiboVerified: user.weibo_verified,
          weiboUid: user.weibo_uid,
          weiboName: user.weibo_name,
          weiboLink: user.weibo_link || "",
          userBio: user.user_bio || "",
          isAdmin: isAdminUser,
          isDefaultPassword,
          token: newToken,
        },
      });
    }

    // ========== 验证 Token ==========
    if (action === "validate") {
      if (!token) {
        return NextResponse.json({ valid: false, error: "缺少 token" });
      }

      const found = await getUserByToken(supabase, token as string);
      if (!found) {
        return NextResponse.json({ valid: false, error: "登录已过期，请重新登录" });
      }

      const u = found.user;
      if (u.status !== "approved") {
        return NextResponse.json({ valid: false, error: "账号状态异常" });
      }

      const isAdminUser = isAdmin(u) || isSuperAdmin(u);

      return NextResponse.json({
        valid: true,
        data: {
          id: u.id,
          username: u.username,
          displayName: u.display_name,
          level: u.level,
          role: u.role || "user",
          weiboVerified: u.weibo_verified,
          weiboUid: u.weibo_uid,
          weiboName: u.weibo_name,
          weiboLink: u.weibo_link || "",
          userBio: u.user_bio || "",
          isAdmin: isAdminUser,
        },
      });
    }

    // ========== 登出 ==========
    if (action === "logout") {
      if (token) {
        await supabase.from("user_sessions").delete().eq("token", token);
      }
      return NextResponse.json({ success: true });
    }

    // ========== 获取待审核用户列表 ==========
    if (action === "list_pending_users") {
      if (!authToken) {
        return NextResponse.json({ error: "缺少 token" }, { status: 401 });
      }

      const found = await getUserByToken(supabase, authToken as string);
      if (!found || (!isSuperAdmin(found.user) && !isAdmin(found.user))) {
        return NextResponse.json({ error: "无权操作" }, { status: 403 });
      }

      const { data, error } = await supabase
        .from("users")
        .select(
          "id, username, display_name, weibo_name, invite_code_used, role, status, referrer_id, created_at"
        )
        .eq("status", "pending")
        .order("role", { ascending: false }) // admin 优先
        .order("created_at", { ascending: false });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      const users = data || [];
      const inviteCodes = users
        .map((u) => u.invite_code_used)
        .filter(Boolean) as string[];
      const codeOwnerMap: Record<string, { id: string; username: string; verify_status: string; ban_status: string }> = {};
      if (inviteCodes.length > 0) {
        const { data: codes } = await supabase
          .from("invite_codes")
          .select("code, owner_id")
          .in("code", inviteCodes);
        const ownerIds = Array.from(
          new Set((codes || []).map((c) => c.owner_id).filter(Boolean))
        ) as string[];
        if (ownerIds.length > 0) {
          const { data: owners } = await supabase
            .from("users")
            .select("id, username, status, ban_status")
            .in("id", ownerIds);
          (owners || []).forEach((o) => {
            codeOwnerMap[o.id] = {
              id: o.id,
              username: o.username,
              verify_status: o.status,
              ban_status: o.ban_status || "none",
            };
          });
        }
        const codeMap: Record<string, string> = {};
        (codes || []).forEach((c) => {
          if (c.owner_id) codeMap[c.code] = c.owner_id;
        });
        users.forEach((u) => {
          const ownerId = u.referrer_id || codeMap[u.invite_code_used];
          if (ownerId && codeOwnerMap[ownerId]) {
            const owner = codeOwnerMap[ownerId];
            (u as Record<string, unknown>).referrer_name = owner.username;
            (u as Record<string, unknown>).referrer_verify_status =
              owner.verify_status;
            (u as Record<string, unknown>).referrer_ban_status =
              owner.ban_status;
          }
        });
      }

      return NextResponse.json({ success: true, data: users });
    }

    async function finalizeReview(
      targetId: string,
      result: "approved" | "rejected" | "grace_period",
      reviewer: Record<string, unknown>,
      notes?: string
    ) {
      const { data: existingUser } = await supabase
        .from("users")
        .select("verify_status")
        .eq("id", targetId)
        .single();
      if (result === "approved" && existingUser?.verify_status === "verified") {
        return;
      }

      const now = new Date().toISOString();
      const updateData: Record<string, unknown> = {
        status: result === "approved" ? "approved" : result === "rejected" ? "rejected" : "grace_period",
        verify_status: result === "approved" ? "verified" : result === "rejected" ? "rejected" : "grace_period",
        reviewed_by: reviewer.id,
        reviewed_at: now,
        review_result: result,
      };
      if (result === "grace_period") {
        updateData.grace_period_end = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      }
      await supabase.from("users").update(updateData).eq("id", targetId);

      // 关闭待审分配记录
      const { data: activeAssignment } = await supabase
        .from("review_assignments")
        .select("id")
        .eq("user_id", targetId)
        .eq("status", "pending")
        .maybeSingle();
      if (activeAssignment) {
        await supabase
          .from("review_assignments")
          .update({
            status: "reviewed",
            reviewed_by: reviewer.id,
            reviewed_at: now,
            review_result: result,
            notes: notes || null,
          })
          .eq("id", activeAssignment.id);
      } else {
        // 没有分配记录也写入一条审核记录
        await supabase.from("review_assignments").insert({
          user_id: targetId,
          assigned_to: reviewer.id,
          assigned_at: now,
          status: "reviewed",
          reviewed_by: reviewer.id,
          reviewed_at: now,
          review_result: result,
          notes: notes || null,
        });
      }
    }

    // ========== 通过用户 ==========
    if (action === "approve_user") {
      if (!authToken || !targetUserId) {
        return NextResponse.json({ error: "缺少参数" }, { status: 400 });
      }

      const found = await getUserByToken(supabase, authToken as string);
      if (!found || (!isSuperAdmin(found.user) && !isAdmin(found.user))) {
        return NextResponse.json({ error: "无权操作" }, { status: 403 });
      }

      await finalizeReview(targetUserId as string, "approved", found.user);

      // 普通用户注册成功后自动生成默认数量普通用户邀请码
      await createDefaultInviteCodes(supabase, targetUserId as string);

      await logAudit(supabase, found.user.id as string, String(found.user.username ?? ""), "approve_user", "user", targetUserId as string, {
        reviewed_by: found.user.username,
      });

      return NextResponse.json({ success: true, message: "已通过" });
    }

    // ========== 批量通过用户 ==========
    if (action === "batch_approve_users") {
      if (!authToken || !targetUserIds || !Array.isArray(targetUserIds)) {
        return NextResponse.json({ error: "缺少参数" }, { status: 400 });
      }

      const found = await getUserByToken(supabase, authToken as string);
      if (!found || (!isSuperAdmin(found.user) && !isAdmin(found.user))) {
        return NextResponse.json({ error: "无权操作" }, { status: 403 });
      }

      const ids = (targetUserIds as string[]).filter(Boolean);
      if (ids.length === 0) {
        return NextResponse.json({ error: "未选择用户" }, { status: 400 });
      }

      const results = await Promise.allSettled(
        ids.map(async (uid) => {
          await finalizeReview(uid, "approved", found.user);
          await createDefaultInviteCodes(supabase, uid);
          await logAudit(supabase, found.user.id as string, String(found.user.username ?? ""), "approve_user", "user", uid, {
            reviewed_by: found.user.username,
            batch: true,
          });
          return uid;
        })
      );

      const succeeded = results.filter((r) => r.status === "fulfilled").length;
      const failed = results
        .filter((r): r is PromiseRejectedResult => r.status === "rejected")
        .map((r) => (r.reason instanceof Error ? r.reason.message : String(r.reason)));

      return NextResponse.json({
        success: true,
        data: { succeeded, failed, total: ids.length },
        message: `已通过 ${succeeded}/${ids.length} 人${failed.length > 0 ? `，${failed.length} 人失败` : ""}`,
      });
    }

    // ========== 拒绝用户 ==========
    if (action === "reject_user") {
      if (!authToken || !targetUserId) {
        return NextResponse.json({ error: "缺少参数" }, { status: 400 });
      }

      const found = await getUserByToken(supabase, authToken as string);
      if (!found || (!isSuperAdmin(found.user) && !isAdmin(found.user))) {
        return NextResponse.json({ error: "无权操作" }, { status: 403 });
      }

      const notes = (body.reason as string) || "";
      await finalizeReview(targetUserId as string, "rejected", found.user, notes);

      const bannedCount = await cascadingBan(
        supabase,
        targetUserId as string,
        notes || "用户被拒绝",
        { id: found.user.id as string, username: found.user.username as string | null }
      );
      const { penalty } = await applyInviterViolation(
        supabase,
        targetUserId as string,
        { id: found.user.id as string, username: found.user.username as string | null }
      );

      await logAudit(supabase, found.user.id as string, String(found.user.username ?? ""), "reject_user", "user", targetUserId as string, {
        reviewed_by: found.user.username,
        reason: notes,
        cascading_banned_count: bannedCount,
        inviter_penalty: penalty,
      });

      return NextResponse.json({ success: true, message: `已拒绝${bannedCount > 0 ? `，连坐封禁 ${bannedCount} 人` : ""}` });
    }

    // ========== 宽限期用户 ==========
    if (action === "grace_period_user") {
      if (!authToken || !targetUserId) {
        return NextResponse.json({ error: "缺少参数" }, { status: 400 });
      }

      const found = await getUserByToken(supabase, authToken as string);
      if (!found || (!isSuperAdmin(found.user) && !isAdmin(found.user))) {
        return NextResponse.json({ error: "无权操作" }, { status: 403 });
      }

      const notes = (body.reason as string) || "";
      await finalizeReview(targetUserId as string, "grace_period", found.user, notes);

      await logAudit(supabase, found.user.id as string, String(found.user.username ?? ""), "grace_period_user", "user", targetUserId as string, {
        reviewed_by: found.user.username,
        reason: notes,
      });

      return NextResponse.json({ success: true, message: "已设置宽限期" });
    }

    // ========== 获取所有用户列表（支持搜索/筛选/分页） ==========
    if (action === "list_users") {
      const { user: adminUser, error: authError } = await requireAdminAuth(supabase, authToken);
      if (authError || !adminUser) return authError!;

      const search = (body.search as string)?.trim() || "";
      const status = body.status as string;
      const violation = body.violation as string;
      const page = Math.max(1, parseInt(String(body.page || "1"), 10));
      const pageSize = Math.min(
        100,
        Math.max(1, parseInt(String(body.pageSize || "20"), 10))
      );

      let query = supabase.from("users").select(
        "id, username, display_name, level, role, status, verify_status, weibo_verified, weibo_uid, weibo_name, weibo_link, weibo_level, created_at, reviewed_at, reviewed_by, review_result, referrer_id, ban_status, ban_until, violation_count, invite_quota",
        { count: "exact" }
      );

      if (search) {
        query = query.or(`username.ilike.%${search}%,weibo_name.ilike.%${search}%,id.ilike.%${search}%`);
      }
      if (status && status !== "all") {
        if (status === "pending" || status === "approved" || status === "rejected") {
          query = query.eq("status", status);
        } else if (status === "banned") {
          query = query.in("ban_status", ["temp_banned", "perma_banned"]);
        }
      }
      if (violation && violation !== "all") {
        if (violation === ">0") {
          query = query.gt("violation_count", 0);
        } else if (violation === ">=3") {
          query = query.gte("violation_count", 3);
        }
      }

      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      const { data, error, count } = await query
        .order("created_at", { ascending: false })
        .range(from, to);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      const users = (data || []) as Record<string, unknown>[];
      const referrerIds = Array.from(
        new Set(users.map((u) => u.referrer_id).filter(Boolean))
      ) as string[];
      const reviewerIds = Array.from(
        new Set(users.map((u) => u.reviewed_by).filter(Boolean))
      ) as string[];
      const userIds = users.map((u) => u.id as string);

      let referrerMap: Record<string, string> = {};
      if (referrerIds.length > 0) {
        const { data: refs } = await supabase
          .from("users")
          .select("id, username")
          .in("id", referrerIds);
        referrerMap = (refs || []).reduce(
          (acc, r) => {
            acc[r.id] = r.username;
            return acc;
          },
          {} as Record<string, string>
        );
      }

      let reviewerMap: Record<string, string> = {};
      if (reviewerIds.length > 0) {
        const { data: revs } = await supabase
          .from("users")
          .select("id, username")
          .in("id", reviewerIds);
        reviewerMap = (revs || []).reduce(
          (acc, r) => {
            acc[r.id] = r.username;
            return acc;
          },
          {} as Record<string, string>
        );
      }

      const inviteCountMap: Record<string, number> = {};
      if (userIds.length > 0) {
        const { data: usedCodes } = await supabase
          .from("invite_codes")
          .select("owner_id, used_by")
          .in("owner_id", userIds)
          .not("used_by", "is", null);
        usedCodes?.forEach((c) => {
          inviteCountMap[c.owner_id] = (inviteCountMap[c.owner_id] || 0) + 1;
        });
      }

      const list = users.map((u) => ({
        ...u,
        referrer_name: referrerMap[u.referrer_id as string] || null,
        reviewer_name: reviewerMap[u.reviewed_by as string] || null,
        invite_count: inviteCountMap[u.id as string] || 0,
      }));

      return NextResponse.json({
        success: true,
        data: {
          list,
          total: count || 0,
          page,
          pageSize,
        },
      });
    }

    // ========== 封禁/处罚用户 ==========
    if (action === "ban_user") {
      const { user: adminUser, error: authError } = await requireAdminAuth(supabase, authToken);
      if (authError || !adminUser) return authError!;

      const banTargetId = body.targetUserId as string;
      const banStatus = body.banStatus as string;
      const banReason = (body.reason as string) || "";
      const duration = body.duration ? parseInt(String(body.duration), 10) : 0;

      if (!banTargetId || !banStatus) {
        return NextResponse.json(
          { error: "缺少必要参数" },
          { status: 400 }
        );
      }

      const validStatuses = [
        "none",
        "warning",
        "muted",
        "restricted",
        "temp_banned",
        "perma_banned",
      ];
      if (!validStatuses.includes(banStatus)) {
        return NextResponse.json(
          { error: "无效的封禁状态" },
          { status: 400 }
        );
      }

      const { data: targetUser } = await supabase
        .from("users")
        .select("id, role, status, violation_count, referrer_id")
        .eq("id", banTargetId)
        .single();

      if (!targetUser) {
        return NextResponse.json({ error: "用户不存在" }, { status: 404 });
      }

      if (targetUser.role === "super_admin") {
        return NextResponse.json(
          { error: "不能处罚超级管理员" },
          { status: 403 }
        );
      }
      if (targetUser.role === "admin" && adminUser.role !== "super_admin") {
        return NextResponse.json(
          { error: "只有超级管理员可以处罚管理员" },
          { status: 403 }
        );
      }

      const now = new Date().toISOString();
      const banUntil =
        banStatus === "temp_banned" && duration > 0
          ? new Date(Date.now() + duration * 24 * 60 * 60 * 1000).toISOString()
          : null;

      let updateData: Record<string, unknown> = {};
      if (banStatus === "none") {
        updateData = {
          ban_status: "none",
          ban_reason: null,
          ban_until: null,
          banned_by: null,
          banned_at: null,
        };
      } else {
        updateData = {
          ban_status: banStatus,
          ban_reason: banReason,
          ban_until: banUntil,
          banned_by: adminUser.id,
          banned_at: now,
        };
      }

      // 对于非解除、非警告操作，增加违规次数
      if (banStatus !== "none" && banStatus !== "warning") {
        updateData.violation_count = ((targetUser.violation_count || 0) as number) + 1;
      }

      const { error: updateError } = await supabase
        .from("users")
        .update(updateData)
        .eq("id", banTargetId);

      if (updateError) {
        return NextResponse.json(
          { error: "操作失败: " + updateError.message },
          { status: 500 }
        );
      }

      // 临时/永久封禁时撤销其所有可用邀请码
      if (banStatus === "temp_banned" || banStatus === "perma_banned") {
        await supabase
          .from("invite_codes")
          .update({ status: "revoked", revoked_at: now })
          .eq("owner_id", banTargetId)
          .in("status", ["active"]);
      }

      await logAudit(supabase, adminUser.id as string, String(adminUser.username ?? ""), "ban_user", "user", banTargetId, {
        ban_status: banStatus,
        reason: banReason,
        duration,
        ban_until: banUntil,
      });

      // 连坐惩罚：临时/永久封禁时递归封禁下游邀请链路并阶梯惩罚邀请人
      if (banStatus === "temp_banned" || banStatus === "perma_banned") {
        const bannedCount = await cascadingBan(
          supabase,
          banTargetId,
          banReason || "上游用户被封禁",
          { id: adminUser.id as string, username: adminUser.username as string | null }
        );
        const { penalty } = await applyInviterViolation(
          supabase,
          banTargetId,
          { id: adminUser.id as string, username: adminUser.username as string | null }
        );
        await logAudit(supabase, adminUser.id as string, String(adminUser.username ?? ""), "collective_punishment", "user", banTargetId, {
          ban_status: banStatus,
          cascading_banned_count: bannedCount,
          inviter_penalty: penalty,
        });
      }

      return NextResponse.json({
        success: true,
        message: banStatus === "none" ? "已解除处罚" : "处罚已生效",
      });
    }

    // ========== 角色管理 ==========
    if (action === "set_role") {
      const { user: adminUser, error: authError } = await requireAdminAuth(supabase, authToken);
      if (authError || !adminUser) return authError!;

      // 细粒度权限：角色设置仅限超级管理员
      if (adminUser.role !== "super_admin") {
        return NextResponse.json(
          { error: "权限不足：只有超级管理员可以设置角色" },
          { status: 403 }
        );
      }

      const { targetUserId: roleTargetId, role } = body;

      if (!roleTargetId || !role) {
        return NextResponse.json(
          { error: "缺少必要参数" },
          { status: 400 }
        );
      }

      const validRoles = ["user", "admin", "super_admin"];
      if (!validRoles.includes(role)) {
        return NextResponse.json({ error: "无效的角色" }, { status: 400 });
      }

      const { error } = await supabase
        .from("users")
        .update({ role })
        .eq("id", roleTargetId);

      if (error) {
        console.error("更新角色失败:", error);
        return NextResponse.json({ error: "更新角色失败" }, { status: 500 });
      }

      await logAudit(supabase, adminUser.id as string, String(adminUser.username ?? ""), "set_role", "user", roleTargetId as string, {
        new_role: role,
      });

      return NextResponse.json({ success: true, message: `角色已更新为 ${role}` });
    }

    // ========== 获取邀请码设置 ==========
    if (action === "get_invite_settings") {
      const { user: adminUser, error: authError } = await requireAdminAuth(supabase, authToken);
      if (authError || !adminUser) return authError!;

      const { data } = await supabase.from("system_settings").select("*");

      const settings: Record<string, string> = {};
      if (data) {
        data.forEach((item: { key: string; value: string }) => {
          settings[item.key] = item.value;
        });
      }

      return NextResponse.json({ success: true, data: settings });
    }

    // ========== 修改密码/昵称 ==========
    if (action === "change_password") {
      if (!authToken || !currentPassword || !newPassword) {
        return NextResponse.json(
          { error: "缺少必要参数" },
          { status: 400 }
        );
      }

      if (newPassword.length < 4) {
        return NextResponse.json(
          { error: "新密码至少4位" },
          { status: 400 }
        );
      }

      const found = await getUserByToken(supabase, authToken as string);
      if (!found) {
        return NextResponse.json(
          { error: "登录已过期，请重新登录" },
          { status: 401 }
        );
      }

      const user = found.user;
      const validCurrent = await bcrypt.compare(
        currentPassword as string,
        user.password as string
      );
      if (!validCurrent) {
        return NextResponse.json(
          { error: "当前密码错误" },
          { status: 403 }
        );
      }

      const hashedNew = await bcrypt.hash(newPassword as string, 10);
      const updateData: Record<string, unknown> = { password: hashedNew };
      if (newDisplayName && newDisplayName.trim()) {
        updateData.display_name = newDisplayName.trim();
      }

      const { error } = await supabase
        .from("users")
        .update(updateData)
        .eq("id", user.id);

      if (error) {
        console.error("修改密码失败:", error);
        return NextResponse.json(
          { error: "修改失败: " + error.message },
          { status: 500 }
        );
      }

      await supabase.from("user_sessions").delete().eq("user_id", user.id);

      return NextResponse.json({
        success: true,
        message: "修改成功，请使用新密码重新登录",
      });
    }

    // ========== 更新个人自传 ==========
    if (action === "update_bio") {
      if (!authToken || bio === undefined) {
        return NextResponse.json(
          { error: "缺少必要参数" },
          { status: 400 }
        );
      }

      const bioText = String(bio).trim();
      if (bioText.length > 500) {
        return NextResponse.json(
          { error: "自传最多500字" },
          { status: 400 }
        );
      }

      const found = await getUserByToken(supabase, authToken as string);
      if (!found) {
        return NextResponse.json(
          { error: "登录已过期" },
          { status: 401 }
        );
      }

      if (!isAdmin(found.user) && !isSuperAdmin(found.user)) {
        return NextResponse.json(
          { error: "无权操作：需要管理员身份" },
          { status: 403 }
        );
      }

      const { error } = await supabase
        .from("users")
        .update({ user_bio: bioText })
        .eq("id", found.user.id);

      if (error) {
        console.error("更新自传失败:", error);
        return NextResponse.json(
          { error: "更新失败: " + error.message },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        message: "自传更新成功",
        data: { user_bio: bioText },
      });
    }

    // ========== 生成邀请码 ==========
    if (action === "generate_invite_codes") {
      const inviteLimit = rateLimit(request, "auth:generate_invite_codes", 5, 60);
      if (!inviteLimit.allowed) {
        return NextResponse.json(
          { error: "生成邀请码过于频繁，请稍后再试" },
          { status: 429, headers: { "X-RateLimit-Reset": String(inviteLimit.resetAt) } }
        );
      }
      if (!authToken || !count || count < 1) {
        return NextResponse.json(
          { error: "缺少必要参数" },
          { status: 400 }
        );
      }

      const found = await getUserByToken(supabase, authToken as string);
      if (!found || (!isSuperAdmin(found.user) && !isAdmin(found.user))) {
        return NextResponse.json(
          { error: "无权操作：需要管理员身份" },
          { status: 403 }
        );
      }

      const user = found.user;
      const targetRole = roleType === "admin" ? "admin" : "user";

      // 普通管理员只能生成普通用户邀请码
      if (!isSuperAdmin(user) && targetRole === "admin") {
        return NextResponse.json(
          { error: "只有大管理员可以生成管理员邀请码" },
          { status: 403 }
        );
      }

      // 普通管理员最多持有 10 个邀请码（已用+未用）
      if (!isSuperAdmin(user)) {
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

        if ((existingCount || 0) + (count as number) > 10) {
          return NextResponse.json(
            { error: "普通管理员最多拥有 10 个邀请码" },
            { status: 403 }
          );
        }
      }

      const generateCount = Math.min(count as number, isSuperAdmin(user) ? 1000 : 10);
      const prefix = targetRole === "admin" ? "ADMIN-" : "MIMI-";
      const codes: string[] = [];

      for (let i = 0; i < generateCount; i++) {
        let code = generateInviteCode(prefix);
        let attempts = 0;
        while (attempts < 5) {
          const { data: existing } = await supabase
            .from("invite_codes")
            .select("code")
            .eq("code", code)
            .single();
          if (!existing) break;
          code = generateInviteCode(prefix);
          attempts++;
        }
        codes.push(code);
      }

      const insertData = codes.map((code) => ({
        code,
        owner_id: user.id,
        role_type: targetRole,
        status: "active",
        created_at: new Date().toISOString(),
      }));

      const { error } = await supabase.from("invite_codes").insert(insertData);

      if (error) {
        console.error("生成邀请码失败:", error);
        return NextResponse.json(
          { error: "生成失败: " + error.message },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        data: codes,
        message: `成功生成 ${codes.length} 个邀请码`,
      });
    }

    // ========== 获取我的邀请码 ==========
    if (action === "list_my_invite_codes") {
      if (!authToken) {
        return NextResponse.json(
          { error: "缺少 token" },
          { status: 400 }
        );
      }

      const found = await getUserByToken(supabase, authToken as string);
      if (!found) {
        return NextResponse.json(
          { error: "登录已过期" },
          { status: 401 }
        );
      }

      const { data, error } = await supabase
        .from("invite_codes")
        .select("code, owner_id, role_type, status, used_by, created_at, used_at, revoked_at")
        .eq("owner_id", found.user.id)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("获取邀请码失败:", error);
        return NextResponse.json(
          { error: "获取失败: " + error.message },
          { status: 500 }
        );
      }

      const codes = data || [];
      const usedByIds = Array.from(
        new Set(codes.map((c) => c.used_by).filter(Boolean))
      );
      let usersMap: Record<string, string> = {};
      if (usedByIds.length > 0) {
        const { data: usersData } = await supabase
          .from("users")
          .select("id, username")
          .in("id", usedByIds);
        usersMap = (usersData || []).reduce(
          (acc, u) => {
            acc[u.id] = u.username;
            return acc;
          },
          {} as Record<string, string>
        );
      }

      return NextResponse.json({
        success: true,
        data: codes.map((c) => ({
          ...c,
          used_by_username: c.used_by ? usersMap[c.used_by] || c.used_by : null,
        })),
      });
    }

    // ========== 管理员获取全部邀请码 ==========
    if (action === "list_all_invite_codes") {
      const { user: adminUser, error: adminError } = await requireAdminAuth(supabase, authToken);
      if (adminError || !adminUser) {
        return adminError || NextResponse.json({ error: "无权限" }, { status: 403 });
      }

      const ownerId = owner_id as string | undefined;
      let query = supabase
        .from("invite_codes")
        .select("code, owner_id, role_type, status, used_by, created_at, used_at, revoked_at")
        .order("created_at", { ascending: false });
      if (ownerId) {
        query = query.eq("owner_id", ownerId);
      }
      const { data, error } = await query;
      if (error) {
        return NextResponse.json({ error: "获取失败: " + error.message }, { status: 500 });
      }
      const codes = data || [];
      const userIds = Array.from(
        new Set([
          ...codes.map((c) => c.owner_id),
          ...codes.map((c) => c.used_by).filter(Boolean),
        ])
      );
      let usersMap: Record<string, string> = {};
      if (userIds.length > 0) {
        const { data: usersData } = await supabase
          .from("users")
          .select("id, username")
          .in("id", userIds);
        usersMap = (usersData || []).reduce(
          (acc, u) => {
            acc[u.id] = u.username;
            return acc;
          },
          {} as Record<string, string>
        );
      }

      return NextResponse.json({
        success: true,
        data: codes.map((c) => ({
          ...c,
          owner_username: usersMap[c.owner_id] || c.owner_id,
          used_by_username: c.used_by ? usersMap[c.used_by] || c.used_by : null,
        })),
      });
    }

    // ========== 作废邀请码 ==========
    if (action === "revoke_invite_code") {
      if (!authToken || !code) {
        return NextResponse.json(
          { error: "缺少参数" },
          { status: 400 }
        );
      }

      const found = await getUserByToken(supabase, authToken as string);
      if (!found) {
        return NextResponse.json(
          { error: "登录已过期" },
          { status: 401 }
        );
      }

      const { data: invite } = await supabase
        .from("invite_codes")
        .select("owner_id, used_by")
        .eq("code", (code as string).toUpperCase().trim())
        .single();

      if (!invite) {
        return NextResponse.json({ error: "邀请码不存在" }, { status: 404 });
      }

      if (invite.owner_id !== found.user.id && !isSuperAdmin(found.user)) {
        return NextResponse.json({ error: "无权操作" }, { status: 403 });
      }

      if (invite.used_by) {
        return NextResponse.json(
          { error: "已使用的邀请码不能作废" },
          { status: 400 }
        );
      }

      const { error } = await supabase
        .from("invite_codes")
        .update({
          status: "revoked",
          revoked_at: new Date().toISOString(),
        })
        .eq("code", (code as string).toUpperCase().trim());

      if (error) {
        return NextResponse.json(
          { error: "作废失败: " + error.message },
          { status: 500 }
        );
      }

      return NextResponse.json({ success: true, message: "已作废" });
    }

    return NextResponse.json(
      { error: "无效的操作" },
      { status: 400 }
    );
  } catch (err) {
    console.error("Auth API error:", err);
    return NextResponse.json(
      { error: "服务器错误" },
      { status: 500 }
    );
  }
}
