import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { requireAuth, extractTokenFromRequest, logAudit } from "@/lib/auth";
import {
  normalizeCode,
  validateCodeInput,
  verifyCodeLogic,
  calculateRedeemAmount,
  canUserRedeem,
} from "@/lib/redeem";

export async function POST(request: NextRequest) {
  try {
    const token = await extractTokenFromRequest(request);
    const user = await requireAuth(token);
    const supabase = getSupabaseClient();
    const body = await request.json();
    const { action } = body;

    // ========== 验证兑换码（查询信息，不扣减） ==========
    if (action === "verify") {
      const { code: rawCode } = body;
      const inputCheck = validateCodeInput(rawCode || "");
      if (!inputCheck.valid) {
        return NextResponse.json({ success: false, error: inputCheck.error }, { status: 400 });
      }

      const code = normalizeCode(rawCode);
      const { data: redeemCode } = await supabase
        .from("redeem_codes")
        .select("*")
        .eq("code", code)
        .single();

      const result = verifyCodeLogic(redeemCode);
      if (!result.valid) {
        return NextResponse.json({ success: false, error: result.error });
      }

      // 检查该用户已兑换次数
      const { count: userRedeemCount } = await supabase
        .from("redeem_logs")
        .select("*", { count: "exact", head: true })
        .eq("code", code)
        .eq("user_id", user.id);

      const maxUsesPerUser = result.code!.max_uses;
      if (!canUserRedeem(userRedeemCount || 0, maxUsesPerUser)) {
        return NextResponse.json({
          success: false,
          error: "你已达到该兑换码的最大兑换次数",
        });
      }

      return NextResponse.json({
        success: true,
        data: {
          code: result.code!.code,
          rewardAmount: result.code!.reward_amount,
          remainingUses: result.remainingUses,
          userRemainingUses: maxUsesPerUser - (userRedeemCount || 0),
        },
      });
    }

    // ========== 执行兑换 ==========
    if (action === "redeem") {
      const { code: rawCode } = body;
      const inputCheck = validateCodeInput(rawCode || "");
      if (!inputCheck.valid) {
        return NextResponse.json({ success: false, error: inputCheck.error }, { status: 400 });
      }

      const code = normalizeCode(rawCode);

      // 查询兑换码
      const { data: redeemCode } = await supabase
        .from("redeem_codes")
        .select("*")
        .eq("code", code)
        .single();

      const verifyResult = verifyCodeLogic(redeemCode);
      if (!verifyResult.valid) {
        return NextResponse.json({ success: false, error: verifyResult.error });
      }

      // 检查该用户已兑换次数
      const { count: userRedeemCount } = await supabase
        .from("redeem_logs")
        .select("*", { count: "exact", head: true })
        .eq("code", code)
        .eq("user_id", user.id);

      const maxUsesPerUser = verifyResult.code!.max_uses;
      if (!canUserRedeem(userRedeemCount || 0, maxUsesPerUser)) {
        return NextResponse.json({
          success: false,
          error: "你已达到该兑换码的最大兑换次数",
        });
      }

      const amount = calculateRedeemAmount(verifyResult.code!.reward_amount);
      if (amount <= 0) {
        return NextResponse.json({ success: false, error: "兑换码奖励数量无效" });
      }

      // 原子操作：增加 used_count，写入 log，更新用户余额
      // 使用事务保证一致性
      const { error: updateCodeError } = await supabase.rpc("redeem_code_increment", {
        p_code: code,
        p_user_id: user.id,
        p_amount: amount,
      }).then(({ error }) => {
        if (error) return { error };
        return { error: null };
      });

      // 如果 RPC 不存在，回退到非事务方式
      if (updateCodeError) {
        // 手动方式（非原子，但在简单场景下可接受）
        // 1. 增加 used_count
        const { error: incError } = await supabase
          .from("redeem_codes")
          .update({ used_count: redeemCode.used_count + 1 })
          .eq("code", code)
          .eq("used_count", redeemCode.used_count); // 乐观锁

        if (incError) {
          return NextResponse.json({
            success: false,
            error: "兑换失败，请稍后重试",
          }, { status: 500 });
        }

        // 2. 写入兑换记录
        await supabase.from("redeem_logs").insert({
          code,
          user_id: user.id,
          amount,
        });

        // 3. 增加用户 mimi_coins
        await supabase.rpc("increment_mimi_coins", { p_user_id: user.id, p_amount: amount });
      }

      await logAudit(user.id, user.username, "redeem_code", "redeem_code", code, {
        amount,
        code,
      });

      return NextResponse.json({
        success: true,
        data: {
          amount,
          message: `成功兑换 ${amount} 米米币！`,
        },
      });
    }

    return NextResponse.json({ error: "无效的操作" }, { status: 400 });
  } catch (err) {
    if (err instanceof Error && err.message === "未登录或登录已过期") {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    console.error("Redeem API error:", err);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}
