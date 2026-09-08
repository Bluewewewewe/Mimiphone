/**
 * POST /api/workshop/products/[id]/want
 * 切换「想要」：已想要→取消，未想要→添加。返回最新 wantCount 与 wanted。
 */
import { NextRequest } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { wsOk, wsError, wsHandleError, wsRequireUser } from "../../../_lib";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, ctx: Ctx) {
    try {
        const { id } = await ctx.params;
        const user = await wsRequireUser(request);
        const supabase = getSupabaseClient();

        const { data: product, error: pErr } = await supabase
            .from("workshop_products")
            .select("id, status, want_count")
            .eq("id", id)
            .maybeSingle();
        if (pErr) throw pErr;
        if (!product) return wsError("商品不存在", 404);

        const { data: existing } = await supabase
            .from("workshop_wants")
            .select("id")
            .eq("user_id", user.id)
            .eq("product_id", id)
            .maybeSingle();

        let wanted: boolean;
        if (existing) {
            const { error: dErr } = await supabase
                .from("workshop_wants")
                .delete()
                .eq("user_id", user.id)
                .eq("product_id", id);
            if (dErr) throw dErr;
            wanted = false;
            await supabase
                .from("workshop_products")
                .update({ want_count: Math.max(0, (product.want_count as number) || 0) - 1 })
                .eq("id", id)
                .gt("want_count", 0);
        } else {
            const { error: iErr } = await supabase.from("workshop_wants").insert({
                user_id: user.id,
                product_id: id,
            });
            if (iErr) throw iErr;
            wanted = true;
            await supabase
                .from("workshop_products")
                .update({ want_count: ((product.want_count as number) || 0) + 1 })
                .eq("id", id);
        }

        const { data: fresh } = await supabase
            .from("workshop_products")
            .select("want_count")
            .eq("id", id)
            .single();

        return wsOk({ wanted, wantCount: (fresh?.want_count as number) ?? 0 });
    } catch (err) {
        return wsHandleError(err);
    }
}
