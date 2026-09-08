// ========== KPI 看板 — 纯业务逻辑 ==========

export interface ReviewAssignment {
  id: string;
  user_id: string;
  assigned_to: string | null;
  assigned_at: string;
  deadline: string | null;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_result: string | null;
  review_level?: number | null;
}

export interface AdminInfo {
  id: string;
  username: string;
  role: string;
}

export interface AdminKPI {
  admin_id: string;
  admin_username: string;
  total_reviewed: number;
  approved_count: number;
  rejected_count: number;
  average_review_time_hours: number;
  overdue_count: number;
  level2_pass_rate: number | null;
}

export interface TeamKPI {
  total_admins: number;
  total_reviewed: number;
  total_approved: number;
  total_rejected: number;
  overall_approval_rate: number;
  average_review_time_hours: number;
  total_overdue: number;
}

/**
 * Calculate KPI for a single admin based on their review assignments.
 */
export function calculateAdminKPI(
  adminId: string,
  allAssignments: ReviewAssignment[],
  allReviewers: AdminInfo[]
): AdminKPI {
  const admin = allReviewers.find((r) => r.id === adminId);
  const adminAssignments = allAssignments.filter(
    (a) => a.status === "reviewed" && a.reviewed_by === adminId
  );

  const totalReviewed = adminAssignments.length;
  const approvedCount = adminAssignments.filter((a) => a.review_result === "approved").length;
  const rejectedCount = adminAssignments.filter((a) => a.review_result === "rejected").length;

  // Calculate average review time (hours from assigned_at to reviewed_at)
  let totalHours = 0;
  let countWithTime = 0;
  let overdueCount = 0;

  for (const a of adminAssignments) {
    if (a.assigned_at && a.reviewed_at) {
      const assignedTime = new Date(a.assigned_at).getTime();
      const reviewedTime = new Date(a.reviewed_at).getTime();
      const hours = (reviewedTime - assignedTime) / (1000 * 60 * 60);
      if (hours >= 0) {
        totalHours += hours;
        countWithTime++;
      }
    }
    if (a.deadline && a.reviewed_at) {
      const deadlineTime = new Date(a.deadline).getTime();
      const reviewedTime = new Date(a.reviewed_at).getTime();
      if (reviewedTime > deadlineTime) {
        overdueCount++;
      }
    }
  }

  const avgReviewTimeHours = countWithTime > 0 ? Math.round((totalHours / countWithTime) * 10) / 10 : 0;

  // Level-2 pass rate: of the assignments this admin reviewed at level 2,
  // what percentage passed. Only relevant for super_admin view.
  const level2Assignments = adminAssignments.filter(
    (a) => a.review_level === 2
  );
  let level2PassRate: number | null = null;
  if (level2Assignments.length > 0) {
    const level2Approved = level2Assignments.filter((a) => a.review_result === "approved").length;
    level2PassRate = Math.round((level2Approved / level2Assignments.length) * 100);
  }

  return {
    admin_id: adminId,
    admin_username: admin?.username ?? adminId,
    total_reviewed: totalReviewed,
    approved_count: approvedCount,
    rejected_count: rejectedCount,
    average_review_time_hours: avgReviewTimeHours,
    overdue_count: overdueCount,
    level2_pass_rate: level2PassRate,
  };
}

/**
 * Calculate team-level KPI summary across all admins.
 */
export function calculateTeamKPI(
  allAdmins: AdminInfo[],
  allAssignments: ReviewAssignment[]
): TeamKPI {
  const reviewedAssignments = allAssignments.filter((a) => a.status === "reviewed");
  const totalReviewed = reviewedAssignments.length;
  const totalApproved = reviewedAssignments.filter((a) => a.review_result === "approved").length;
  const totalRejected = reviewedAssignments.filter((a) => a.review_result === "rejected").length;
  const overallApprovalRate = totalReviewed > 0 ? Math.round((totalApproved / totalReviewed) * 100) : 0;

  // Average review time across all assignments
  let totalHours = 0;
  let countWithTime = 0;
  let totalOverdue = 0;

  for (const a of reviewedAssignments) {
    if (a.assigned_at && a.reviewed_at) {
      const assignedTime = new Date(a.assigned_at).getTime();
      const reviewedTime = new Date(a.reviewed_at).getTime();
      const hours = (reviewedTime - assignedTime) / (1000 * 60 * 60);
      if (hours >= 0) {
        totalHours += hours;
        countWithTime++;
      }
    }
    if (a.deadline && a.reviewed_at) {
      const deadlineTime = new Date(a.deadline).getTime();
      const reviewedTime = new Date(a.reviewed_at).getTime();
      if (reviewedTime > deadlineTime) {
        totalOverdue++;
      }
    }
  }

  const avgReviewTimeHours = countWithTime > 0 ? Math.round((totalHours / countWithTime) * 10) / 10 : 0;

  return {
    total_admins: allAdmins.length,
    total_reviewed: totalReviewed,
    total_approved: totalApproved,
    total_rejected: totalRejected,
    overall_approval_rate: overallApprovalRate,
    average_review_time_hours: avgReviewTimeHours,
    total_overdue: totalOverdue,
  };
}

/**
 * Rank admins by a specific metric. Returns sorted list of AdminKPI.
 */
export function rankAdmins(
  kpiList: AdminKPI[],
  sortBy: keyof AdminKPI
): AdminKPI[] {
  const sorted = [...kpiList];
  sorted.sort((a, b) => {
    const aVal = a[sortBy];
    const bVal = b[sortBy];
    if (aVal === null && bVal === null) return 0;
    if (aVal === null) return 1;
    if (bVal === null) return -1;
    if (typeof aVal === "number" && typeof bVal === "number") {
      return bVal - aVal; // descending
    }
    return String(aVal).localeCompare(String(bVal));
  });
  return sorted;
}
