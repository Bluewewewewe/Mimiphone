/**
 * /api/workshop/products/[id]
 *   PATCH  管理员审核/改状态/编辑；团长仅可编辑自己的 pending 商品
 *   DELETE 管理员删除（驳回=删除）
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { logAudit } from "@/lib/auth";
import { wsOk, wsError, wsHandleError, wsRequireUser, wsMapProduct } from "../../_lib";
import { wsIsValidStatusTransition } from "@/lib/workshop";

type Ctx = { params: Promise<{ id: string }> };

async function loadProduct(supabase: ReturnType<typeof getSupabaseClient>, id: string) {
    const { data, error } = await supabase.from("workshop_products").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    return data;
}

export async function PATCH(request: NextRequest, ctx: Ctx) {
    try {
        const { id } = await ctx.params;
        const user = await wsRequireUser(request);
        const supabase = getSupabaseClient();
        const body = await request.json();

        const row = await loadProduct(supabase, id);
        if (!row) return wsError("商品不存在", 404);

        const isOwner = row.leader_user_id === user.id;
        if (!user.isAdmin && !isOwner) {
            return wsError("只能操作自己提交的商品", 403);
        }

        const updates: Record<string, unknown> = {};

        // 状态变更（审核/上架/变灰/下架/重新上架）
        if (body.status !== undefined) {
            const target = String(body.status);
            if (!wsIsValidStatusTransition(target)) {
                return wsError(`无效状态：${target}`);
            }
            if (!user.isAdmin) {
                // 团长不能自己审核/改状态
                return wsError("需要管理员权限", 403);
            }
            updates.status = target;
            if (target === "active") {
                updates.reviewed_by = user.id;
                updates.reviewed_at = new Date().toISOString();
            }
        }

        // 内容编辑字段
        const editableFields: Record<string, string> = {
            name: "name",
            desc: "description",
            description: "description",
            image: "image_url",
            contactImage: "contact_image_url",
            price: "price",
            majorCat: "category",
            category: "category",
            minorCat: "sub_category",
            subCategory: "sub_category",
            question: "question",
            answer: "answer",
        };
        for (const [bodyKey, dbKey] of Object.entries(editableFields)) {
            if (body[bodyKey] !== undefined) updates[dbKey] = String(body[bodyKey]);
        }
        if (body.hasQuestion !== undefined) updates.has_question = !!body.hasQuestion;
        if (body.groupId !== undefined) updates.group_id = String(body.groupId);

        // 团长只能改自己 pending 的商品
        if (!user.isAdmin && Object.keys(updates).length > 0 && row.status !== "pending") {
            return wsError("商品审核后不可再编辑，请联系管理员", 403);
        }

        if (Object.keys(updates).length === 0) {
            return wsError("没有需要更新的字段");
        }

        const { data: updated, error } = await supabase
            .from("workshop_products")
            .update(updates)
            .eq("id", id)
            .select()
            .single();
        if (error) throw error;

        if (user.isAdmin) {
            await logAudit(user.id, user.username, "workshop_update_product", "workshop_product", id, {
                fields: Object.keys(updates),
            });
        }

        return wsOk({ product: wsMapProduct(updated) });
    } catch (err) {
        return wsHandleError(err);
    }
}

export async function DELETE(request: NextRequest, ctx: Ctx) {
    try {
        const { id } = await ctx.params;
        const user = await wsRequireUser(request);
        const supabase = getSupabaseClient();

        const row = await loadProduct(supabase, id);
        if (!row) return wsError("商品不存在", 404);

        if (!user.isAdmin) {
            return wsError("需要管理员权限", 403);
        }

        const { error } = await supabase.from("workshop_products").delete().eq("id", id);
        if (error) throw error;

        // 同步清理轮播引用（custom_ids 中的该商品）
        const { data: cfg } = await supabase.from("workshop_carousel_config").select("*").eq("id", "default").maybeSingle();
        if (cfg && Array.isArray(cfg.custom_ids) && cfg.custom_ids.includes(id)) {
            const banners = { ...(cfg.banners || {}) };
            delete banners[id];
            await supabase
                .from("workshop_carousel_config")
                .update({ custom_ids: cfg.custom_ids.filter((x: string) => x !== id), banners })
                .eq("id", "default");
        }

        await logAudit(user.id, user.username, "workshop_delete_product", "workshop_product", id, {
            name: row.name,
        });

        return NextResponse.json({ success: true });
    } catch (err) {
        return wsHandleError(err);
    }
}
