/**
 * /api/workshop/carousel
 *   GET  轮播配置（登录可读）
 *   PUT  管理员更新轮播配置 { customCount, customIds, banners }
 */
import { NextRequest } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { logAudit } from "@/lib/auth";
import { wsOk, wsHandleError, wsRequireUser, wsRequireAdmin, wsMapCarousel } from "../_lib";
import { wsNormalizeCarouselConfig } from "@/lib/workshop";

export async function GET(request: NextRequest) {
    try {
        await wsRequireUser(request);
        const supabase = getSupabaseClient();
        const { data, error } = await supabase
            .from("workshop_carousel_config")
            .select("*")
            .eq("id", "default")
            .maybeSingle();
        if (error) throw error;
        return wsOk({ carousel: wsMapCarousel(data) });
    } catch (err) {
        return wsHandleError(err);
    }
}

export async function PUT(request: NextRequest) {
    try {
        const admin = await wsRequireAdmin(request);
        const supabase = getSupabaseClient();
        const body = await request.json();

        const normalized = wsNormalizeCarouselConfig({
            customCount: body.customCount,
            customIds: body.customIds,
            banners: body.banners,
        });

        const updates: Record<string, unknown> = {
            custom_count: normalized.customCount,
            custom_ids: normalized.customIds,
            banners: normalized.banners,
            updated_by: admin.id,
        };

        const { data: existing } = await supabase
            .from("workshop_carousel_config")
            .select("id")
            .eq("id", "default")
            .maybeSingle();

        let row;
        if (existing) {
            const { data, error } = await supabase
                .from("workshop_carousel_config")
                .update(updates)
                .eq("id", "default")
                .select()
                .single();
            if (error) throw error;
            row = data;
        } else {
            const { data, error } = await supabase
                .from("workshop_carousel_config")
                .insert({ id: "default", ...updates })
                .select()
                .single();
            if (error) throw error;
            row = data;
        }

        await logAudit(admin.id, admin.username, "workshop_update_carousel", "workshop_carousel", "default", {
            customCount: normalized.customCount,
        });

        return wsOk({ carousel: wsMapCarousel(row) });
    } catch (err) {
        return wsHandleError(err);
    }
}
