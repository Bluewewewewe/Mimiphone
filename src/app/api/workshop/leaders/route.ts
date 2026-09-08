/**
 * GET /api/workshop/leaders
 * 团长列表（管理员可见全部，含停用）
 */
import { NextRequest } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { wsOk, wsHandleError, wsRequireAdmin, wsMapLeader } from "../_lib";

export async function GET(request: NextRequest) {
    try {
        await wsRequireAdmin(request);
        const supabase = getSupabaseClient();
        const { data, error } = await supabase
            .from("workshop_leaders")
            .select("*")
            .order("created_at", { ascending: true });
        if (error) throw error;
        return wsOk({ leaders: (data || []).map(wsMapLeader) });
    } catch (err) {
        return wsHandleError(err);
    }
}
