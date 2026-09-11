import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { StoreAppItem, AppStatus, StoreAppBetaCode } from "@/lib/apps";
import {
    requireAdminRequest,
    logAudit,
} from "@/lib/auth";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
    AdminContext,
    AppManagerRecord,
    isBigManager,
    canManageApp,
    canCreateApp,
    canDeleteApp,
    canReorderApps,
    canAssignManagers,
    canOpenAppAdmin,
    filterAppsForAdmin,
    sanitizeUpdatePayload,
    checkBatchStatusUpdate,
    checkBatchDelete,
    validateBetaCodeInput,
    validateManagerAssign,
} from "@/lib/app-admin";

function isAdmin(user: Record<string, unknown> | null) {
    if (!user) return false;
    const role = String(user.role || "");
    return role === "admin" || role === "super_admin";
}

/**
 * 构建管理员上下文：身份 + 细粒度权限 + 被分配的 app（小管理）。
 * 未登录/非管理员直接抛错（由 POST/GET 统一映射为 401/403）。
 */
async function buildAdminContext(request: NextRequest, supabase: SupabaseClient): Promise<AdminContext> {
    const user = await requireAdminRequest(request);
    const { data: u } = await supabase
        .from("users")
        .select("admin_permissions")
        .eq("id", user.userId)
        .single();
    const permissions = Array.isArray(u?.admin_permissions) ? (u!.admin_permissions as string[]) : [];

    const { data: managed } = await supabase
        .from("app_managers")
        .select("app_id")
        .eq("user_id", user.userId);
    const managedAppIds = ((managed || []) as { app_id: string }[]).map((r: { app_id: string }) => String(r.app_id));

    return {
        userId: user.userId,
        username: user.username,
        role: user.role as AdminContext["role"],
        permissions,
        managedAppIds,
    };
}

