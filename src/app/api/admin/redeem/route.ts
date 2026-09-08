import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { requireAdmin, extractTokenFromRequest, logAudit } from "@/lib/auth";
import {
  generateRedeemCode,
  normalizeCode,
  validateRewardAmount,
  validateMaxUses,
} from "@/lib/redeem";

export async function POST(request: NextRequest) {
  try {
    const token = await extractTokenFromRequest(request);
    const admin = await requireAdmin(token);
    const supabase = getSupabaseClient();
    const body = await request.json();
    const { action } = body;

    // ========== 创建兑换码 ==========
    if (action === "create") {
      const { customCode, rewardAmount, maxUses, expiresInDays } = body;

      const amountCheck = validateRewardAmount(rewardAmount);
      if (!amountCheck.valid) {
        return NextResponse.json({ error: amountCheck.error }, { status: 400 });
      }

      const usesCheck = validateMaxUses(maxUses);
      if (!usesCheck.valid) {
        return NextResponse.json({ error: usesCheck.error }, { status: 400 });
      }

      let code: string;
      if (customCode) {
        code = normalizeCode(customCode);
        // 检查是否已存在
        const { data: existing } = await supabase
          .from("redeem_codes")
          .select("code")
          .eq("code", code)
          .single();
        if (existing) {
          return NextResponse.json({ error: "兑换码已存在" }, { status: 409 });
        }
      } else {
        // 自动生成唯一码
        let attempts = 0;
        do {
          code = generateRedeemCode();
          const { data: existing } = await supabase
            .from("redeem_codes")
            .select("code")
            .eq("code", code)
            .single();
          if (!existing) break;
          attempts++;
        } while (attempts < 10);
      }

      const expiresAt = expiresInDays
        ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString()
        : null;

      const { data, error } = await supabase
        .from("redeem_codes")
        .insert({
          code,
          reward_amount: rewardAmount,
          max_uses: maxUses,
          used_count: 0,
          status: "active",
          expires_at: expiresAt,
          created_by: admin.id,
        })
        .select()
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      await logAudit(admin.id, admin.username, "create_redeem_code", "redeem_code", code!, {
        rewardAmount,
        maxUses,
        expiresInDays,
      });

      return NextResponse.json({ success: true, data });
    }

    // ========== 查询兑换码列表 ==========
    if (action === "list_codes") {
      const { data, error } = await supabase
        .from("redeem_codes")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, data: data || [] });
    }

    // ========== 查询兑换记录 ==========
    if (action === "list_logs") {
      const { code, userId, page = 1, pageSize = 50 } = body;

      let query = supabase
        .from("redeem_logs")
        .select("*")
        .order("redeemed_at", { ascending: false })
        .range((page - 1) * pageSize, page * pageSize - 1);

      if (code) {
        query = query.eq("code", normalizeCode(code));
      }
      if (userId) {
        query = query.eq("user_id", userId);
      }

      const { data, error } = await query;
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      // 获取总数
      let countQuery = supabase
        .from("redeem_logs")
        .select("*", { count: "exact", head: true });
      if (code) countQuery = countQuery.eq("code", normalizeCode(code));
      if (userId) countQuery = countQuery.eq("user_id", userId);
      const { count } = await countQuery;

      return NextResponse.json({
        success: true,
        data: data || [],
        total: count || 0,
        page,
        pageSize,
      });
    }

    // ========== 禁用/启用兑换码 ==========
    if (action === "toggle_status") {
      const { code, status } = body;
      if (!code || !["active", "disabled"].includes(status)) {
        return NextResponse.json({ error: "参数无效" }, { status: 400 });
      }

      const normalizedCode = normalizeCode(code);
      const { error } = await supabase
        .from("redeem_codes")
        .update({ status })
        .eq("code", normalizedCode);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      await logAudit(admin.id, admin.username, "toggle_redeem_status", "redeem_code", normalizedCode, {
        status,
      });

      return NextResponse.json({ success: true });
    }

    // ========== 删除兑换码 ==========
    if (action === "delete") {
      const { code } = body;
      if (!code) {
        return NextResponse.json({ error: "缺少兑换码" }, { status: 400 });
      }

      const normalizedCode = normalizeCode(code);

      // 先删除相关记录
      await supabase.from("redeem_logs").delete().eq("code", normalizedCode);
      const { error } = await supabase.from("redeem_codes").delete().eq("code", normalizedCode);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      await logAudit(admin.id, admin.username, "delete_redeem_code", "redeem_code", normalizedCode, {});

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "无效的操作" }, { status: 400 });
  } catch (err) {
    if (err instanceof Error && (err.message === "未登录或登录已过期" || err.message === "需要管理员权限")) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    console.error("Admin Redeem API error:", err);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}
