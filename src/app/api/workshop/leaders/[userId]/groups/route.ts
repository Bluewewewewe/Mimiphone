/**
 * POST /api/workshop/leaders/[userId]/groups
 * 管理员给团长分配/取消团，或取消团长资格。
 * Body:
 *   { action: "assign", groupId }          分配团（≤2 个）
 *   { action: "unassign", groupId }        移除某个团
 *   { action: "revoke" }                   取消团长资格（active=false）
 */
import { NextRequest } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { logAudit } from "@/lib/auth";
import { wsOk, wsError, wsHandleError, wsRequireAdmin, wsMapLeader } from "../../../_lib";
import { WS_MAX_GROUPS_PER_LEADER, wsValidateLeaderGroupAssign } from "@/lib/workshop";

type Ctx = { params: Promise<{ userId: string }> };

export async function POST(request: NextRequest, ctx: Ctx) {
    try {
        const { userId } = await ctx.params;
        const admin = await wsRequireAdmin(request);
        const supabase = getSupabaseClient();
        const body = await request.json();
        const action = String(body.action || "");

        const { data: leader, error: lErr } = await supabase
            .from("workshop_leaders")
            .select("*")
            .eq("user_id", userId)
            .maybeSingle();
        if (lErr) throw lErr;

        if (action === "revoke") {
            if (!leader) return wsError("团长档案不存在", 404);
            const { error } = await supabase
                .from("workshop_leaders")
                .update({ active: false, group_ids: [] })
                .eq("user_id", userId);
            if (error) throw error;

            await logAudit(admin.id, admin.username, "workshop_revoke_leader", "workshop_leader", userId, {});
            return wsOk({ revoked: true });
        }

        if (!leader || leader.active === false) return wsError("该用户还不是有效团长", 404);

        let groupIds: string[] = (leader.group_ids as string[]) || [];
        const groupId = String(body.groupId || "");

        if (action === "assign") {
            if (!groupId) return wsError("缺少 groupId");
            const errMsg = wsValidateLeaderGroupAssign(groupIds, groupId);
            if (errMsg) return wsError(errMsg);
            groupIds = [...groupIds, groupId];
        } else if (action === "unassign") {
            if (!groupId) return wsError("缺少 groupId");
            groupIds = groupIds.filter((g) => g !== groupId);
        } else {
            return wsError("action 必须为 assign / unassign / revoke");
        }

        if (groupIds.length > WS_MAX_GROUPS_PER_LEADER) {
            return wsError(`每个团长最多 ${WS_MAX_GROUPS_PER_LEADER} 个团`);
        }

        const { data: updated, error } = await supabase
            .from("workshop_leaders")
            .update({ group_ids: groupIds })
            .eq("user_id", userId)
            .select()
            .single();
        if (error) throw error;

        await logAudit(admin.id, admin.username, "workshop_assign_leader_group", "workshop_leader", userId, {
            action,
            groupId,
        });

        return wsOk({ leader: wsMapLeader(updated) });
    } catch (err) {
        return wsHandleError(err);
    }
}
