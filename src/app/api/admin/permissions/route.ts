import { NextRequest } from "next/server";
import {
  requirePermissionRequest,
  logAudit,
  type AdminPermission,
} from "@/lib/auth";
import { getSupabaseClient } from "@/storage/database/supabase-client";

const ALL_PERMISSIONS: AdminPermission[] = [
  "stats_view",
  "user_review",
  "user_ban",
  "user_manage",
  "invite_manage",
  "forum_manage",
  "pickup_manage",
  "schedule_manage",
  "tree_view",
  "system_setting",
  "review_queue",
  "permissions",
  "audit_log",
  "app_manage",
];

function jsonResponse<T>(success: boolean, data?: T, error?: string) {
  return Response.json({ success, data, error });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.clone().json().catch(() => ({}));
    const { action } = body;

    if (!action || typeof action !== "string") {
      return jsonResponse(false, undefined, "缺少 action 参数");
    }

    const supabase = await getSupabaseClient();

    if (action === "get_my_permissions") {
      const adminUser = await requirePermissionRequest(request, "permissions");
      let permissions: AdminPermission[] = [...ALL_PERMISSIONS];
      if (adminUser.role !== "super_admin") {
        const { data: user } = await supabase
          .from("users")
          .select("admin_permissions")
          .eq("id", adminUser.userId)
          .single();
        permissions = ((user?.admin_permissions as AdminPermission[]) || [])
          .filter((p): p is AdminPermission => ALL_PERMISSIONS.includes(p));
      }
      return jsonResponse(true, {
        permissions,
        role: adminUser.role,
        userId: adminUser.userId,
      });
    }

    if (action === "list_admins") {
      await requirePermissionRequest(request, "permissions");
      const { data, error } = await supabase
        .from("users")
        .select("id, username, nickname, role, admin_permissions")
        .in("role", ["admin", "super_admin"])
        .order("created_at", { ascending: false });

      if (error) {
        return jsonResponse(false, undefined, error.message);
      }

      return jsonResponse(true, { list: data || [] });
    }

    if (action === "update_permissions") {
      const adminUser = await requirePermissionRequest(request, "permissions");
      if (adminUser.role !== "super_admin") {
        return jsonResponse(false, undefined, "仅超级管理员可修改权限");
      }

      const { adminUserId, permissions } = body;
      if (!adminUserId || !Array.isArray(permissions)) {
        return jsonResponse(false, undefined, "参数错误");
      }

      const { data: targetUser } = await supabase
        .from("users")
        .select("id, username, role, admin_permissions")
        .eq("id", adminUserId)
        .single();

      if (!targetUser) {
        return jsonResponse(false, undefined, "目标用户不存在");
      }
      if (targetUser.role === "super_admin") {
        return jsonResponse(false, undefined, "不能修改超级管理员权限");
      }

      const validPermissions = permissions.filter((p: string) =>
        ALL_PERMISSIONS.includes(p as AdminPermission),
      ) as AdminPermission[];

      const { error: updateError } = await supabase
        .from("users")
        .update({ admin_permissions: validPermissions })
        .eq("id", adminUserId);

      if (updateError) {
        return jsonResponse(false, undefined, updateError.message);
      }

      await logAudit(
        adminUser.userId,
        adminUser.username,
        "update_permissions",
        "user",
        adminUserId,
        {
          previous: targetUser.admin_permissions,
          current: validPermissions,
          targetUsername: targetUser.username,
        },
      );

      return jsonResponse(true, { updated: true });
    }

    return jsonResponse(false, undefined, "未知的 action");
  } catch (err) {
    const message = err instanceof Error ? err.message : "服务器错误";
    return jsonResponse(false, undefined, message);
  }
}
