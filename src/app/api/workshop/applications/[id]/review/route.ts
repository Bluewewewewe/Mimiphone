/**
 * POST /api/workshop/applications/[id]/review
 * 管理员审核团长申请：
 *   { action: "approve", days?: number } → 自动在 workshop_leaders 建档/续期
 *   { action: "reject" }                 → 申请置为 rejected
 */
import { NextRequest } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { logAudit } from "@/lib/auth";
import { wsOk, wsError, wsHandleError, wsRequireAdmin, wsMapLeader } from "../../../_lib";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, ctx: Ctx) {
    try {
        const { id } = await ctx.params;
        const admin = await wsRequireAdmin(request);
        const supabase = getSupabaseClient();
        const body = await request.json();
        const action = String(body.action || "");

        const { data: app, error: aErr } = await supabase
            .from("workshop_applications")
            .select("*")
            .eq("id", id)
            .maybeSingle();
        if (aErr) throw aErr;
        if (!app) return wsError("申请不存在", 404);
        if (app.status !== "pending") return wsError("该申请已处理");

        if (action === "reject") {
            const { error } = await supabase
                .from("workshop_applications")
                .update({ status: "rejected", reviewed_by: admin.id, reviewed_at: new Date().toISOString() })
                .eq("id", id);
            if (error) throw error;

            await logAudit(admin.id, admin.username, "workshop_reject_application", "workshop_application", id, {
                applicant: app.user_name,
            });
            return wsOk({ status: "rejected" });
        }

        if (action !== "approve") return wsError("action 必须为 approve 或 reject");

        const days = Number(body.days || 30) || 30;
        const expiresAt = new Date(Date.now() + days * 86400000).toISOString();

        // upsert 团长档案（user_id 唯一）
        const { data: existingLeader } = await supabase
            .from("workshop_leaders")
            .select("*")
            .eq("user_id", app.user_id)
            .maybeSingle();

        let leaderRow;
        if (existingLeader) {
            const { data, error } = await supabase
                .from("workshop_leaders")
                .update({
                    user_name: app.user_name,
                    active: true,
                    expires_at: expiresAt,
                })
                .eq("user_id", app.user_id)
                .select()
                .single();
            if (error) throw error;
            leaderRow = data;
        } else {
            const { data, error } = await supabase
                .from("workshop_leaders")
                .insert({
                    user_id: app.user_id,
                    user_name: app.user_name,
                    group_ids: [],
                    active: true,
                    expires_at: expiresAt,
                })
                .select()
                .single();
            if (error) throw error;
            leaderRow = data;
        }

        const { error: upErr } = await supabase
            .from("workshop_applications")
            .update({ status: "approved", reviewed_by: admin.id, reviewed_at: new Date().toISOString() })
            .eq("id", id);
        if (upErr) throw upErr;

        await logAudit(admin.id, admin.username, "workshop_approve_application", "workshop_application", id, {
            applicant: app.user_name,
            days,
        });

        return wsOk({ status: "approved", leader: wsMapLeader(leaderRow) });
    } catch (err) {
        return wsHandleError(err);
    }
}
