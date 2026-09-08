/**
 * /api/workshop/applications
 *   GET  列表（管理员全部；普通用户只看自己）
 *   POST 提交团长申请（普通用户/团长；已存在 pending 申请则拒绝重复提交）
 */
import { NextRequest } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { wsOk, wsError, wsHandleError, wsRequireUser, wsMapApplication } from "../_lib";

export async function GET(request: NextRequest) {
    try {
        const user = await wsRequireUser(request);
        const supabase = getSupabaseClient();

        let query = supabase
            .from("workshop_applications")
            .select("*")
            .order("created_at", { ascending: false });
        if (!user.isAdmin) {
            query = query.eq("user_id", user.id);
        }
        const { data, error } = await query;
        if (error) throw error;
        return wsOk({ applications: (data || []).map(wsMapApplication) });
    } catch (err) {
        return wsHandleError(err);
    }
}

export async function POST(request: NextRequest) {
    try {
        const user = await wsRequireUser(request);
        const supabase = getSupabaseClient();
        const body = await request.json();
        const note = String(body.note || "").trim();
        if (!note) return wsError("请填写申请说明");

        // 已是有效团长 → 无需申请
        const { data: leader } = await supabase
            .from("workshop_leaders")
            .select("id, active, expires_at")
            .eq("user_id", user.id)
            .maybeSingle();
        if (leader && leader.active !== false) {
            const expired = leader.expires_at && new Date(leader.expires_at) < new Date();
            if (!expired) return wsError("您已是团长，无需重复申请");
        }

        // 已有 pending 申请 → 不允许重复
        const { data: pending } = await supabase
            .from("workshop_applications")
            .select("id")
            .eq("user_id", user.id)
            .eq("status", "pending")
            .maybeSingle();
        if (pending) return wsError("您已提交申请，请等待管理员审核");

        const { data: created, error } = await supabase
            .from("workshop_applications")
            .insert({
                user_id: user.id,
                user_name: user.username,
                note,
                status: "pending",
            })
            .select()
            .single();
        if (error) throw error;

        return wsOk({ application: wsMapApplication(created) });
    } catch (err) {
        return wsHandleError(err);
    }
}
