import { getSupabaseClient } from "@/storage/database/supabase-client";
import type { NextRequest } from "next/server";

export interface VerifiedUser {
    id: string;
    userId: string;
    username: string;
    role: string;
    isAdmin: boolean;
    banStatus?: string;
    banUntil?: string | null;
    banReason?: string;
    verifyStatus?: string;
}

export async function verifyToken(token: string | undefined | null): Promise<VerifiedUser | null> {
    if (!token) return null;
    try {
        const supabase = getSupabaseClient();
        const { data: session, error } = await supabase
            .from("user_sessions")
            .select("user_id, token, expires_at")
            .eq("token", token)
            .single();
        if (error || !session) return null;
        if (session.expires_at && new Date(session.expires_at) < new Date()) return null;

        const { data: user, error: userError } = await supabase
            .from("users")
            .select("id, username, role, status, ban_status, ban_until, ban_reason")
            .eq("id", session.user_id)
            .single();
        if (userError || !user || user.status !== "approved") return null;

        // 临时封禁到期自动解除
        if (user.ban_status === "temp_banned" && user.ban_until && new Date(user.ban_until) <= new Date()) {
            await supabase
                .from("users")
                .update({
                    ban_status: null,
                    ban_until: null,
                    ban_reason: null,
                    banned_by: null,
                    banned_at: null,
                })
                .eq("id", user.id);
            user.ban_status = null;
            user.ban_until = null;
        }

        return {
            id: user.id,
            userId: user.id,
            username: user.username,
            role: user.role,
            isAdmin: user.role === "admin" || user.role === "super_admin",
            banStatus: user.ban_status,
            banUntil: user.ban_until,
            banReason: user.ban_reason,
            verifyStatus: user.status,
        };
    } catch {
        return null;
    }
}

export async function requireAuth(token: string | undefined | null): Promise<VerifiedUser> {
    const user = await verifyToken(token);
    if (!user) {
        throw new Error("未登录或登录已过期");
    }
    return user;
}

export async function requireAdmin(token: string | undefined | null): Promise<VerifiedUser> {
    const user = await requireAuth(token);
    if (!user.isAdmin) {
        throw new Error("需要管理员权限");
    }
    return user;
}

export async function extractTokenFromRequest(request: NextRequest): Promise<string | undefined> {
    const authHeader = request.headers.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
        return authHeader.slice(7);
    }
    try {
        const cloned = request.clone();
        const body = await cloned.json();
        return body?.authToken || body?.token || undefined;
    } catch {
        return undefined;
    }
}

export async function requireAuthRequest(request: NextRequest): Promise<VerifiedUser> {
    const token = await extractTokenFromRequest(request);
    return requireAuth(token);
}

export async function requireAdminRequest(request: NextRequest): Promise<VerifiedUser> {
    const token = await extractTokenFromRequest(request);
    return requireAdmin(token);
}

export type AdminPermission =
    | "user_review"
    | "user_ban"
    | "user_manage"
    | "invite_manage"
    | "forum_manage"
    | "pickup_manage"
    | "schedule_manage"
    | "stats_view"
    | "tree_view"
    | "system_setting"
    | "review_queue"
    | "permissions"
    | "audit_log"
    | "app_manage";

const ROLE_PERMISSIONS: Record<string, AdminPermission[]> = {
    super_admin: [
        "user_review",
        "user_ban",
        "user_manage",
        "invite_manage",
        "forum_manage",
        "pickup_manage",
        "schedule_manage",
        "stats_view",
        "tree_view",
        "system_setting",
        "review_queue",
        "permissions",
        "audit_log",
        "app_manage",
    ],
    admin: ["user_review", "user_ban", "user_manage", "invite_manage", "forum_manage", "pickup_manage", "schedule_manage", "stats_view", "tree_view", "review_queue", "audit_log"],
};

export function hasPermission(user: VerifiedUser, permission: AdminPermission): boolean {
    // 仅同步判断（用于无法访问 DB 的场景）；后端鉴权请用 requirePermissionRequest
    return ROLE_PERMISSIONS[user.role]?.includes(permission) ?? false;
}

/**
 * 读取管理员的实际生效权限：
 * - super_admin：拥有全部权限
 * - admin：优先用 users.admin_permissions 单独分配；该字段为空时回退到角色默认权限
 */
export async function loadUserPermissions(user: VerifiedUser): Promise<Set<AdminPermission>> {
    if (user.role === "super_admin") {
        return new Set<AdminPermission>(ROLE_PERMISSIONS.super_admin);
    }
    const supabase = getSupabaseClient();
    const { data } = await supabase
        .from("users")
        .select("admin_permissions")
        .eq("id", user.id)
        .single();
    const assigned = (data?.admin_permissions as AdminPermission[] | null) ?? null;
    if (assigned && Array.isArray(assigned) && assigned.length > 0) {
        return new Set<AdminPermission>(assigned);
    }
    return new Set<AdminPermission>(ROLE_PERMISSIONS.admin ?? []);
}

export async function hasPermissionDb(user: VerifiedUser, permission: AdminPermission): Promise<boolean> {
    const perms = await loadUserPermissions(user);
    return perms.has(permission);
}

export async function requirePermissionRequest(request: NextRequest, permission: AdminPermission): Promise<VerifiedUser> {
    const user = await requireAdminRequest(request);
    const allowed = await hasPermissionDb(user, permission);
    if (!allowed) {
        throw new Error(`缺少权限：${permission}`);
    }
    return user;
}

export async function logAudit(
    adminId: string,
    adminUsername: string,
    action: string,
    targetType: string,
    targetId: string,
    details?: Record<string, unknown>
): Promise<void> {
    try {
        const supabase = getSupabaseClient();
        await supabase.from("audit_log").insert({
            operator_id: adminId,
            operator_username: adminUsername,
            action_type: action,
            target_type: targetType,
            target_id: targetId,
            details: details ?? {},
        });
    } catch {
        // 日志失败不应阻塞主流程
    }
}
