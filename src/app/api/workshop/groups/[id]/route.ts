/**
 * PATCH /api/workshop/groups/[id]
 * 管理员启用/停用团、编辑团信息
 */
import { NextRequest } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { logAudit } from "@/lib/auth";
import { wsOk, wsError, wsHandleError, wsRequireAdmin, wsMapGroup } from "../../_lib";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, ctx: Ctx) {
    try {
        const { id } = await ctx.params;
        const admin = await wsRequireAdmin(request);
        const supabase = getSupabaseClient();
        const body = await request.json();

        const { data: existing } = await supabase
            .from("workshop_groups")
            .select("*")
            .eq("id", id)
            .maybeSingle();
        if (!existing) return wsError("团不存在", 404);

        const updates: Record<string, unknown> = {};
        if (body.active !== undefined) updates.active = !!body.active;
        if (body.name !== undefined) updates.name = String(body.name);
        if (body.maxProducts !== undefined) updates.max_products = Number(body.maxProducts);
        if (body.startAt !== undefined) updates.start_at = new Date(Number(body.startAt)).toISOString();
        if (body.endAt !== undefined) updates.end_at = new Date(Number(body.endAt)).toISOString();

        if (Object.keys(updates).length === 0) return wsError("没有需要更新的字段");

        const { data: updated, error } = await supabase
            .from("workshop_groups")
            .update(updates)
            .eq("id", id)
            .select()
            .single();
        if (error) throw error;

        await logAudit(admin.id, admin.username, "workshop_update_group", "workshop_group", id, {
            fields: Object.keys(updates),
        });

        return wsOk({ group: wsMapGroup(updated) });
    } catch (err) {
        return wsHandleError(err);
    }
}
