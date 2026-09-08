/**
 * 独立「应用管理」App 业务逻辑层（B 方案权限模型）
 *
 * 本文件只包含纯函数与类型定义，不依赖 NextRequest / Supabase / React，
 * 供 API 路由（src/app/api/apps/route.ts）、前端（app-admin-app.tsx）
 * 与单元测试（__tests__/app-store-permissions.test.ts）共用。
 *
 * 权限模型：
 *   - 大管理：super_admin，或拥有 app_manage 权限的 admin → 可管理所有应用
 *     （创建/删除/排序/分配小管理/批量操作）
 *   - 小管理：admin 角色且被超管在 app_managers 表分配到特定 app →
 *     只能编辑/上下架/内测码自己被分配的 app，不能创建/删除/排序
 *   - 普通用户（role=user）与未登录用户：无任何管理权限
 */

import type { AppStatus, StoreAppItem, StoreAppBetaCode } from "@/lib/apps";

// ===================== 类型 =====================

export type AppAdminRole = "super_admin" | "admin" | "user" | null;

/** 管理员上下文（由 API 层从 verifyToken / users.admin_permissions / app_managers 汇总） */
export interface AdminContext {
    userId: string;
    username: string;
    role: AppAdminRole;
    /** users.admin_permissions 中被授予的细粒度权限（admin 角色可被超管授予 app_manage） */
    permissions: string[];
    /** 小管理：被分配到的 app 的 app_id（TEXT 业务标识）集合 */
    managedAppIds: string[];
}

/** app_managers 表记录 */
export interface AppManagerRecord {
    id: string;
    app_id: string;
    user_id: string;
    username: string;
    created_at: string;
}

export interface AppAdminStats {
    total: number;
    hidden: number;
    dev: number;
    beta: number;
    published: number;
    /** 内测码已用名额合计 */
    betaUsed: number;
    /** 内测码总额度合计 */
    betaMax: number;
    /** 已配置内测码的应用数 */
    betaCodeCount: number;
}

// ===================== 角色 / 权限判定 =====================

/** 细粒度权限清单（与 src/lib/auth.ts 的 AdminPermission 保持同步） */
export const ADMIN_PERMISSIONS: string[] = [
    "stats_view",
    "user_review",
    "user_ban",
    "user_manage",
    "invite_manage",
    "forum_manage",
    "tree_view",
    "system_setting",
    "review_queue",
    "permissions",
    "audit_log",
    "app_manage",
];

/** 未登录或普通用户 → 不是管理员 */
export function isAdminRole(role: AppAdminRole): boolean {
    return role === "super_admin" || role === "admin";
}

/** 是否拥有某个细粒度权限（super_admin 全量放行；admin 看 admin_permissions） */
export function hasAppPermission(role: AppAdminRole, permissions: string[] | undefined, permission: string): boolean {
    if (role === "super_admin") return true;
    if (role !== "admin") return false;
    return Array.isArray(permissions) && permissions.includes(permission);
}

/** 大管理：super_admin 或持有 app_manage 的 admin，可管理所有应用 */
export function isBigManager(ctx: Pick<AdminContext, "role" | "permissions">): boolean {
    return hasAppPermission(ctx.role, ctx.permissions, "app_manage");
}

/** 能否进入独立「应用管理」App：大管理，或被分配了至少一个 app 的小管理 */
export function canOpenAppAdmin(ctx: AdminContext): boolean {
    return isBigManager(ctx) || (ctx.role === "admin" && ctx.managedAppIds.length > 0);
}

/**
 * 能否管理指定 app（编辑 / 上下架 / 内测码）
 * - 大管理：所有 app
 * - 小管理：仅 app_managers 中分配的 app
 */
export function canManageApp(ctx: AdminContext, appId: string | null | undefined): boolean {
    if (!appId || !isAdminRole(ctx.role)) return false;
    if (isBigManager(ctx)) return true;
    return ctx.managedAppIds.includes(appId);
}

/** 创建应用：仅大管理 */
export function canCreateApp(ctx: AdminContext): boolean {
    return isBigManager(ctx);
}

/** 删除应用：仅大管理（单删与批删一致） */
export function canDeleteApp(ctx: AdminContext): boolean {
    return isBigManager(ctx);
}

/** 排序：仅大管理（排序是全局操作） */
export function canReorderApps(ctx: AdminContext): boolean {
    return isBigManager(ctx);
}

/** 添加/移除小管理：仅 super_admin（admin 即使有 app_manage 也不能分配） */
export function canAssignManagers(ctx: AdminContext): boolean {
    return ctx.role === "super_admin";
}

/**
 * 小管理执行 update_app 时的白名单字段（大管理不过滤）。
 * 禁止小管理修改 app_id（业务标识）、order（全局排序）、is_external（路由形态）。
 * 注意：id 是定位主键，必须保留；status 允许（上下架）。
 */
export const SMALL_MANAGER_UPDATE_ALLOWED: string[] = [
    "id",
    "name",
    "icon",
    "developer",
    "category",
    "description",
    "features",
    "screenshots",
    "version",
    "status",
    "route",
    "beta_info",
    "beta_wipe",
    "beta_slots",
    "beta_used_slots",
    "expected_release",
    "updated_at",
];

