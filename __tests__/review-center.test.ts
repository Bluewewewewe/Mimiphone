/**
 * 审核中心纯函数测试
 *
 * 覆盖:
 *   1. src/lib/review-flow.ts — 两级审核逻辑
 *   2. src/lib/kpi.ts — KPI 计算
 *   3. src/lib/admin-management.ts — 管理员管理
 *   4. src/lib/schedule.ts — 课程表
 *
 * 运行：npx vitest run __tests__/review-center.test.ts
 */

import { describe, it, expect } from "vitest";
import {
  canApproveLevel1,
  approveLevel1,
  canApproveLevel2,
  approveLevel2,
  isGracePeriodExpired,
  getEligibleLevel2Reviewers,
  shouldSkipLevel2,
  GRACE_PERIOD_DAYS,
  type ReviewUser,
  type ReviewAdmin,
} from "../src/lib/review-flow";
import {
  calculateAdminKPI,
  calculateTeamKPI,
  rankAdmins,
  type ReviewAssignment,
  type AdminInfo,
} from "../src/lib/kpi";
import {
  getAdminStats,
  canManageAdmin,
  getAdminModules,
  type AdminUser,
} from "../src/lib/admin-management";
import {
  validateSchedule,
  generateReminders,
  type ScheduleItem,
} from "../src/lib/schedule";

// ========== 辅助工厂 ==========
function makeUser(overrides: Partial<ReviewUser> = {}): ReviewUser {
  return {
    id: "user_001",
    verify_status: "pending",
    status: "pending",
    review_level: 0,
    grace_period_end: null,
    first_reviewed_by: null,
    first_reviewed_at: null,
    second_reviewed_by: null,
    second_reviewed_at: null,
    ...overrides,
  };
}

function makeAdmin(overrides: Partial<ReviewAdmin> = {}): ReviewAdmin {
  return {
    id: "admin_001",
    username: "test_admin",
    role: "admin",
    ...overrides,
  };
}

function makeAssignment(overrides: Partial<ReviewAssignment> = {}): ReviewAssignment {
  return {
    id: "assign_001",
    user_id: "user_001",
    assigned_to: "admin_001",
    assigned_at: "2026-08-01T10:00:00.000Z",
    deadline: "2026-08-04T10:00:00.000Z",
    status: "reviewed",
    reviewed_by: "admin_001",
    reviewed_at: "2026-08-02T10:00:00.000Z",
    review_result: "approved",
    review_level: null,
    ...overrides,
  };
}

// ========== 1. 两级审核流程 ==========
describe("review-flow: canApproveLevel1", () => {
  it("允许 admin 对 pending 用户进行一级审核", () => {
    const admin = makeAdmin();
    const user = makeUser();
    expect(canApproveLevel1(admin, user)).toBe(true);
  });

  it("允许 super_admin 对 pending 用户进行一级审核", () => {
    const admin = makeAdmin({ role: "super_admin" });
    const user = makeUser();
    expect(canApproveLevel1(admin, user)).toBe(true);
  });

  it("拒绝非管理员进行一级审核", () => {
    const admin = makeAdmin({ role: "admin", id: "not_admin" });
    const user = makeUser();
    // 模拟非管理员 — 需要 role 不是 admin 也不是 super_admin
    const fakeAdmin = { id: "user_999", username: "fake", role: "user" as unknown as "admin" };
    expect(canApproveLevel1(fakeAdmin as ReviewAdmin, user)).toBe(false);
  });

  it("拒绝已审核用户（verify_status 非 pending）", () => {
    const admin = makeAdmin();
    const user = makeUser({ verify_status: "approved" });
    expect(canApproveLevel1(admin, user)).toBe(false);
  });

  it("拒绝 review_level 不为 0 的用户", () => {
    const admin = makeAdmin();
    const user = makeUser({ review_level: 1 });
    expect(canApproveLevel1(admin, user)).toBe(false);
  });
});

