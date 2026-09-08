/**
 * GET /api/workshop/state
 * 小作坊前端进入页面时一次性拉取所有数据（身份 + 商品/团/团长/申请/分类/轮播）。
 * 需要登录（iframe URL 带 token）。
 */
import { NextRequest } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import {
    wsOk,
    wsHandleError,
    wsRequireUser,
    wsMapGroup,
    wsMapLeader,
    wsMapApplication,
    wsMapProduct,
    wsMapCategory,
    wsMapCarousel,
} from "../_lib";
import { wsCanViewProduct, wsLeaderIsActive, type WSProduct } from "@/lib/workshop";

type WSMappedApplication = { uid: string } & Record<string, unknown>;

export async function GET(request: NextRequest) {
    try {
        const user = await wsRequireUser(request);
        const supabase = getSupabaseClient();
        const now = Date.now();

        const [groupsRes, leadersRes, appsRes, catsRes, productsRes, carouselRes, wantsRes, myLeaderRes] =
            await Promise.all([
                supabase.from("workshop_groups").select("*").order("created_at", { ascending: true }),
                supabase.from("workshop_leaders").select("*").eq("active", true),
                supabase
                    .from("workshop_applications")
                    .select("*")
                    .order("created_at", { ascending: false }),
                supabase
                    .from("workshop_categories")
                    .select("*")
                    .order("sort_order", { ascending: true })
                    .order("created_at", { ascending: true }),
                supabase.from("workshop_products").select("*").order("created_at", { ascending: false }),
                supabase.from("workshop_carousel_config").select("*").eq("id", "default").maybeSingle(),
                supabase.from("workshop_wants").select("product_id").eq("user_id", user.id),
                supabase.from("workshop_leaders").select("*").eq("user_id", user.id).maybeSingle(),
            ]);

        const groups = (groupsRes.data || []).map(wsMapGroup);
        const leaders = (leadersRes.data || []).map(wsMapLeader);
        const myLeaderRow = myLeaderRes.data ? wsMapLeader(myLeaderRes.data) : null;
        const isLeader = wsLeaderIsActive(
            myLeaderRow ? { userId: myLeaderRow.uid, userName: myLeaderRow.user, groupIds: myLeaderRow.groupIds, expiresAt: myLeaderRow.expiresAt, active: myLeaderRow.active } : null,
            now
        );

        // 申请列表：管理员看全部；普通用户只看自己的
        let applications: WSMappedApplication[] = (appsRes.data || []).map(wsMapApplication);
        if (!user.isAdmin) {
            applications = applications.filter((a) => a.uid === user.id);
        }

        const allProducts: WSProduct[] = (productsRes.data || []).map(wsMapProduct);
        // 浏览可见商品（pending 仅本人/管理员、offline 不可见、团有效期等）
        const products = user.isAdmin
            ? allProducts
            : allProducts.filter((p) =>
                  wsCanViewProduct(
                      p,
                      groups,
                      { id: user.id, name: user.username, role: user.role, isAdmin: false },
                      now
                  )
              );

        const wantedIds = ((wantsRes.data as { product_id: string }[] | null) || []).map(
            (w) => w.product_id
        );

        return wsOk({
            user: {
                uid: user.id,
                name: user.username,
                role: user.role,
                isAdmin: user.isAdmin,
                isLeader,
                leaderGroupIds: myLeaderRow?.groupIds || [],
                leaderExpiresAt: myLeaderRow?.expiresAt || null,
            },
            products,
            groups,
            leaders,
            applications,
            categories: (catsRes.data || []).map(wsMapCategory),
            carousel: wsMapCarousel(carouselRes.data),
            wantedIds,
        });
    } catch (err) {
        return wsHandleError(err);
    }
}
