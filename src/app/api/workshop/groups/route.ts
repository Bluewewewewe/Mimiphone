/**
 * /api/workshop/groups
 *   GET  团列表（登录可见）
 *   POST 管理员创建团（同时把团分配给团长，团长最多 2 个团）
 */
import { NextRequest } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { logAudit } from "@/lib/auth";
import { wsOk, wsError, wsHandleError, wsRequireUser, wsRequireAdmin, wsMapGroup } from "../_lib";
import { wsValidateLeaderGroupAssign } from "@/lib/workshop";

export async function GET(request: NextRequest) {
    try {
        await wsRequireUser(request);
        const supabase = getSupabaseClient();
        const { data, error } = await supabase
            .from("workshop_groups")
            .select("*")
            .order("created_at", { ascending: true });
        if (error) throw error;
        return wsOk({ groups: (data || []).map(wsMapGroup) });
    } catch (err) {
        return wsHandleError(err);
    }
}

export async function POST(request: NextRequest) {
    try {
        const admin = await wsRequireAdmin(request);
        const supabase = getSupabaseClient();
        const body = await request.json();

        const name = String(body.name || "").trim();
        const leaderName = String(body.leaderUser || body.leaderName || "").trim();
        const startAt = body.startAt ? new Date(Number(body.startAt)).toISOString() : body.start ? new Date(body.start).toISOString() : null;
        const endAt = body.endAt ? new Date(Number(body.endAt)).toISOString() : body.end ? new Date(body.end + "T23:59:59").toISOString() : null;
        const maxProducts = Number(body.maxProducts || 5);

        if (!name || !leaderName || !startAt || !endAt) {
            return wsError("请填写团名、团长、开始与结束日期");
        }

        // 团长必须已建档
        const { data: leader, error: lErr } = await supabase
            .from("workshop_leaders")
            .select("*")
            .eq("user_name", leaderName)
            .neq("active", false)
            .maybeSingle();
        if (lErr) throw lErr;
        if (!leader) return wsError("该用户不是团长，请先批准团长申请", 400);

        const groupIds: string[] = (leader.group_ids as string[]) || [];
        // 先建团拿到 id 再校验分配（新团 id 尚未加入）
        const insert = {
            name,
            leader_user_id: leader.user_id,
            leader_name: leaderName,
            start_at: startAt,
            end_at: endAt,
            max_products: maxProducts > 0 ? maxProducts : 5,
            active: true,
        };
        const { data: group, error: gErr } = await supabase.from("workshop_groups").insert(insert).select().single();
        if (gErr) throw gErr;

        const validationError = wsValidateLeaderGroupAssign(groupIds, group.id as string);
        if (validationError) {
            // 超过上限：回滚刚建的团
            await supabase.from("workshop_groups").delete().eq("id", group.id);
            return wsError(validationError, 400);
        }

        const { error: uErr } = await supabase
            .from("workshop_leaders")
            .update({ group_ids: [...groupIds, group.id] })
            .eq("user_id", leader.user_id);
        if (uErr) throw uErr;

        await logAudit(admin.id, admin.username, "workshop_create_group", "workshop_group", group.id as string, {
            name,
            leader: leaderName,
        });

        return wsOk({ group: wsMapGroup(group) });
    } catch (err) {
        return wsHandleError(err);
    }
}