describe("review-flow: approveLevel1", () => {
  it("返回正确的更新字段", () => {
    const admin = makeAdmin();
    const user = makeUser();
    const result = approveLevel1(admin, user);

    expect("error" in result).toBe(false);
    if ("error" in result) return;

    expect(result.review_level).toBe(1);
    expect(result.verify_status).toBe("approved");
    expect(result.status).toBe("approved");
    expect(result.first_reviewed_by).toBe("admin_001");
    expect(result.second_reviewed_by).toBeNull();
    expect(result.grace_period_end).toBeTruthy();

    // Grace period should be ~30 days from now
    const graceEnd = new Date(result.grace_period_end!);
    const now = new Date();
    const diffDays = Math.round((graceEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    expect(diffDays).toBe(GRACE_PERIOD_DAYS);
  });

  it("条件不满足时返回 error", () => {
    const admin = makeAdmin();
    const user = makeUser({ verify_status: "approved" });
    const result = approveLevel1(admin, user);
    expect("error" in result).toBe(true);
  });
});

describe("review-flow: canApproveLevel2", () => {
  it("允许非一级审核员进行二级审核", () => {
    const admin = makeAdmin({ id: "admin_002" });
    const user = makeUser({
      review_level: 1,
      first_reviewed_by: "admin_001",
      verify_status: "approved",
    });
    expect(canApproveLevel2(admin, user)).toBe(true);
  });

  it("拒绝一级审核员本人进行二级审核", () => {
    const admin = makeAdmin({ id: "admin_001" });
    const user = makeUser({
      review_level: 1,
      first_reviewed_by: "admin_001",
    });
    expect(canApproveLevel2(admin, user)).toBe(false);
  });

  it("拒绝 review_level 不为 1 的用户", () => {
    const admin = makeAdmin({ id: "admin_002" });
    const user = makeUser({ review_level: 0, first_reviewed_by: "admin_001" });
    expect(canApproveLevel2(admin, user)).toBe(false);
  });

  it("拒绝 review_level 为 2 的用户", () => {
    const admin = makeAdmin({ id: "admin_002" });
    const user = makeUser({ review_level: 2, first_reviewed_by: "admin_001" });
    expect(canApproveLevel2(admin, user)).toBe(false);
  });
});

describe("review-flow: approveLevel2", () => {
  it("返回正确的更新字段", () => {
    const admin = makeAdmin({ id: "admin_002" });
    const user = makeUser({
      review_level: 1,
      first_reviewed_by: "admin_001",
      first_reviewed_at: "2026-08-01T10:00:00.000Z",
      verify_status: "approved",
      grace_period_end: "2026-08-31T10:00:00.000Z",
    });
    const result = approveLevel2(admin, user);

    expect("error" in result).toBe(false);
    if ("error" in result) return;

    expect(result.review_level).toBe(2);
    expect(result.second_reviewed_by).toBe("admin_002");
    expect(result.first_reviewed_by).toBe("admin_001");
  });

  it("条件不满足时返回 error", () => {
    const admin = makeAdmin({ id: "admin_001" });
    const user = makeUser({ review_level: 1, first_reviewed_by: "admin_001" });
    const result = approveLevel2(admin, user);
    expect("error" in result).toBe(true);
  });
});

describe("review-flow: isGracePeriodExpired", () => {
  it("已过期返回 true", () => {
    const user = makeUser({ grace_period_end: "2020-01-01T00:00:00.000Z" });
    expect(isGracePeriodExpired(user)).toBe(true);
  });

  it("未过期返回 false", () => {
    const user = makeUser({ grace_period_end: "2099-01-01T00:00:00.000Z" });
    expect(isGracePeriodExpired(user)).toBe(false);
  });

  it("无 grace_period_end 返回 false", () => {
    const user = makeUser({ grace_period_end: null });
    expect(isGracePeriodExpired(user)).toBe(false);
  });

  it("支持传入自定义 now 参数", () => {
    const user = makeUser({ grace_period_end: "2026-06-15T00:00:00.000Z" });
    const before = new Date("2026-06-01T00:00:00.000Z");
    const after = new Date("2026-07-01T00:00:00.000Z");
    expect(isGracePeriodExpired(user, before)).toBe(false);
    expect(isGracePeriodExpired(user, after)).toBe(true);
  });
});

describe("review-flow: getEligibleLevel2Reviewers", () => {
  it("排除一级审核员", () => {
    const user = makeUser({ first_reviewed_by: "admin_001" });
    const admins: ReviewAdmin[] = [
      makeAdmin({ id: "admin_001" }),
      makeAdmin({ id: "admin_002", username: "admin2" }),
      makeAdmin({ id: "admin_003", username: "admin3" }),
    ];
    const eligible = getEligibleLevel2Reviewers(user, admins);
    expect(eligible).toHaveLength(2);
    expect(eligible.map((a) => a.id)).not.toContain("admin_001");
  });

  it("无 first_reviewed_by 返回空", () => {
    const user = makeUser({ first_reviewed_by: null });
    const admins: ReviewAdmin[] = [makeAdmin()];
    expect(getEligibleLevel2Reviewers(user, admins)).toHaveLength(0);
  });
});

describe("review-flow: shouldSkipLevel2", () => {
  it("一级审核员是 super_admin 时返回 true", () => {
    const user = makeUser({ first_reviewed_by: "sa_001" });
    const admins: ReviewAdmin[] = [
      { id: "sa_001", username: "super", role: "super_admin" },
      makeAdmin({ id: "admin_001" }),
    ];
    expect(shouldSkipLevel2(user, admins)).toBe(true);
  });

  it("一级审核员是普通 admin 时返回 false", () => {
    const user = makeUser({ first_reviewed_by: "admin_001" });
    const admins: ReviewAdmin[] = [
      makeAdmin({ id: "admin_001" }),
      { id: "sa_001", username: "super", role: "super_admin" },
    ];
    expect(shouldSkipLevel2(user, admins)).toBe(false);
  });

  it("无 first_reviewed_by 返回 false", () => {
    const user = makeUser({ first_reviewed_by: null });
    const admins: ReviewAdmin[] = [makeAdmin()];
    expect(shouldSkipLevel2(user, admins)).toBe(false);
  });
});

// ========== 2. KPI 计算 ==========
describe("kpi: calculateAdminKPI", () => {
  const admins: AdminInfo[] = [
    { id: "admin_001", username: "alice", role: "admin" },
    { id: "admin_002", username: "bob", role: "admin" },
  ];

  it("计算正确：总审核数、通过数、拒绝数", () => {
    const assignments: ReviewAssignment[] = [
      makeAssignment({ reviewed_by: "admin_001", review_result: "approved" }),
      makeAssignment({ id: "a2", reviewed_by: "admin_001", review_result: "rejected" }),
      makeAssignment({ id: "a3", reviewed_by: "admin_001", review_result: "approved" }),
      makeAssignment({ id: "a4", reviewed_by: "admin_002", review_result: "approved" }),
    ];

    const kpi = calculateAdminKPI("admin_001", assignments, admins);
    expect(kpi.total_reviewed).toBe(3);
    expect(kpi.approved_count).toBe(2);
    expect(kpi.rejected_count).toBe(1);
  });

  it("计算平均审核时长", () => {
    const assignments: ReviewAssignment[] = [
      makeAssignment({
        reviewed_by: "admin_001",
        assigned_at: "2026-08-01T00:00:00.000Z",
        reviewed_at: "2026-08-01T02:00:00.000Z", // 2 hours
      }),
      makeAssignment({
        id: "a2",
        reviewed_by: "admin_001",
        assigned_at: "2026-08-01T00:00:00.000Z",
        reviewed_at: "2026-08-01T04:00:00.000Z", // 4 hours
      }),
    ];

    const kpi = calculateAdminKPI("admin_001", assignments, admins);
    expect(kpi.average_review_time_hours).toBe(3); // (2+4)/2 = 3
  });

  it("计算超时次数", () => {
    const assignments: ReviewAssignment[] = [
      makeAssignment({
        reviewed_by: "admin_001",
        deadline: "2026-08-01T10:00:00.000Z",
        reviewed_at: "2026-08-01T12:00:00.000Z", // 超时
      }),
      makeAssignment({
        id: "a2",
        reviewed_by: "admin_001",
        deadline: "2026-08-05T10:00:00.000Z",
        reviewed_at: "2026-08-02T10:00:00.000Z", // 未超时
      }),
    ];

    const kpi = calculateAdminKPI("admin_001", assignments, admins);
    expect(kpi.overdue_count).toBe(1);
  });

  it("无审核记录返回零值", () => {
    const kpi = calculateAdminKPI("admin_001", [], admins);
    expect(kpi.total_reviewed).toBe(0);
    expect(kpi.approved_count).toBe(0);
    expect(kpi.average_review_time_hours).toBe(0);
    expect(kpi.overdue_count).toBe(0);
  });

  it("level2_pass_rate 在无 level2 记录时为 null", () => {
    const assignments: ReviewAssignment[] = [
      makeAssignment({ reviewed_by: "admin_001", review_level: null }),
    ];
    const kpi = calculateAdminKPI("admin_001", assignments, admins);
    expect(kpi.level2_pass_rate).toBeNull();
  });

  it("level2_pass_rate 在有 level2 记录时正确计算", () => {
    const assignments: ReviewAssignment[] = [
      makeAssignment({ reviewed_by: "admin_001", review_level: 2, review_result: "approved" }),
      makeAssignment({ id: "a2", reviewed_by: "admin_001", review_level: 2, review_result: "rejected" }),
    ];
    const kpi = calculateAdminKPI("admin_001", assignments, admins);
    expect(kpi.level2_pass_rate).toBe(50);
  });
});

describe("kpi: calculateTeamKPI", () => {
  it("汇总团队整体数据", () => {
    const admins: AdminInfo[] = [
      { id: "admin_001", username: "alice", role: "admin" },
      { id: "admin_002", username: "bob", role: "admin" },
    ];
    const assignments: ReviewAssignment[] = [
      makeAssignment({ reviewed_by: "admin_001", review_result: "approved" }),
      makeAssignment({ id: "a2", reviewed_by: "admin_002", review_result: "rejected" }),
      makeAssignment({ id: "a3", reviewed_by: "admin_002", review_result: "approved" }),
    ];

    const teamKPI = calculateTeamKPI(admins, assignments);
    expect(teamKPI.total_admins).toBe(2);
    expect(teamKPI.total_reviewed).toBe(3);
    expect(teamKPI.total_approved).toBe(2);
    expect(teamKPI.total_rejected).toBe(1);
    expect(teamKPI.overall_approval_rate).toBe(67); // 2/3 ≈ 67%
  });

  it("空数据返回零值", () => {
    const teamKPI = calculateTeamKPI([], []);
    expect(teamKPI.total_reviewed).toBe(0);
    expect(teamKPI.overall_approval_rate).toBe(0);
  });
});

describe("kpi: rankAdmins", () => {
  it("按 total_reviewed 降序排列", () => {
    const kpiList = [
      { admin_id: "a", admin_username: "a", total_reviewed: 10, approved_count: 5, rejected_count: 5, average_review_time_hours: 2, overdue_count: 0, level2_pass_rate: null },
      { admin_id: "b", admin_username: "b", total_reviewed: 20, approved_count: 15, rejected_count: 5, average_review_time_hours: 1, overdue_count: 1, level2_pass_rate: null },
      { admin_id: "c", admin_username: "c", total_reviewed: 5, approved_count: 3, rejected_count: 2, average_review_time_hours: 3, overdue_count: 0, level2_pass_rate: null },
    ];

    const ranked = rankAdmins(kpiList, "total_reviewed");
    expect(ranked[0].admin_id).toBe("b");
    expect(ranked[1].admin_id).toBe("a");
    expect(ranked[2].admin_id).toBe("c");
  });

  it("按 overdue_count 降序排列", () => {
    const kpiList = [
      { admin_id: "a", admin_username: "a", total_reviewed: 10, approved_count: 5, rejected_count: 5, average_review_time_hours: 2, overdue_count: 3, level2_pass_rate: null },
      { admin_id: "b", admin_username: "b", total_reviewed: 20, approved_count: 15, rejected_count: 5, average_review_time_hours: 1, overdue_count: 0, level2_pass_rate: null },
    ];

    const ranked = rankAdmins(kpiList, "overdue_count");
    expect(ranked[0].admin_id).toBe("a");
    expect(ranked[1].admin_id).toBe("b");
  });
});

// ========== 3. 管理员管理 ==========
describe("admin-management: getAdminStats", () => {
  it("正确统计 pending / reviewed / overdue", () => {
    const now = Date.now();
    const assignments = [
      { assigned_to: "admin_001", status: "pending", deadline: new Date(now - 86400000).toISOString(), reviewed_at: null }, // overdue
      { assigned_to: "admin_001", status: "pending", deadline: new Date(now + 86400000 * 3).toISOString(), reviewed_at: null }, // not overdue
      { assigned_to: "admin_001", status: "reviewed", deadline: null, reviewed_at: new Date().toISOString() },
      { assigned_to: "admin_002", status: "pending", deadline: null, reviewed_at: null }, // other admin
    ];

    const stats = getAdminStats("admin_001", "alice", assignments);
    expect(stats.pending_count).toBe(2);
    expect(stats.reviewed_count).toBe(1);
    expect(stats.overdue_count).toBe(1);
  });

  it("无分配返回零值", () => {
    const stats = getAdminStats("admin_001", "alice", []);
    expect(stats.pending_count).toBe(0);
    expect(stats.reviewed_count).toBe(0);
    expect(stats.overdue_count).toBe(0);
  });
});

describe("admin-management: canManageAdmin", () => {
  it("super_admin 可以管理普通 admin", () => {
    const manager: AdminUser = { id: "sa", username: "super", role: "super_admin", admin_permissions: null };
    const target: AdminUser = { id: "a1", username: "admin1", role: "admin", admin_permissions: ["user_review"] };
    expect(canManageAdmin(manager, target)).toBe(true);
  });

  it("super_admin 不能管理自己", () => {
    const manager: AdminUser = { id: "sa", username: "super", role: "super_admin", admin_permissions: null };
    const target: AdminUser = { id: "sa", username: "super", role: "super_admin", admin_permissions: null };
    expect(canManageAdmin(manager, target)).toBe(false);
  });

  it("普通 admin 不能管理其他 admin", () => {
    const manager: AdminUser = { id: "a1", username: "admin1", role: "admin", admin_permissions: ["user_review"] };
    const target: AdminUser = { id: "a2", username: "admin2", role: "admin", admin_permissions: ["user_ban"] };
    expect(canManageAdmin(manager, target)).toBe(false);
  });
});

describe("admin-management: getAdminModules", () => {
  const allPerms = ["user_review", "user_ban", "stats_view"] as const;

  it("super_admin 所有模块都是 granted", () => {
    const admin: AdminUser = { id: "sa", username: "super", role: "super_admin", admin_permissions: null };
    const modules = getAdminModules(admin, [...allPerms]);
    expect(modules.every((m) => m.granted)).toBe(true);
  });

  it("普通 admin 仅显示实际授予的权限", () => {
    const admin: AdminUser = { id: "a1", username: "admin1", role: "admin", admin_permissions: ["user_review", "stats_view"] };
    const modules = getAdminModules(admin, [...allPerms]);
    const grantedMap = new Map(modules.map((m) => [m.permission, m.granted]));
    expect(grantedMap.get("user_review")).toBe(true);
    expect(grantedMap.get("stats_view")).toBe(true);
    expect(grantedMap.get("user_ban")).toBe(false);
  });

  it("null permissions 时所有模块为 false", () => {
    const admin: AdminUser = { id: "a1", username: "admin1", role: "admin", admin_permissions: null };
    const modules = getAdminModules(admin, [...allPerms]);
    expect(modules.every((m) => !m.granted)).toBe(true);
  });
});

// ========== 4. 课程表 ==========
describe("schedule: validateSchedule", () => {
  it("合法数据通过校验", () => {
    const item: ScheduleItem = {
      title: "瑜伽课",
      description: "入门课程",
      start_time: "2026-09-01T09:00:00.000Z",
      end_time: "2026-09-01T10:00:00.000Z",
      created_by: "admin_001",
      repeat_type: "weekly",
    };
    const result = validateSchedule(item);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("空标题返回错误", () => {
    const item: ScheduleItem = {
      title: "",
      description: null,
      start_time: "2026-09-01T09:00:00.000Z",
      end_time: "2026-09-01T10:00:00.000Z",
      created_by: "admin_001",
      repeat_type: "none",
    };
    const result = validateSchedule(item);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("课程标题不能为空");
  });

  it("结束时间早于开始时间返回错误", () => {
    const item: ScheduleItem = {
      title: "测试",
      description: null,
      start_time: "2026-09-01T10:00:00.000Z",
      end_time: "2026-09-01T09:00:00.000Z",
      created_by: "admin_001",
      repeat_type: "none",
    };
    const result = validateSchedule(item);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("结束时间必须晚于开始时间"))).toBe(true);
  });

  it("开始等于结束时间返回错误", () => {
    const item: ScheduleItem = {
      title: "测试",
      description: null,
      start_time: "2026-09-01T10:00:00.000Z",
      end_time: "2026-09-01T10:00:00.000Z",
      created_by: "admin_001",
      repeat_type: "none",
    };
    const result = validateSchedule(item);
    expect(result.valid).toBe(false);
  });

  it("无效 repeat_type 返回错误", () => {
    const item: ScheduleItem = {
      title: "测试",
      description: null,
      start_time: "2026-09-01T09:00:00.000Z",
      end_time: "2026-09-01T10:00:00.000Z",
      created_by: "admin_001",
      repeat_type: "yearly" as unknown as "none",
    };
    const result = validateSchedule(item);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("无效的重复类型"))).toBe(true);
  });

  it("缺少时间字段返回错误", () => {
    const item: ScheduleItem = {
      title: "测试",
      description: null,
      start_time: "",
      end_time: "",
      created_by: "admin_001",
      repeat_type: "none",
    };
    const result = validateSchedule(item);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("开始时间不能为空");
    expect(result.errors).toContain("结束时间不能为空");
  });
});

