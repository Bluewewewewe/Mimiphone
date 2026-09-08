/**
 * /api/workshop/categories
 *   GET    分类列表（所有人可读）
 *   POST   管理员新增分类 { name, subs: string[] }
 *   DELETE 管理员删除分类 ?id=xxx
 */
import { NextRequest } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { logAudit } from "@/lib/auth";
import { wsOk, wsError, wsHandleError, wsRequireUser, wsRequireAdmin, wsMapCategory } from "../_lib";

export async function GET(request: NextRequest) {
    try {
        await wsRequireUser(request);
        const supabase = getSupabaseClient();
        const { data, error } = await supabase
            .from("workshop_categories")
            .select("*")
            .order("sort_order", { ascending: true })
            .order("created_at", { ascending: true });
        if (error) throw error;
        return wsOk({ categories: (data || []).map(wsMapCategory) });
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
        const subs = Array.isArray(body.subs)
            ? body.subs.map((s: unknown) => String(s).trim()).filter(Boolean)
            : String(body.subs || "")
                  .split(/[,，]/)
                  .map((s: string) => s.trim())
                  .filter(Boolean);
        if (!name) return wsError("请填写分类名");

        const { data: maxRow } = await supabase
            .from("workshop_categories")
            .select("sort_order")
            .order("sort_order", { ascending: false })
            .limit(1)
            .maybeSingle();
        const sortOrder = ((maxRow?.sort_order as number) || 0) + 1;

        const { data: created, error } = await supabase
            .from("workshop_categories")
            .insert({ name, subs, sort_order: sortOrder })
            .select()
            .single();
        if (error) {
            if (String(error.message || "").includes("duplicate") || error.code === "23505") {
                return wsError("该分类已存在");
            }
            throw error;
        }

        await logAudit(admin.id, admin.username, "workshop_add_category", "workshop_category", created.id as string, { name });

        return wsOk({ category: wsMapCategory(created) });
    } catch (err) {
        return wsHandleError(err);
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const admin = await wsRequireAdmin(request);
        const supabase = getSupabaseClient();
        const id = new URL(request.url).searchParams.get("id");
        if (!id) return wsError("缺少分类 id");

        const { error } = await supabase.from("workshop_categories").delete().eq("id", id);
        if (error) throw error;

        await logAudit(admin.id, admin.username, "workshop_delete_category", "workshop_category", id, {});

        return wsOk({ deleted: true });
    } catch (err) {
        return wsHandleError(err);
    }
}
