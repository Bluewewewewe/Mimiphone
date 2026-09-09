/**
 * POST /api/workshop/leaders/[userId]
 * 管理员直接为用户开通/续期团长资格（演示/测试用，等价于 approve 的建档动作）
 * Body: { days?: number }
 */
import { NextRequest } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { logAudit } from "@/lib/auth";
import { wsOk, wsError, wsHandleError, wsRequireAdmin, wsMapLeader } from "../../_lib";

type Ctx = { params: Promise<{ userId: string }> };

export async function POST(request: NextRequest, ctx: Ctx) {
    try {
        const { userId } = await ctx.params;
        const admin = await wsRequireAdmin(request);
        const supabase = getSupabaseClient();
        const body = await request.json().catch(() => ({}));
        const days = Number(body?.days || 30) || 30;
        const expiresAt = new Date(Date.now() + days * 86400000).toISOString();

        const { data: user, error: uErr } = await supabase
            .from("users")
            .select("id, username")
            .eq("id", userId)
            .maybeSingle();
        if (uErr) throw uErr;
        if (!user) return wsError("用户不存在", 404);

        const { data: existing } = await supabase
            .from("workshop_leaders")
            .select("*")
            .eq("user_id", userId)
            .maybeSingle();

        let row;
        if (existing) {
            const { data, error } = await supabase
                .from("workshop_leaders")
                .update({ user_name: user.username, active: true, expires_at: expiresAt })
                .eq("user_id", userId)
                .select()
                .single();
            if (error) throw error;
            row = data;
        } else {
            const { data, error } = await supabase
                .from("workshop_leaders")
                .insert({
                    user_id: userId,
                    user_name: user.username,
                    group_ids: [],
                    active: true,
                    expires_at: expiresAt,
                })
                .select()
                .single();
            if (error) throw error;
            row = data;
        }

        // 该用户的 pending 申请一并标记通过
        await supabase
            .from("workshop_applications")
            .update({ status: "approved", reviewed_by: admin.id, reviewed_at: new Date().toISOString() })
            .eq("user_id", userId)
            .eq("status", "pending");

        await logAudit(admin.id, admin.username, "workshop_grant_leader", "workshop_leader", userId, { days });

        return wsOk({ leader: wsMapLeader(row) });
    } catch (err) {
        return wsHandleError(err);
    }
}
