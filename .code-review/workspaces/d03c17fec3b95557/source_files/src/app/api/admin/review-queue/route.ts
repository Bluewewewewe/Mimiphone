import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { requirePermissionRequest, logAudit, type AdminPermission } from "@/lib/auth";

function jsonResponse(data: { success: boolean; data?: unknown; error?: string }, status = 200) {
  return NextResponse.json(data, { status });
}

function generateDeadline(days = 3): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function formatCountdown(deadline: string): { text: string; overdue: boolean; daysLeft: number } {
  const now = new Date().getTime();
  const end = new Date(deadline).getTime();
  const diff = end - now;
  const overdue = diff < 0;
  const absMs = Math.abs(diff);
  const days = Math.floor(absMs / (1000 * 60 * 60 * 24));
  const hours = Math.floor((absMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  if (overdue) {
    return { text: `已超时${days}天${hours}小时`, overdue: true, daysLeft: -days };
  }
  return { text: `剩余${days}天${hours}小时`, overdue: false, daysLeft: days };
}

function computePriority(assignment: Record<string, unknown> | null, createdAt: string): { priority: number; color: string; label: string } {
  if (assignment && assignment.deadline && assignment.status === "pending") {
    const { overdue, daysLeft, text } = formatCountdown(assignment.deadline as string);
    if (overdue) return { priority: 1, color: "red", label: text };
    if (daysLeft < 1) return { priority: 2, color: "orange", label: text };
    if (daysLeft <= 3) return { priority: 3, color: "yellow", label: text };
    return { priority: 3, color: "blue", label: text };
  }
  const ageDays = (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24);
  if (!assignment) {
    return ageDays > 1 ? { priority: 4, color: "gray", label: "未分配" } : { priority: 5, color: "gray", label: "未分配" };
  }
  return { priority: 5, color: "gray", label: "未分配" };
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await getSupabaseClient();
    const body = await request.clone().json();
    const { action } = body;
    const permissionAction: Record<string, AdminPermission> = {
      list_pending: "user_review",
      assign: "user_review",
      claim: "user_review",
      auto_assign: "user_review",
      review_history: "user_review",
    };
    let adminUser;
    try {
      adminUser = await requirePermissionRequest(request, permissionAction[action as string] || "user_review");
    } catch (err) {
      const message = err instanceof Error ? err.message : "鉴权失败";
      return jsonResponse({ success: false, error: message }, 401);
    }

    if (action === "list_pending") {
      const { data: users, error: usersError } = await supabase
        .from("users")
        .select(
          "id, username, nickname, weibo_nickname, weibo_level, weibo_screenshot_url, weibo_link, referrer_id, verify_status, created_at, reviewed_by, reviewed_at, review_result"
        )
        .eq("verify_status", "pending")
        .order("created_at", { ascending: true });

      if (usersError) {
        return jsonResponse({ success: false, error: usersError.message }, 500);
      }

      const userIds = (users || []).map((u) => u.id as string);
      const referrerIds = (users || []).map((u) => u.referrer_id as string | undefined).filter(Boolean) as string[];

      const [{ data: latestAssignments }, { data: referrers }, { data: todayReviewed }, { data: allReviewed }] = await Promise.all([
        supabase
          .from("review_assignments")
          .select("id, user_id, assigned_to, assigned_at, deadline, status, reviewed_by, reviewed_at, review_result, reassigned_from, notes")
          .in("user_id", userIds.length ? userIds : [""])
          .order("assigned_at", { ascending: false }),
        supabase
          .from("users")
          .select("id, username, nickname, verify_status, ban_status")
          .in("id", referrerIds.length ? referrerIds : [""]),
        supabase
          .from("review_assignments")
          .select("id", { count: "exact", head: true })
          .gte("reviewed_at", new Date(new Date().setHours(0, 0, 0, 0)).toISOString()),
        supabase
          .from("review_assignments")
          .select("review_result"),
      ]);

      const assignmentMap = new Map<string, Record<string, unknown>>();
      for (const row of latestAssignments || []) {
        if (!assignmentMap.has(row.user_id as string)) {
          assignmentMap.set(row.user_id as string, row as Record<string, unknown>);
        }
      }

      const referrerMap = new Map<string, Record<string, unknown>>();
      for (const r of referrers || []) {
        referrerMap.set(r.id as string, r as Record<string, unknown>);
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const overdueCount = (latestAssignments || []).filter(
        (a) => a.status === "pending" && a.deadline && new Date(a.deadline).getTime() < today.getTime()
      ).length;

      const approvedCount = (allReviewed || []).filter((r) => r.review_result === "approved").length;
      const totalReviewed = (allReviewed || []).length;
      const approvalRate = totalReviewed ? Math.round((approvedCount / totalReviewed) * 100) : 0;

      const pendingItems = (users || []).map((u) => {
        const assignment = assignmentMap.get(u.id as string) || null;
        const referrer = u.referrer_id ? referrerMap.get(u.referrer_id as string) : null;
        const priorityInfo = computePriority(assignment, u.created_at as string);
        return {
          ...u,
          referrer_name: referrer ? (referrer.username as string) : null,
          referrer_nickname: referrer ? (referrer.nickname as string || referrer.weibo_nickname as string) : null,
          referrer_verify_status: referrer ? (referrer.verify_status as string) : null,
          referrer_ban_status: referrer ? (referrer.ban_status as string) : null,
          assignment: assignment
            ? {
                id: assignment.id,
                assigned_to: assignment.assigned_to,
                assigned_at: assignment.assigned_at,
                deadline: assignment.deadline,
                status: assignment.status,
                countdown: formatCountdown(assignment.deadline as string),
              }
            : null,
          priority: priorityInfo.priority,
          priority_color: priorityInfo.color,
          priority_label: priorityInfo.label,
        };
      });

      pendingItems.sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      });

      return jsonResponse({
        success: true,
        data: {
          list: pendingItems,
          stats: {
            total_pending: (users || []).length,
            unassigned: pendingItems.filter((i) => !i.assignment).length,
            reviewed_today: todayReviewed?.length || 0,
            approval_rate: approvalRate,
            overdue_count: overdueCount,
          },
        },
      });
    }

    if (action === "assign") {
      const { user_id, assigned_to } = body;
      if (!user_id || !assigned_to) {
        return jsonResponse({ success: false, error: "缺少 user_id 或 assigned_to" }, 400);
      }

      const { data: existing } = await supabase
        .from("review_assignments")
        .select("id, assigned_to")
        .eq("user_id", user_id)
        .eq("status", "pending")
        .single();

      if (existing) {
        await supabase
          .from("review_assignments")
          .update({
            status: "reassigned",
            reassigned_from: existing.assigned_to,
            reassigned_at: new Date().toISOString(),
          })
          .eq("id", existing.id);
      }

      const { data, error } = await supabase
        .from("review_assignments")
        .insert({
          user_id,
          assigned_to,
          assigned_at: new Date().toISOString(),
          deadline: generateDeadline(),
          status: "pending",
        })
        .select()
        .single();

      if (error) return jsonResponse({ success: false, error: error.message }, 500);
      await logAudit(adminUser.id, adminUser.username, "review_assign", "user", user_id as string, { assigned_to });
      return jsonResponse({ success: true, data });
    }

    if (action === "claim") {
      const { user_id } = body;
      if (!user_id) return jsonResponse({ success: false, error: "缺少 user_id" }, 400);

      const { data: existing } = await supabase
        .from("review_assignments")
        .select("id, assigned_to")
        .eq("user_id", user_id)
        .eq("status", "pending")
        .single();

      if (existing) {
        await supabase
          .from("review_assignments")
          .update({
            status: "reassigned",
            reassigned_from: existing.assigned_to,
            reassigned_at: new Date().toISOString(),
          })
          .eq("id", existing.id);
      }

      const { data, error } = await supabase
        .from("review_assignments")
        .insert({
          user_id,
          assigned_to: adminUser.userId,
          assigned_at: new Date().toISOString(),
          deadline: generateDeadline(),
          status: "pending",
        })
        .select()
        .single();

      if (error) return jsonResponse({ success: false, error: error.message }, 500);
      await logAudit(adminUser.id, adminUser.username, "review_claim", "user", user_id as string, {});
      return jsonResponse({ success: true, data });
    }

    if (action === "auto_assign") {
      const { data: admins } = await supabase
        .from("users")
        .select("id, username")
        .in("role", ["admin", "super_admin"]);

      if (!admins || admins.length === 0) {
        return jsonResponse({ success: true, data: { assigned_count: 0 } });
      }

      const now = new Date().toISOString();

      // 回收超时分配
      const { data: overdueAssignments } = await supabase
        .from("review_assignments")
        .select("id, assigned_to")
        .eq("status", "pending")
        .lt("deadline", now);

      for (const row of overdueAssignments || []) {
        await supabase
          .from("review_assignments")
          .update({
            status: "reassigned",
            reassigned_from: row.assigned_to,
            reassigned_at: now,
          })
          .eq("id", row.id);
      }

      // 找出未分配的待审用户
      const { data: pendingUsers } = await supabase
        .from("users")
        .select("id")
        .eq("verify_status", "pending")
        .order("created_at", { ascending: true });

      const { data: activeAssignments } = await supabase
        .from("review_assignments")
        .select("user_id, assigned_to")
        .eq("status", "pending");

      const assignedUserIds = new Set((activeAssignments || []).map((a) => a.user_id as string));
      const unassignedUsers = (pendingUsers || []).filter((u) => !assignedUserIds.has(u.id as string));

      // 统计每个管理员当前 pending 数
      const adminPendingCounts = new Map<string, number>();
      for (const a of activeAssignments || []) {
        const aid = a.assigned_to as string;
        adminPendingCounts.set(aid, (adminPendingCounts.get(aid) || 0) + 1);
      }
      for (const admin of admins) {
        if (!adminPendingCounts.has(admin.id as string)) {
          adminPendingCounts.set(admin.id as string, 0);
        }
      }

      const sortedAdmins = [...admins].sort((a, b) => {
        const diff = (adminPendingCounts.get(a.id as string) || 0) - (adminPendingCounts.get(b.id as string) || 0);
        if (diff !== 0) return diff;
        return (a.username as string).localeCompare(b.username as string);
      });

      let assignedCount = 0;
      for (const user of unassignedUsers) {
        const targetAdmin = sortedAdmins[0];
        if (!targetAdmin) continue;
        const { error } = await supabase.from("review_assignments").insert({
          user_id: user.id,
          assigned_to: targetAdmin.id,
          assigned_at: now,
          deadline: generateDeadline(),
          status: "pending",
        });
        if (!error) {
          adminPendingCounts.set(targetAdmin.id as string, (adminPendingCounts.get(targetAdmin.id as string) || 0) + 1);
          sortedAdmins.sort((a, b) => {
            const diff = (adminPendingCounts.get(a.id as string) || 0) - (adminPendingCounts.get(b.id as string) || 0);
            if (diff !== 0) return diff;
            return (a.username as string).localeCompare(b.username as string);
          });
          assignedCount++;
        }
      }

      await logAudit(adminUser.id, adminUser.username, "review_auto_assign", "system", "all", { assigned_count: assignedCount });
      return jsonResponse({ success: true, data: { assigned_count: assignedCount } });
    }

    if (action === "review_history") {
      const { reviewed_by, review_result, keyword, page = 1, page_size = 20 } = body;
      const from = (page - 1) * page_size;
      const to = from + page_size - 1;

      let query = supabase
        .from("review_assignments")
        .select(
          "id, user_id, reviewed_by, reviewed_at, review_result, notes",
          { count: "exact" }
        )
        .eq("status", "reviewed")
        .order("reviewed_at", { ascending: false })
        .range(from, to);

      if (reviewed_by) query = query.eq("reviewed_by", reviewed_by);
      if (review_result) query = query.eq("review_result", review_result);

      const { data: rows, error, count } = await query;
      if (error) return jsonResponse({ success: false, error: error.message }, 500);

      const userIds = (rows || []).map((r) => r.user_id as string).filter(Boolean);
      const reviewerIds = (rows || []).map((r) => r.reviewed_by as string).filter(Boolean);

      const [{ data: users }, { data: reviewers }] = await Promise.all([
        supabase.from("users").select("id, username, nickname, weibo_nickname, weibo_link").in("id", userIds.length ? userIds : [""]),
        supabase.from("users").select("id, username, nickname").in("id", reviewerIds.length ? reviewerIds : [""]),
      ]);

      const userMap = new Map((users || []).map((u) => [u.id as string, u]));
      const reviewerMap = new Map((reviewers || []).map((u) => [u.id as string, u]));

      let list = (rows || []).map((r) => {
        const u = userMap.get(r.user_id as string);
        const rv = reviewerMap.get(r.reviewed_by as string);
        return {
          id: r.id,
          user_id: r.user_id,
          username: u?.username || r.user_id,
          weibo_nickname: u?.weibo_nickname || u?.nickname || null,
          weibo_link: u?.weibo_link || null,
          review_result: r.review_result,
          reviewed_by: r.reviewed_by,
          reviewed_by_name: rv?.username || r.reviewed_by,
          reviewed_at: r.reviewed_at,
          notes: r.notes,
        };
      });

      if (keyword) {
        const k = keyword.toLowerCase();
        list = list.filter(
          (item) =>
            (item.username as string).toLowerCase().includes(k) ||
            (item.weibo_nickname as string | null)?.toLowerCase().includes(k) ||
            (item.reviewed_by_name as string).toLowerCase().includes(k)
        );
      }

      return jsonResponse({
        success: true,
        data: {
          list,
          total: count || list.length,
          page,
          page_size,
        },
      });
    }

    return jsonResponse({ success: false, error: "未知 action" }, 400);
  } catch (err) {
    const message = err instanceof Error ? err.message : "服务器错误";
    return jsonResponse({ success: false, error: message }, 500);
  }
}