/** 过滤 update_app 载荷：小管理去掉白名单以外的字段；大管理原样返回 */
export function sanitizeUpdatePayload(
    ctx: AdminContext,
    payload: Record<string, unknown>,
): Record<string, unknown> {
    if (isBigManager(ctx)) return payload;
    const result: Record<string, unknown> = {};
    for (const key of SMALL_MANAGER_UPDATE_ALLOWED) {
        if (key in payload) result[key] = payload[key];
    }
    return result;
}

// ===================== 列表可见性 =====================

/**
 * 独立管理 App 的列表过滤：
 * - 大管理 → 全部 app
 * - 小管理 → 仅被分配的 app
 * （未登录/普通用户应在入口处被 403 拦截，这里兜底返回空）
 */
export function filterAppsForAdmin(apps: StoreAppItem[], ctx: AdminContext): StoreAppItem[] {
    if (!isAdminRole(ctx.role)) return [];
    if (isBigManager(ctx)) return apps;
    const allowed = new Set(ctx.managedAppIds);
    return apps.filter((a) => allowed.has(a.app_id));
}

// ===================== 排序 =====================

/**
 * 上移/下移后生成新的 order 序列（纯函数）。
 * 输入按当前展示顺序排列的 app_id 数组，返回 app_id → 新 order 的映射（0 起）。
 */
export function buildReorderMap(orderedAppIds: string[]): Record<string, number> {
    const map: Record<string, number> = {};
    orderedAppIds.forEach((id, index) => {
        map[id] = index;
    });
    return map;
}

/**
 * 在有序数组中移动一项（上移 dir=-1 / 下移 dir=+1），返回新数组。
 * 已在边界时原样返回。
 */
export function moveItem<T>(list: T[], index: number, direction: -1 | 1): T[] {
    const target = index + direction;
    if (index < 0 || index >= list.length || target < 0 || target >= list.length) {
        return list;
    }
    const next = [...list];
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    return next;
}

// ===================== 批量操作权限 =====================

export interface BatchCheckResult {
    ok: boolean;
    /** 无权限操作的 app_id 列表（空数组 = 全部有权限） */
    deniedAppIds: string[];
}

/**
 * 批量操作逐个校验：
 * - 批量上下架：大管理全过；小管理逐个校验
 * - 批量删除：仅大管理（小管理对所有项都无权）
 */
export function checkBatchStatusUpdate(ctx: AdminContext, appIds: string[]): BatchCheckResult {
    const denied = appIds.filter((id) => !canManageApp(ctx, id));
    return { ok: denied.length === 0, deniedAppIds: denied };
}

export function checkBatchDelete(ctx: AdminContext, appIds: string[]): BatchCheckResult {
    if (isBigManager(ctx)) return { ok: true, deniedAppIds: [] };
    // 小管理不能删除任何应用
    return { ok: false, deniedAppIds: [...new Set(appIds)] };
}

// ===================== 统计概览 =====================

export function computeAppStats(
    apps: Pick<StoreAppItem, "status">[],
    betaCodes: Pick<StoreAppBetaCode, "max_uses" | "used_count">[],
): AppAdminStats {
    const stats: AppAdminStats = {
        total: apps.length,
        hidden: 0,
        dev: 0,
        beta: 0,
        published: 0,
        betaUsed: 0,
        betaMax: 0,
        betaCodeCount: betaCodes.length,
    };
    for (const app of apps) {
        const status: AppStatus = app.status;
        if (status === "hidden") stats.hidden += 1;
        else if (status === "dev") stats.dev += 1;
        else if (status === "beta") stats.beta += 1;
        else if (status === "published") stats.published += 1;
    }
    for (const code of betaCodes) {
        stats.betaUsed += code.used_count ?? 0;
        stats.betaMax += code.max_uses ?? 0;
    }
    return stats;
}

// ===================== 内测码 =====================

/** set_beta_code 入参校验（app_id 为 app 的 TEXT 业务标识） */
export function validateBetaCodeInput(
    appId: string | null | undefined,
    code: string | null | undefined,
): { valid: boolean; error?: string } {
    if (!appId || String(appId).trim() === "") {
        return { valid: false, error: "缺少应用 ID" };
    }
    if (!code || String(code).trim() === "") {
        return { valid: false, error: "内测码不能为空" };
    }
    return { valid: true };
}

/** 一个 app 只允许一条内测码：设置/修改 = upsert；清除 = delete_beta_code */
export function betaCodeRemaining(code: Pick<StoreAppBetaCode, "max_uses" | "used_count">): number {
    return Math.max(0, (code.max_uses ?? 0) - (code.used_count ?? 0));
}

// ===================== 小管理分配 =====================

/** 分配小管理入参校验：目标必须是已注册管理员账号（role=admin） */
export function validateManagerAssign(
    appId: string | null | undefined,
    username: string | null | undefined,
): { valid: boolean; error?: string } {
    if (!appId || String(appId).trim() === "") {
        return { valid: false, error: "缺少应用 ID" };
    }
    if (!username || String(username).trim() === "") {
        return { valid: false, error: "请输入用户名" };
    }
    return { valid: true };
}

/** 审计动作清单（用于测试与文档对齐） */
export const APP_ADMIN_AUDIT_ACTIONS: string[] = [
    "create_app",
    "update_app",
    "delete_app",
    "set_beta_code",
    "delete_beta_code",
    "reorder_apps",
    "batch_update_status",
    "batch_delete_apps",
    "add_app_manager",
    "remove_app_manager",
];
