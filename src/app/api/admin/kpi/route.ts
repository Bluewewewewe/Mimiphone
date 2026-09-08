import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { requirePermissionRequest, type AdminPermission } from "@/lib/auth";
import { calculateAdminKPI, calculateTeamKPI, rankAdmins, type ReviewAssignment, type AdminInfo } from "@/lib/kpi";

function jsonResponse(data: { success: boolean; data?: unknown; error?: string }, status = 200) {
  return NextResponse.json(data, { status });
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await getSupabaseClient();
    const body = await request.clone().json();
    const { action } = body;

    const permissionAction: Record<string, AdminPermission> = {
      get_my_kpi: "stats_view",
      get_team_kpi: "stats_view",
      get_team_detail: "stats_view",
    };

    let adminUser;
    try {
      adminUser = await requirePermissionRequest(request, permissionAction[action as string] || "stats_view");
    } catch (err) {
      const message = err instanceof Error ? err.message : "鉴权失败";
      return jsonResponse({ success: false, error: message }, 401);
    }

    // ===== 获取当前管理员自己的 KPI =====
    if (action === "get_my_kpi") {
      const { data: assignments } = await supabase
        .from("review_assignments")
        .select("id, user_id, assigned_to, assigned_at, deadline, status, reviewed_by, reviewed_at, review_result");

      const { data: admins } = await supabase
        .from("users")
        .select("id, username, role")
        .in("role", ["admin", "super_admin"]);

      const allAssignments: ReviewAssignment[] = (assignments || []).map((a) => ({
        ...a,
        review_level: null,
      })) as ReviewAssignment[];

      const allAdmins: AdminInfo[] = (admins || []).map((a) => ({
        id: a.id as string,
        username: a.username as string,
        role: a.role as string,
      }));

      const myKPI = calculateAdminKPI(adminUser.userId, allAssignments, allAdmins);

      return jsonResponse({ success: true, data: myKPI });
    }

    // ===== 全团队 KPI（所有管理员可见） =====
    if (action === "get_team_kpi") {
      const { data: assignments } = await supabase
        .from("review_assignments")
        .select("id, user_id, assigned_to, assigned_at, deadline, status, reviewed_by, reviewed_at, review_result");

      const { data: admins } = await supabase
        .from("users")
        .select("id, username, role")
        .in("role", ["admin", "super_admin"]);

      const allAssignments: ReviewAssignment[] = (assignments || []).map((a) => ({
        ...a,
        review_level: null,
      })) as ReviewAssignment[];

      const allAdmins: AdminInfo[] = (admins || []).map((a) => ({
        id: a.id as string,
        username: a.username as string,
        role: a.role as string,
      }));

      const teamKPI = calculateTeamKPI(allAdmins, allAssignments);

      // Also return individual KPI for each admin
      const individualKPIs = allAdmins.map((admin) =>
        calculateAdminKPI(admin.id, allAssignments, allAdmins)
      );

      return jsonResponse({
        success: true,
        data: {
          team: teamKPI,
          members: rankAdmins(individualKPIs, "total_reviewed"),
        },
      });
    }

    // ===== 详细 KPI（含二级复查通过率，仅超管可见） =====
    if (action === "get_team_detail") {
      if (adminUser.role !== "super_admin") {
        return jsonResponse({ success: false, error: "仅超级管理员可查看详细信息" }, 403);
      }

      const { data: assignments } = await supabase
        .from("review_assignments")
        .select("id, user_id, assigned_to, assigned_at, deadline, status, reviewed_by, reviewed_at, review_result");

      const { data: admins } = await supabase
        .from("users")
        .select("id, username, role")
        .in("role", ["admin", "super_admin"]);

      // For level-2 pass rate, we need to check review_level from users table
      const { data: users } = await supabase
        .from("users")
        .select("id, review_level, second_reviewed_by");

      // Build a map of user_id -> review_level for enriching assignments
      const userReviewLevelMap = new Map<string, number>();
      for (const u of users || []) {
        userReviewLevelMap.set(u.id as string, u.review_level ?? 0);
      }

      const allAssignments: ReviewAssignment[] = (assignments || []).map((a) => ({
        ...a,
        review_level: userReviewLevelMap.get(a.user_id as string) ?? null,
      })) as ReviewAssignment[];

      const allAdmins: AdminInfo[] = (admins || []).map((a) => ({
        id: a.id as string,
        username: a.username as string,
        role: a.role as string,
      }));

      const teamKPI = calculateTeamKPI(allAdmins, allAssignments);
      const individualKPIs = allAdmins.map((admin) =>
        calculateAdminKPI(admin.id, allAssignments, allAdmins)
      );

      // Count level-2 pass rates across all admins
      const level2Assignments = allAssignments.filter(
        (a) => a.status === "reviewed" && a.review_level === 2
      );
      const level2Total = level2Assignments.length;
      const level2Approved = level2Assignments.filter((a) => a.review_result === "approved").length;

      return jsonResponse({
        success: true,
        data: {
          team: teamKPI,
          members: rankAdmins(individualKPIs, "total_reviewed"),
          level2_stats: {
            total: level2Total,
            approved: level2Approved,
            pass_rate: level2Total > 0 ? Math.round((level2Approved / level2Total) * 100) : null,
          },
        },
      });
    }

    return jsonResponse({ success: false, error: "未知 action" }, 400);
  } catch (err) {
    const message = err instanceof Error ? err.message : "服务器错误";
    return jsonResponse({ success: false, error: message }, 500);
  }
}