/** 通过 UUID 主键 id 或 TEXT 业务标识 app_id 解析出 app_id（TEXT） */
async function resolveAppId(
    supabase: SupabaseClient,
    id?: string,
    appId?: string,
): Promise<string | null> {
    if (appId) {
        const { data } = await supabase.from("apps").select("app_id").eq("app_id", appId).single();
        return data?.app_id ?? null;
    }
    if (id) {
        const { data } = await supabase.from("apps").select("app_id").eq("id", id).single();
        return data?.app_id ?? null;
    }
    return null;
}

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const action = searchParams.get("action");
        const supabase = getSupabaseClient();

        // ---------- 商店列表（保持原行为：游客/普通用户过滤 hidden） ----------
        if (action === "list") {
            const token = request.headers.get("authorization")?.replace("Bearer ", "") || "";
            let user: Record<string, unknown> | null = null;
            if (token) {
                const { data: session } = await supabase
                    .from("user_sessions")
                    .select("user_id")
                    .eq("token", token)
                    .single();
                if (session?.user_id) {
                    const { data: u } = await supabase
                        .from("users")
                        .select("role")
                        .eq("id", session.user_id)
                        .single();
                    user = u || null;
                }
            }

            let query = supabase.from("apps").select("*").order("order", { ascending: true });
            if (!isAdmin(user)) {
                // 普通用户：只能看到 已上架(published) 和 内测中(beta)
                // 开发中(dev) 和 隐藏(hidden) 完全不返回
                query = query.neq("status", "hidden").neq("status", "dev");
            }
            const { data: apps, error } = await query;
            if (error) throw error;
            return NextResponse.json({ success: true, data: apps || [] });
        }

        // ---------- 独立管理 App 聚合数据：应用 + 内测码 + 管理员分配 ----------
        if (action === "manage_list") {
            const ctx = await buildAdminContext(request, supabase);
            if (!canOpenAppAdmin(ctx)) {
                return NextResponse.json({ error: "需要应用管理权限" }, { status: 403 });
            }

            const [{ data: apps, error: appsErr }, { data: betaCodes }, { data: managers }] = await Promise.all([
                supabase.from("apps").select("*").order("order", { ascending: true }),
                supabase.from("app_beta_codes").select("*"),
                supabase.from("app_managers").select("*"),
            ]);
            if (appsErr) throw appsErr;

            const visibleApps = filterAppsForAdmin((apps || []) as StoreAppItem[], ctx);
            const visibleAppIds = new Set(visibleApps.map((a) => a.app_id));

            return NextResponse.json({
                success: true,
                data: {
                    apps: visibleApps,
                    beta_codes: ((betaCodes || []) as StoreAppBetaCode[]).filter((c: StoreAppBetaCode) => visibleAppIds.has(String(c.app_id))),
                    managers: ((managers || []) as AppManagerRecord[]).filter((m: AppManagerRecord) => visibleAppIds.has(String(m.app_id))),
                    can_manage_all: isBigManager(ctx),
                    role: ctx.role,
                },
            });
        }

        // ---------- 查询指定 app 的内测码（需有该 app 管理权） ----------
        if (action === "list_beta_codes") {
            const ctx = await buildAdminContext(request, supabase);
            const appId = searchParams.get("app_id") || "";
            if (!canManageApp(ctx, appId)) {
                return NextResponse.json({ error: "无权管理该应用" }, { status: 403 });
            }
            const { data, error } = await supabase
                .from("app_beta_codes")
                .select("*")
                .eq("app_id", appId);
            if (error) throw error;
            return NextResponse.json({ success: true, data: data || [] });
        }

        // ---------- 查询指定 app 的管理员（仅 super_admin） ----------
        if (action === "list_managers") {
            const ctx = await buildAdminContext(request, supabase);
            if (!canAssignManagers(ctx)) {
                return NextResponse.json({ error: "仅超级管理员可分配应用管理员" }, { status: 403 });
            }
            const appId = searchParams.get("app_id") || "";
            if (!appId) {
                return NextResponse.json({ error: "缺少应用 ID" }, { status: 400 });
            }
            const { data, error } = await supabase
                .from("app_managers")
                .select("*")
                .eq("app_id", appId)
                .order("created_at", { ascending: false });
            if (error) throw error;
            return NextResponse.json({ success: true, data: data || [] });
        }

        return NextResponse.json({ error: "未知 action" }, { status: 400 });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        const status = message.includes("未登录") ? 401
            : message.includes("需要管理员") || message.includes("缺少权限") || message.includes("无权") ? 403
            : 500;
        return NextResponse.json({ error: message }, { status });
    }
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { action } = body;
        const supabase = getSupabaseClient();

        // 所有写操作都要求管理员身份；细粒度/小管理权限在各 action 内校验
        const ctx = await buildAdminContext(request, supabase);

        // ---------------- 创建应用（仅大管理） ----------------
        if (action === "create_app") {
            if (!canCreateApp(ctx)) {
                return NextResponse.json({ error: "需要应用管理权限" }, { status: 403 });
            }
            const app: Partial<StoreAppItem> = body.app || {};

            // 新应用排到末尾
            const { data: lastApp } = await supabase
                .from("apps")
                .select("order")
                .order("order", { ascending: false })
                .limit(1)
                .single();
            const nextOrder = (lastApp?.order ?? -1) + 1;

            const now = new Date().toISOString();
            const insert: StoreAppItem = {
                id: crypto.randomUUID(),
                app_id: app.app_id || `app_${Date.now()}`,
                name: app.name || "未命名应用",
                icon: app.icon || "📦",
                developer: app.developer || "米米宇宙",
                category: app.category || "其他",
                description: app.description || "",
                features: Array.isArray(app.features) ? app.features : [],
                screenshots: Array.isArray(app.screenshots) ? app.screenshots : [],
                version: app.version || "1.0.0",
                status: (app.status as AppStatus) || "dev",
                updated_at: now,
                expected_release: app.expected_release,
                beta_info: app.beta_info || "",
                beta_wipe: app.beta_wipe ?? false,
                beta_slots: app.beta_slots || 0,
                beta_used_slots: 0,
                route: app.route || app.app_id || "",
                order: app.order ?? nextOrder,
                is_external: app.is_external ?? false
            };

            const { data, error } = await supabase.from("apps").insert(insert).select().single();
            if (error) throw error;

            await logAudit(
                ctx.userId,
                ctx.username,
                "create_app",
                "app",
                insert.id,
                { app_name: insert.name, app_id: insert.app_id, status: insert.status }
            );

            return NextResponse.json({ success: true, data });
        }

        // ---------------- 更新应用（大管理全部 / 小管理仅被分配 app） ----------------
        if (action === "update_app") {
            const { id, ...rest } = (body.app || {}) as Record<string, unknown>;
            if (!id) {
                return NextResponse.json({ error: "缺少应用 ID" }, { status: 400 });
            }
            const targetAppId = await resolveAppId(supabase, String(id));
            if (!targetAppId) {
                return NextResponse.json({ error: "应用不存在" }, { status: 404 });
            }
            if (!canManageApp(ctx, targetAppId)) {
                return NextResponse.json({ error: "无权管理该应用" }, { status: 403 });
            }

            // 小管理字段白名单过滤（大管理原样）
            const updates = sanitizeUpdatePayload(ctx, rest);
            delete updates.id;

            const { data, error } = await supabase
                .from("apps")
                .update({ ...updates, updated_at: new Date().toISOString() })
                .eq("id", id)
                .select()
                .single();
            if (error) throw error;

            await logAudit(
                ctx.userId,
                ctx.username,
                "update_app",
                "app",
                String(id),
                { app_id: targetAppId, updates: Object.keys(updates), big_manager: isBigManager(ctx) }
            );

            return NextResponse.json({ success: true, data });
        }

        // ---------------- 删除应用（仅大管理） ----------------
        if (action === "delete_app") {
            if (!canDeleteApp(ctx)) {
                return NextResponse.json({ error: "无权删除应用" }, { status: 403 });
            }
            const { id } = body as { id?: string };
            const appId = body.app_id ? String(body.app_id) : undefined;
            const targetAppId = await resolveAppId(supabase, id, appId);
            if (!targetAppId) {
                return NextResponse.json({ error: "应用不存在" }, { status: 404 });
            }

            let query = supabase.from("apps").delete();
            query = id ? query.eq("id", id) : query.eq("app_id", targetAppId);
            const { error } = await query;
            if (error) throw error;

            await logAudit(
                ctx.userId,
                ctx.username,
                "delete_app",
                "app",
                id || targetAppId,
                { app_id: targetAppId }
            );

            return NextResponse.json({ success: true });
        }

        // ---------------- 排序（仅大管理，全局操作） ----------------
        if (action === "reorder_apps") {
            if (!canReorderApps(ctx)) {
                return NextResponse.json({ error: "无权调整应用排序" }, { status: 403 });
            }
            const orderList: string[] = Array.isArray(body.order) ? body.order.map(String) : [];
            if (orderList.length === 0) {
                return NextResponse.json({ error: "缺少排序数据" }, { status: 400 });
            }
            for (let i = 0; i < orderList.length; i++) {
                const appId = orderList[i];
                const { error } = await supabase
                    .from("apps")
                    .update({ order: i, updated_at: new Date().toISOString() })
                    .eq("app_id", appId);
                if (error) throw error;
            }

            await logAudit(
                ctx.userId,
                ctx.username,
                "reorder_apps",
                "app",
                "batch",
                { count: orderList.length }
            );

            return NextResponse.json({ success: true });
        }

        // ---------------- 批量上下架（逐个校验权限） ----------------
        if (action === "batch_update_status") {
            const status = body.status as AppStatus;
            const ids: string[] = Array.isArray(body.ids) ? body.ids.map(String) : [];
            const appIds: string[] = Array.isArray(body.app_ids) ? body.app_ids.map(String) : [];
            if (!["hidden", "dev", "beta", "published"].includes(status)) {
                return NextResponse.json({ error: "状态值不合法" }, { status: 400 });
            }
            if (ids.length === 0 && appIds.length === 0) {
                return NextResponse.json({ error: "缺少应用 ID" }, { status: 400 });
            }

            // 解析为 TEXT app_id 并逐个校验
            const resolved: { key: string; appId: string; useUuid: boolean }[] = [];
            for (const appId of appIds) {
                resolved.push({ key: appId, appId, useUuid: false });
            }
            for (const uuid of ids) {
                const resolvedAppId = await resolveAppId(supabase, uuid);
                if (!resolvedAppId) {
                    return NextResponse.json({ error: `应用不存在：${uuid}` }, { status: 404 });
                }
                resolved.push({ key: uuid, appId: resolvedAppId, useUuid: true });
            }

            const check = checkBatchStatusUpdate(ctx, resolved.map((r) => r.appId));
            if (!check.ok) {
                return NextResponse.json(
                    { error: "部分应用无权操作", denied_app_ids: check.deniedAppIds },
                    { status: 403 }
                );
            }

            for (const item of resolved) {
                const { error } = await supabase
                    .from("apps")
                    .update({ status, updated_at: new Date().toISOString() })
                    .eq(item.useUuid ? "id" : "app_id", item.key);
                if (error) throw error;
            }

            await logAudit(
                ctx.userId,
                ctx.username,
                "batch_update_status",
                "app",
                "batch",
                { status, count: resolved.length, app_ids: resolved.map((r) => r.appId) }
            );

            return NextResponse.json({ success: true, updated: resolved.length });
        }

        // ---------------- 批量删除（仅大管理） ----------------
        if (action === "batch_delete_apps") {
            const ids: string[] = Array.isArray(body.ids) ? body.ids.map(String) : [];
            const appIds: string[] = Array.isArray(body.app_ids) ? body.app_ids.map(String) : [];
            if (ids.length === 0 && appIds.length === 0) {
                return NextResponse.json({ error: "缺少应用 ID" }, { status: 400 });
            }
            const check = checkBatchDelete(ctx, [...ids, ...appIds]);
            if (!check.ok) {
                return NextResponse.json(
                    { error: "无权批量删除应用", denied_app_ids: check.deniedAppIds },
                    { status: 403 }
                );
            }

            const targetAppIds: string[] = [];
            for (const appId of appIds) {
                const resolved = await resolveAppId(supabase, undefined, appId);
                if (resolved) targetAppIds.push(resolved);
            }
            for (const uuid of ids) {
                const resolved = await resolveAppId(supabase, uuid);
                if (resolved) targetAppIds.push(resolved);
            }
            if (targetAppIds.length > 0) {
                const { error } = await supabase.from("apps").delete().in("app_id", targetAppIds);
                if (error) throw error;
            }

            await logAudit(
                ctx.userId,
                ctx.username,
                "batch_delete_apps",
                "app",
                "batch",
                { count: targetAppIds.length, app_ids: targetAppIds }
            );

            return NextResponse.json({ success: true, deleted: targetAppIds.length });
        }

        // ---------------- 设置/修改内测码（upsert，一个 app 一条） ----------------
        if (action === "set_beta_code") {
            const app_id = body.app_id ? String(body.app_id) : "";
            const code = body.code ? String(body.code) : "";
            const max_uses = Number(body.max_uses) || 1;

            const validation = validateBetaCodeInput(app_id, code);
            if (!validation.valid) {
                return NextResponse.json({ error: validation.error }, { status: 400 });
            }
            if (!canManageApp(ctx, app_id)) {
                return NextResponse.json({ error: "无权管理该应用" }, { status: 403 });
            }

            const { data: existing } = await supabase
                .from("app_beta_codes")
                .select("id")
                .eq("app_id", app_id)
                .maybeSingle();

            let resultData: unknown;
            if (existing?.id) {
                const { data, error } = await supabase
                    .from("app_beta_codes")
                    .update({ code: code.trim(), max_uses, used_count: 0 })
                    .eq("id", existing.id)
                    .select()
                    .single();
                if (error) throw error;
                resultData = data;
            } else {
                const insert: StoreAppBetaCode = {
                    id: crypto.randomUUID(),
                    app_id,
                    code: code.trim(),
                    max_uses,
                    used_count: 0,
                    created_by: ctx.userId,
                    created_at: new Date().toISOString()
                };
                const { data, error } = await supabase.from("app_beta_codes").insert(insert).select().single();
                if (error) throw error;
                resultData = data;
            }

            // 换码后重置应用侧已用名额计数
            await supabase.from("apps").update({ beta_used_slots: 0 }).eq("app_id", app_id);

            await logAudit(
                ctx.userId,
                ctx.username,
                "set_beta_code",
                "app",
                app_id,
                { max_uses, updated: !!existing?.id }
            );

            return NextResponse.json({ success: true, data: resultData });
        }

        // ---------------- 清除内测码 ----------------
        if (action === "delete_beta_code") {
            const app_id = body.app_id ? String(body.app_id) : "";
            const rowId = body.id ? String(body.id) : "";
            if (!app_id && !rowId) {
                return NextResponse.json({ error: "缺少参数" }, { status: 400 });
            }

            // 定位 app_id 用于权限校验
            let targetAppId = app_id;
            if (!targetAppId && rowId) {
                const { data: row } = await supabase
                    .from("app_beta_codes")
                    .select("app_id")
                    .eq("id", rowId)
                    .maybeSingle();
                targetAppId = row?.app_id ? String(row.app_id) : "";
            }
            if (!canManageApp(ctx, targetAppId)) {
                return NextResponse.json({ error: "无权管理该应用" }, { status: 403 });
            }

            let delQuery = supabase.from("app_beta_codes").delete();
            delQuery = rowId ? delQuery.eq("id", rowId) : delQuery.eq("app_id", targetAppId);
            const { error } = await delQuery;
            if (error) throw error;

            await logAudit(
                ctx.userId,
                ctx.username,
                "delete_beta_code",
                "app",
                targetAppId,
                {}
            );

            return NextResponse.json({ success: true });
        }

        // ---------------- 搜索可分配的管理员（仅 super_admin） ----------------
        if (action === "search_admins") {
            if (!canAssignManagers(ctx)) {
                return NextResponse.json({ error: "仅超级管理员可分配应用管理员" }, { status: 403 });
            }
            const q = String(body.q || "").trim();
            let query = supabase
                .from("users")
                .select("id, username, nickname, role")
                .in("role", ["admin", "super_admin"])
                .order("created_at", { ascending: false })
                .limit(20);
            if (q) {
                query = query.or(`username.ilike.%${q}%,nickname.ilike.%${q}%`);
            }
            const { data, error } = await query;
            if (error) throw error;
            return NextResponse.json({ success: true, data: data || [] });
        }

        // ---------------- 给 app 添加小管理（仅 super_admin） ----------------
        if (action === "add_app_manager") {
            if (!canAssignManagers(ctx)) {
                return NextResponse.json({ error: "仅超级管理员可分配应用管理员" }, { status: 403 });
            }
            const app_id = body.app_id ? String(body.app_id) : "";
            const username = body.username ? String(body.username) : "";
            const validation = validateManagerAssign(app_id, username);
            if (!validation.valid) {
                return NextResponse.json({ error: validation.error }, { status: 400 });
            }

            const { data: app } = await supabase.from("apps").select("id, app_id").eq("app_id", app_id).maybeSingle();
            if (!app) {
                return NextResponse.json({ error: "应用不存在" }, { status: 404 });
            }

            const { data: target, error: userErr } = await supabase
                .from("users")
                .select("id, username, role")
                .eq("username", username.trim())
                .maybeSingle();
            if (userErr) throw userErr;
            if (!target) {
                return NextResponse.json({ error: "用户不存在" }, { status: 404 });
            }
            if (target.role !== "admin") {
                return NextResponse.json({ error: "只能将管理员（admin）分配为应用管理员，超级管理员默认拥有全部权限" }, { status: 400 });
            }

            const { data: existing } = await supabase
                .from("app_managers")
                .select("id")
                .eq("app_id", app_id)
                .eq("user_id", target.id)
                .maybeSingle();
            if (existing?.id) {
                return NextResponse.json({ success: true, data: { id: existing.id, duplicated: true } });
            }

            const { data: row, error: insertErr } = await supabase
                .from("app_managers")
                .insert({
                    id: crypto.randomUUID(),
                    app_id,
                    user_id: target.id,
                    username: target.username,
                    created_at: new Date().toISOString(),
                })
                .select()
                .single();
            if (insertErr) throw insertErr;

            await logAudit(
                ctx.userId,
                ctx.username,
                "add_app_manager",
                "app_manager",
                app_id,
                { target_username: target.username, target_user_id: target.id }
            );

            return NextResponse.json({ success: true, data: row });
        }

        // ---------------- 移除 app 的小管理（仅 super_admin） ----------------
        if (action === "remove_app_manager") {
            if (!canAssignManagers(ctx)) {
                return NextResponse.json({ error: "仅超级管理员可分配应用管理员" }, { status: 403 });
            }
            const app_id = body.app_id ? String(body.app_id) : "";
            const user_id = body.user_id ? String(body.user_id) : "";
            const rowId = body.id ? String(body.id) : "";
            if (!app_id || (!user_id && !rowId)) {
                return NextResponse.json({ error: "缺少参数" }, { status: 400 });
            }

            let delQuery = supabase.from("app_managers").delete().eq("app_id", app_id);
            delQuery = rowId ? delQuery.eq("id", rowId) : delQuery.eq("user_id", user_id);
            const { error } = await delQuery;
            if (error) throw error;

            await logAudit(
                ctx.userId,
                ctx.username,
                "remove_app_manager",
                "app_manager",
                app_id,
                { target_user_id: user_id || rowId }
            );

            return NextResponse.json({ success: true });
        }

        return NextResponse.json({ error: "未知 action" }, { status: 400 });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes("未登录") || message.includes("登录已过期")) {
            return NextResponse.json({ error: message }, { status: 401 });
        }
        if (message.includes("需要管理员") || message.includes("缺少权限") || message.includes("无权") || message.includes("仅超级管理员")) {
            return NextResponse.json({ error: message }, { status: 403 });
        }
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
