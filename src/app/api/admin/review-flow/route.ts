import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { requirePermissionRequest, logAudit, type AdminPermission } from "@/lib/auth";
import {
  approveLevel1,
  approveLevel2,
  canApproveLevel1,
  canApproveLevel2,
  isGracePeriodExpired,
  getEligibleLevel2Reviewers,
  shouldSkipLevel2,
  type ReviewUser,
  type ReviewAdmin,
  GRACE_PERIOD_DAYS,
} from "@/lib/review-flow";

function jsonResponse(data: { success: boolean; data?: unknown; error?: string }, status = 200) {
  return NextResponse.json(data, { status });
}

function generateDeadline(days = 3): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await getSupabaseClient();
    const body = await request.clone().json();
    const { action } = body;

    const permissionAction: Record<string, AdminPermission> = {
      approve_level1: "user_review",
      approve_level2: "user_review",
      list_grace_period: "user_review",
      check_expired_grace_periods: "user_review",
      get_review_status: "user_review",
    };

    let adminUser;
    try {
      adminUser = await requirePermissionRequest(request, permissionAction[action as string] || "user_review");
    } catch (err) {
      const message = err instanceof Error ? err.message : "鉴权失败";
      return jsonResponse({ success: false, error: message }, 401);
    }

    // ===== 一级审核通过 =====
    if (action === "approve_level1") {
      const { user_id } = body;
      if (!user_id) return jsonResponse({ success: false, error: "缺少 user_id" }, 400);

      const { data: user, error: userErr } = await supabase
        .from("users")
        .select("id, verify_status, status, review_level, grace_period_end, first_reviewed_by, first_reviewed_at, second_reviewed_by, second_reviewed_at")
        .eq("id", user_id)
        .single();

      if (userErr || !user) return jsonResponse({ success: false, error: "用户不存在" }, 404);

      const reviewUser: ReviewUser = {
        id: user.id,
        verify_status: user.verify_status,
        status: user.status,
        review_level: user.review_level ?? 0,
        grace_period_end: user.grace_period_end,
        first_reviewed_by: user.first_reviewed_by,
        first_reviewed_at: user.first_reviewed_at,
        second_reviewed_by: user.second_reviewed_by,
        second_reviewed_at: user.second_reviewed_at,
      };

      const admin: ReviewAdmin = { id: adminUser.userId, username: adminUser.username, role: adminUser.role as "admin" | "super_admin" };

      if (!canApproveLevel1(admin, reviewUser)) {
        return jsonResponse({ success: false, error: "不满足一级审核条件" }, 400);
      }

      const result = approveLevel1(admin, reviewUser);
      if ("error" in result) {
        return jsonResponse({ success: false, error: result.error }, 400);
      }

      const { error: updateErr } = await supabase
        .from("users")
        .update(result)
        .eq("id", user_id);

      if (updateErr) return jsonResponse({ success: false, error: updateErr.message }, 500);

      // Update the corresponding review_assignment status
      await supabase
        .from("review_assignments")
        .update({
          status: "reviewed",
          reviewed_by: adminUser.userId,
          reviewed_at: new Date().toISOString(),
          review_result: "approved",
        })
        .eq("user_id", user_id)
        .eq("status", "pending");

      await logAudit(adminUser.id, adminUser.username, "approve_level1", "user", user_id, { review_level: 1, grace_period_end: result.grace_period_end });

      return jsonResponse({ success: true, data: result });
    }

    // ===== 二级审核通过 =====
    if (action === "approve_level2") {
      const { user_id } = body;
      if (!user_id) return jsonResponse({ success: false, error: "缺少 user_id" }, 400);

      const { data: user, error: userErr } = await supabase
        .from("users")
        .select("id, verify_status, status, review_level, grace_period_end, first_reviewed_by, first_reviewed_at, second_reviewed_by, second_reviewed_at")
        .eq("id", user_id)
        .single();

      if (userErr || !user) return jsonResponse({ success: false, error: "用户不存在" }, 404);

      const reviewUser: ReviewUser = {
        id: user.id,
        verify_status: user.verify_status,
        status: user.status,
        review_level: user.review_level ?? 0,
        grace_period_end: user.grace_period_end,
        first_reviewed_by: user.first_reviewed_by,
        first_reviewed_at: user.first_reviewed_at,
        second_reviewed_by: user.second_reviewed_by,
        second_reviewed_at: user.second_reviewed_at,
      };

      const admin: ReviewAdmin = { id: adminUser.userId, username: adminUser.username, role: adminUser.role as "admin" | "super_admin" };

      if (!canApproveLevel2(admin, reviewUser)) {
        return jsonResponse({ success: false, error: "不满足二级审核条件" }, 400);
      }

      const result = approveLevel2(admin, reviewUser);
      if ("error" in result) {
        return jsonResponse({ success: false, error: result.error }, 400);
      }

      const { error: updateErr } = await supabase
        .from("users")
        .update(result)
        .eq("id", user_id);

      if (updateErr) return jsonResponse({ success: false, error: updateErr.message }, 500);

      // Update review_assignment
      await supabase
        .from("review_assignments")
        .update({
          status: "reviewed",
          reviewed_by: adminUser.userId,
          reviewed_at: new Date().toISOString(),
          review_result: "approved",
        })
        .eq("user_id", user_id)
        .eq("status", "pending");

      await logAudit(adminUser.id, adminUser.username, "approve_level2", "user", user_id, { review_level: 2 });

      return jsonResponse({ success: true, data: result });
    }

    // ===== 列出当前观察期用户 =====
    if (action === "list_grace_period") {
      const { data: users, error } = await supabase
        .from("users")
        .select("id, username, nickname, verify_status, review_level, grace_period_end, first_reviewed_by, first_reviewed_at, second_reviewed_by, second_reviewed_at, created_at")
        .eq("review_level", 1)
        .not("grace_period_end", "is", null)
        .order("grace_period_end", { ascending: true });

      if (error) return jsonResponse({ success: false, error: error.message }, 500);

      // Enrich with first_reviewer name
      const reviewerIds = (users || []).map((u) => u.first_reviewed_by as string).filter(Boolean);
      const { data: reviewers } = reviewerIds.length
        ? await supabase.from("users").select("id, username, nickname").in("id", reviewerIds)
        : { data: [] };

      const reviewerMap = new Map((reviewers || []).map((r) => [r.id as string, r]));
      const now = new Date();

      const list = (users || []).map((u) => {
        const reviewer = u.first_reviewed_by ? reviewerMap.get(u.first_reviewed_by as string) : null;
        const graceEnd = u.grace_period_end ? new Date(u.grace_period_end) : null;
        const expired = graceEnd ? graceEnd.getTime() <= now.getTime() : false;
        const daysLeft = graceEnd ? Math.ceil((graceEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : 0;

        return {
          ...u,
          first_reviewer_name: reviewer?.username || null,
          grace_expired: expired,
          grace_days_left: daysLeft,
        };
      });

      return jsonResponse({
        success: true,
        data: {
          list,
          stats: {
            total_in_grace_period: list.length,
            expired_count: list.filter((u) => u.grace_expired).length,
            active_count: list.filter((u) => !u.grace_expired).length,
          },
        },
      });
    }

    // ===== 检查到期观察期用户，自动创建二级审核分配 =====
    if (action === "check_expired_grace_periods") {
      const now = new Date().toISOString();

      // Find users in grace period that have expired
      const { data: expiredUsers, error } = await supabase
        .from("users")
        .select("id, verify_status, status, review_level, grace_period_end, first_reviewed_by, first_reviewed_at, second_reviewed_by, second_reviewed_at")
        .eq("review_level", 1)
        .lte("grace_period_end", now)
        .is("second_reviewed_by", null);

      if (error) return jsonResponse({ success: false, error: error.message }, 500);

      if (!expiredUsers || expiredUsers.length === 0) {
        return jsonResponse({ success: true, data: { created_count: 0 } });
      }

      // Get all admins for eligibility check
      const { data: allAdmins } = await supabase
        .from("users")
        .select("id, username, role")
        .in("role", ["admin", "super_admin"]);

      let createdCount = 0;
      const nowISO = new Date().toISOString();

      for (const user of expiredUsers || []) {
        const reviewUser: ReviewUser = {
          id: user.id,
          verify_status: user.verify_status,
          status: user.status,
          review_level: user.review_level ?? 1,
          grace_period_end: user.grace_period_end,
          first_reviewed_by: user.first_reviewed_by,
          first_reviewed_at: user.first_reviewed_at,
          second_reviewed_by: user.second_reviewed_by,
          second_reviewed_at: user.second_reviewed_at,
        };

        const admins: ReviewAdmin[] = (allAdmins || []).map((a) => ({
          id: a.id as string,
          username: a.username as string,
          role: a.role as "admin" | "super_admin",
        }));

        // If super_admin did level-1, skip level-2
        if (shouldSkipLevel2(reviewUser, admins)) continue;

        const eligible = getEligibleLevel2Reviewers(reviewUser, admins);
        if (eligible.length === 0) continue;

        // Check if already assigned
        const { data: existing } = await supabase
          .from("review_assignments")
          .select("id")
          .eq("user_id", user.id)
          .eq("status", "pending")
          .single();

        if (existing) continue;

        // Assign to the first eligible reviewer (round-robin would be better, but keep simple)
        const targetAdmin = eligible[0];
        const { error: insertErr } = await supabase
          .from("review_assignments")
          .insert({
            user_id: user.id,
            assigned_to: targetAdmin.id,
            assigned_at: nowISO,
            deadline: generateDeadline(),
            status: "pending",
            notes: "二级复查 - 观察期到期自动分配",
          });

        if (!insertErr) createdCount++;
      }

      await logAudit(adminUser.id, adminUser.username, "check_expired_grace_periods", "system", "all", { created_count: createdCount });

      return jsonResponse({ success: true, data: { created_count: createdCount } });
    }

    // ===== 获取用户审核状态 =====
    if (action === "get_review_status") {
      const { user_id } = body;
      if (!user_id) return jsonResponse({ success: false, error: "缺少 user_id" }, 400);

      const { data: user, error: userErr } = await supabase
        .from("users")
        .select("id, username, nickname, verify_status, status, review_level, grace_period_end, first_reviewed_by, first_reviewed_at, second_reviewed_by, second_reviewed_at, created_at")
        .eq("id", user_id)
        .single();

      if (userErr || !user) return jsonResponse({ success: false, error: "用户不存在" }, 404);

      const reviewerIds = [user.first_reviewed_by, user.second_reviewed_by].filter(Boolean) as string[];
      const { data: reviewers } = reviewerIds.length
        ? await supabase.from("users").select("id, username, nickname").in("id", reviewerIds)
        : { data: [] };

      const reviewerMap = new Map((reviewers || []).map((r) => [r.id as string, r]));
      const now = new Date();

      const graceEnd = user.grace_period_end ? new Date(user.grace_period_end) : null;
      const graceExpired = graceEnd ? graceEnd.getTime() <= now.getTime() : false;
      const graceDaysLeft = graceEnd ? Math.ceil((graceEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : 0;

      return jsonResponse({
        success: true,
        data: {
          user_id: user.id,
          username: user.username,
          nickname: user.nickname,
          verify_status: user.verify_status,
          review_level: user.review_level ?? 0,
          grace_period: {
            end: user.grace_period_end,
            expired: graceExpired,
            days_left: graceDaysLeft,
          },
          first_review: {
            reviewer_id: user.first_reviewed_by,
            reviewer_name: user.first_reviewed_by ? reviewerMap.get(user.first_reviewed_by)?.username ?? null : null,
            at: user.first_reviewed_at,
          },
          second_review: {
            reviewer_id: user.second_reviewed_by,
            reviewer_name: user.second_reviewed_by ? reviewerMap.get(user.second_reviewed_by)?.username ?? null : null,
            at: user.second_reviewed_at,
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