describe("schedule: generateReminders", () => {
  it("生成 3 个提醒时间点", () => {
    const item: ScheduleItem = {
      title: "瑜伽课",
      description: null,
      start_time: "2026-09-01T10:00:00.000Z",
      end_time: "2026-09-01T11:00:00.000Z",
      created_by: "admin_001",
      repeat_type: "none",
    };
    const reminders = generateReminders(item);
    expect(reminders).toHaveLength(3);

    // Verify order: 1 day before < 1 hour before < 30 min before
    const times = reminders.map((r) => new Date(r).getTime());
    expect(times[0]).toBeLessThan(times[1]);
    expect(times[1]).toBeLessThan(times[2]);

    // 30 min before
    const startMs = new Date(item.start_time).getTime();
    expect(times[2]).toBe(startMs - 30 * 60 * 1000);
  });

  it("空 start_time 返回空数组", () => {
    const item: ScheduleItem = {
      title: "测试",
      description: null,
      start_time: "",
      end_time: "2026-09-01T11:00:00.000Z",
      created_by: "admin_001",
      repeat_type: "none",
    };
    expect(generateReminders(item)).toHaveLength(0);
  });

  it("无效 start_time 返回空数组", () => {
    const item: ScheduleItem = {
      title: "测试",
      description: null,
      start_time: "not-a-date",
      end_time: "2026-09-01T11:00:00.000Z",
      created_by: "admin_001",
      repeat_type: "none",
    };
    expect(generateReminders(item)).toHaveLength(0);
  });
});
