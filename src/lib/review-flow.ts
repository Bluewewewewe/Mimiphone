// ========== 两级审核流程 — 纯业务逻辑 ==========

export type ReviewLevel = 0 | 1 | 2;

export interface ReviewUser {
  id: string;
  verify_status: string;
  status: string;
  review_level: ReviewLevel;
  grace_period_end: string | null;
  first_reviewed_by: string | null;
  first_reviewed_at: string | null;
  second_reviewed_by: string | null;
  second_reviewed_at: string | null;
}

export interface ReviewAdmin {
  id: string;
  username: string;
  role: "admin" | "super_admin";
}

export interface ApprovalResult {
  review_level: ReviewLevel;
  verify_status: string;
  status: string;
  grace_period_end: string | null;
  first_reviewed_by: string | null;
  first_reviewed_at: string | null;
  second_reviewed_by: string | null;
  second_reviewed_at: string | null;
}

/** Grace period duration in days */
export const GRACE_PERIOD_DAYS = 30;

/**
 * Check if an admin can perform level-1 review on a user.
 * Conditions:
 * - Admin must be admin or super_admin
 * - User must be pending (verify_status === 'pending')
 * - User review_level must be 0
 */
export function canApproveLevel1(admin: ReviewAdmin, user: ReviewUser): boolean {
  if (admin.role !== "admin" && admin.role !== "super_admin") return false;
  if (user.verify_status !== "pending") return false;
  if (user.review_level !== 0) return false;
  return true;
}

/**
 * Perform level-1 approval. Returns the fields to update on the user record.
 * Sets review_level=1, verify_status='approved', status='approved',
 * and grace_period_end = now + 30 days.
 */
export function approveLevel1(admin: ReviewAdmin, user: ReviewUser): ApprovalResult | { error: string } {
  if (!canApproveLevel1(admin, user)) {
    return { error: "不满足一级审核条件" };
  }

  const now = new Date();
  const graceEnd = new Date(now);
  graceEnd.setDate(graceEnd.getDate() + GRACE_PERIOD_DAYS);

  return {
    review_level: 1,
    verify_status: "approved",
    status: "approved",
    grace_period_end: graceEnd.toISOString(),
    first_reviewed_by: admin.id,
    first_reviewed_at: now.toISOString(),
    second_reviewed_by: null,
    second_reviewed_at: null,
  };
}

/**
 * Check if an admin can perform level-2 review on a user.
 * Conditions:
 * - Admin must be admin or super_admin
 * - User must have review_level === 1
 * - Admin must NOT be the same person who did level-1 review
 * - Grace period must have expired (or be at current time)
 */
export function canApproveLevel2(admin: ReviewAdmin, user: ReviewUser): boolean {
  if (admin.role !== "admin" && admin.role !== "super_admin") return false;
  if (user.review_level !== 1) return false;
  if (user.first_reviewed_by === admin.id) return false;
  return true;
}

/**
 * Perform level-2 approval. Returns the fields to update on the user record.
 * Sets review_level=2 (正式成员).
 */
export function approveLevel2(admin: ReviewAdmin, user: ReviewUser): ApprovalResult | { error: string } {
  if (!canApproveLevel2(admin, user)) {
    return { error: "不满足二级审核条件" };
  }

  const now = new Date();

  return {
    review_level: 2,
    verify_status: "approved",
    status: "approved",
    grace_period_end: user.grace_period_end,
    first_reviewed_by: user.first_reviewed_by,
    first_reviewed_at: user.first_reviewed_at,
    second_reviewed_by: admin.id,
    second_reviewed_at: now.toISOString(),
  };
}

/**
 * Check if a user's grace period has expired.
 */
export function isGracePeriodExpired(user: ReviewUser, now?: Date): boolean {
  if (!user.grace_period_end) return false;
  const currentTime = now ?? new Date();
  return new Date(user.grace_period_end).getTime() <= currentTime.getTime();
}

/**
 * Get the list of admins eligible for level-2 review (excluding the level-1 reviewer).
 * If the level-1 reviewer is a super_admin, level-2 is skipped entirely.
 */
export function getEligibleLevel2Reviewers(user: ReviewUser, allAdmins: ReviewAdmin[]): ReviewAdmin[] {
  if (!user.first_reviewed_by) return [];
  return allAdmins.filter((admin) => admin.id !== user.first_reviewed_by);
}

/**
 * Check if level-2 review should be skipped (level-1 reviewer is super_admin).
 */
export function shouldSkipLevel2(user: ReviewUser, allAdmins: ReviewAdmin[]): boolean {
  if (!user.first_reviewed_by) return false;
  const level1Reviewer = allAdmins.find((a) => a.id === user.first_reviewed_by);
  return level1Reviewer?.role === "super_admin";
}
