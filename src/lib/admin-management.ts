// ========== 管理员管理 — 纯业务逻辑 ==========

import type { AdminPermission } from "@/lib/auth";

export interface AdminUser {
  id: string;
  username: string;
  role: "admin" | "super_admin";
  admin_permissions: AdminPermission[] | null;
}

export interface ReviewAssignmentStats {
  pending_count: number;
  reviewed_count: number;
  overdue_count: number;
}

export interface AdminStats {
  admin_id: string;
  admin_username: string;
  pending_count: number;
  reviewed_count: number;
  overdue_count: number;
}

export interface AdminModule {
  module: string;
  permission: AdminPermission;
  granted: boolean;
}

/**
 * Get admin statistics: pending assigned, reviewed, and overdue counts.
 * Pure function — caller supplies the data.
 */
export function getAdminStats(
  adminId: string,
  adminUsername: string,
  assignments: Array<{
    assigned_to: string | null;
    status: string;
    deadline: string | null;
    reviewed_at: string | null;
  }>
): AdminStats {
  const myAssignments = assignments.filter((a) => a.assigned_to === adminId);

  const pendingCount = myAssignments.filter((a) => a.status === "pending").length;
  const reviewedCount = myAssignments.filter((a) => a.status === "reviewed").length;
  const now = Date.now();
  const overdueCount = myAssignments.filter((a) => {
    if (a.status !== "pending") return false;
    if (!a.deadline) return false;
    return new Date(a.deadline).getTime() < now;
  }).length;

  return {
    admin_id: adminId,
    admin_username: adminUsername,
    pending_count: pendingCount,
    reviewed_count: reviewedCount,
    overdue_count: overdueCount,
  };
}

/**
 * Check if a manager can manage a target admin.
 * Only super_admin can manage other admins' permissions.
 */
export function canManageAdmin(manager: AdminUser, target: AdminUser): boolean {
  if (manager.role === "super_admin") {
    return manager.id !== target.id;
  }
  return false;
}

/**
 * Get the list of modules (permission groups) for an admin,
 * with a flag indicating whether each is granted.
 */
export function getAdminModules(
  admin: AdminUser,
  allPermissions: AdminPermission[]
): AdminModule[] {
  if (admin.role === "super_admin") {
    return allPermissions.map((perm) => ({
      module: perm,
      permission: perm,
      granted: true,
    }));
  }

  const granted = new Set(admin.admin_permissions ?? []);
  return allPermissions.map((perm) => ({
    module: perm,
    permission: perm,
    granted: granted.has(perm),
  }));
}
