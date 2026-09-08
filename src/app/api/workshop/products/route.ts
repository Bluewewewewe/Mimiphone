/**
 * /api/workshop/products
 *   GET  商品列表（按身份过滤）
 *   POST 提交商品（团长→pending / 管理员→active），后端分配编号 WS-xxxxx
 */
import { NextRequest } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { logAudit } from "@/lib/auth";
import {
    wsOk,
    wsError,
    wsHandleError,
    wsRequireUser,
    wsMapGroup,
    wsMapProduct,
} from "../_lib";
import {
    wsCanViewProduct,
    wsCanSubmitProduct,
    wsInitialProductStatus,
    wsGroupIsActive,
    wsLeaderIsActive,
    type WSProduct,
} from "@/lib/workshop";

export async function GET(request: NextRequest) {
    try {
        const user = await wsRequireUser(request);
        const supabase = getSupabaseClient();
        const { searchParams } = new URL(request.url);
        const statusFilter = searchParams.get("status");
        const now = Date.now();

        const [productsRes, groupsRes, leaderRes] = await Promise.all([
            supabase.from("workshop_products").select("*").order("created_at", { ascending: false }),
            supabase.from("workshop_groups").select("*"),
            supabase.from("workshop_leaders").select("*").eq("user_id", user.id).maybeSingle(),
        ]);

        const groups = (groupsRes.data || []).map(wsMapGroup);
        const leaderRow = leaderRes.data;
        const leader = leaderRow
            ? {
                  userId: leaderRow.user_id as string,
                  userName: (leaderRow.user_name as string) || "",
                  groupIds: (leaderRow.group_ids as string[]) || [],
                  expiresAt: leaderRow.expires_at ? new Date(leaderRow.expires_at as string).getTime() : null,
                  active: leaderRow.active !== false,
              }
            : null;

        let products: WSProduct[] = (productsRes.data || []).map(wsMapProduct);

        if (statusFilter) {
            products = products.filter((p) => p.status === statusFilter);
        }

        if (!user.isAdmin) {
            const isLeader = wsLeaderIsActive(leader, now);
            if (!isLeader) {
                // 普通用户：只看网格可见商品
                products = products.filter((p) =>
                    wsCanViewProduct(p, groups, { id: user.id, name: user.username, role: user.role, isAdmin: false }, now)
                );
            } else {
                // 团长：可见商品 + 自己的 pending 商品
                products = products.filter(
                    (p) =>
                        wsCanViewProduct(p, groups, { id: user.id, name: user.username, role: user.role, isAdmin: false }, now) ||
                        (p.status === "pending" && p.leaderUid === user.id)
                );
            }
        }

        return wsOk({ products });
    } catch (err) {
        return wsHandleError(err);
    }
}

export async function POST(request: NextRequest) {
    try {
        const user = await wsRequireUser(request);
        const supabase = getSupabaseClient();
        const body = await request.json();
        const now = Date.now();

        // 团长档案（管理员也可能以自己名义上架）
        const { data: leaderRow } = await supabase
            .from("workshop_leaders")
            .select("*")
            .eq("user_id", user.id)
            .maybeSingle();
        const leader = leaderRow
            ? {
                  userId: leaderRow.user_id as string,
                  userName: (leaderRow.user_name as string) || "",
                  groupIds: (leaderRow.group_ids as string[]) || [],
                  expiresAt: leaderRow.expires_at ? new Date(leaderRow.expires_at as string).getTime() : null,
                  active: leaderRow.active !== false,
              }
            : null;

        if (!wsCanSubmitProduct({ id: user.id, name: user.username, role: user.role, isAdmin: user.isAdmin }, leader, now)) {
            return wsError("只有团长可以提交商品（请先申请团长资格）", 403);
        }

        const name = String(body.name || "").trim();
        const groupId = String(body.groupId || "").trim();
        if (!name) return wsError("缺少制品名");
        if (!groupId) return wsError("请选择团");

        const { data: groupRow, error: gErr } = await supabase
            .from("workshop_groups")
            .select("*")
            .eq("id", groupId)
            .maybeSingle();
        if (gErr) throw gErr;
        if (!groupRow) return wsError("团不存在");
        const group = wsMapGroup(groupRow);

        if (!user.isAdmin) {
            // 团长只能往自己所属的团上架，且团必须在有效期
            if (!leader?.groupIds?.includes(groupId)) return wsError("只能向自己所属的团提交商品", 403);
            if (!wsGroupIsActive(group, now)) return wsError("该团未开始或已结束");
        }

        // 团商品上限
        if (group.maxProducts) {
            const { count } = await supabase
                .from("workshop_products")
                .select("id", { count: "exact", head: true })
                .eq("group_id", groupId)
                .neq("status", "offline");
            if ((count || 0) >= group.maxProducts) {
                return wsError(`该团最多上架 ${group.maxProducts} 个制品，已达上限`);
            }
        }

        const status = wsInitialProductStatus({ id: user.id, name: user.username, role: user.role, isAdmin: user.isAdmin });
        const hasQuestion = !!body.hasQuestion;

        const insert = {
            name,
            description: String(body.desc || ""),
            image_url: String(body.image || ""),
            contact_image_url: String(body.contactImage || ""),
            price: String(body.price || ""),
            group_id: groupId,
            category: String(body.majorCat || body.category || ""),
            sub_category: String(body.minorCat || body.subCategory || ""),
            has_question: hasQuestion,
            question: hasQuestion ? String(body.question || "") : "",
            answer: hasQuestion ? String(body.answer || "") : "",
            status,
            want_count: 0,
            leader_user_id: user.id,
            leader_name: user.username,
            listed_until: group.endAt ? new Date(group.endAt).toISOString() : null,
        };

        const { data: created, error } = await supabase.from("workshop_products").insert(insert).select().single();
        if (error) throw error;

        if (user.isAdmin) {
            await logAudit(user.id, user.username, "workshop_create_product", "workshop_product", created.id, {
                name,
                status,
            });
        }

        return wsOk({ product: wsMapProduct(created) });
    } catch (err) {
        return wsHandleError(err);
    }
}
