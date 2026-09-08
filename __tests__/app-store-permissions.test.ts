/**
 * 应用商店权限控制 + 管理功能测试
 *
 * 覆盖：
 *   1. 下载权限判定（published/beta/dev/hidden × 普通用户/管理员/内测码）
 *   2. API 层列表过滤（hidden 对普通用户不可见）
 *   3. API 层管理操作权限（非管理员禁止 create/update/delete）
 *   4. 内测码验证逻辑
 *   5. 应用独立性（状态互不影响）
 *   6. 各状态的展示标签和颜色
 *
 * 运行：pnpm vitest run __tests__/app-store-permissions.test.ts
 */

import { describe, it, expect } from "vitest";

// =====================================================================
// 纯函数提取：便于单测，不依赖 NextRequest/Supabase
// =====================================================================

type AppStatus = "hidden" | "dev" | "beta" | "published";

interface StoreApp {
  id: string;
  app_id: string;
  name: string;
  status: AppStatus;
  beta_slots: number;
  beta_used_slots: number;
  // ... 其他字段省略
}

interface User {
  role: "user" | "admin" | "super_admin" | null;
}

/** 判断是否为管理员（对应 API route.ts 中的 isAdmin） */
function isAdmin(user: User | null): boolean {
  if (!user) return false;
  const role = String(user.role || "");
  return role === "admin" || role === "super_admin";
}

/**
 * 判断用户能否下载某个应用（对应 app-store-app.tsx 中的 canDownload）
 * @param app 应用对象
 * @param user 当前用户
 * @param betaVerified 是否已验证该应用的内测码
 */
function canDownload(
  app: Pick<StoreApp, "status">,
  user: User | null,
  betaVerified: boolean
): boolean {
  return (
    app.status === "published" ||
    (app.status === "beta" && betaVerified) ||
    isAdmin(user)
  );
}

/**
 * 判断 API 列表是否应包含某应用（对应 API route.ts GET 中的过滤逻辑）
 * 管理员可见所有，普通用户不可见 hidden
 */
function shouldShowInList(app: Pick<StoreApp, "status">, user: User | null): boolean {
  if (isAdmin(user)) return true;
  return app.status !== "hidden";
}

/**
 * 判断某用户是否有权执行管理操作（create/update/delete/set_beta_code）
 */
function canManage(user: User | null): boolean {
  return isAdmin(user);
}

/**
 * 内测码验证逻辑
 * - 空码 → 失败
 * - 码不匹配 → 失败
 * - 超过 max_uses → 失败
 * - 正常 → 通过，used_count+1
 */
function verifyBetaCode(
  inputCode: string,
  storedCode: string | null,
  maxUses: number,
  usedCount: number
): { ok: boolean; error?: string } {
  if (!inputCode.trim()) {
    return { ok: false, error: "请输入内测码" };
  }
  if (!storedCode) {
    return { ok: false, error: "该应用未设置内测码" };
  }
  if (inputCode.trim() !== storedCode) {
    return { ok: false, error: "内测码错误" };
  }
  if (usedCount >= maxUses) {
    return { ok: false, error: "内测名额已满" };
  }
  return { ok: true };
}

/**
 * 判断应用是否可被安装（dev 状态不可安装，即使管理员也不行——只能下载/打开已安装的）
 */
function isInstallable(app: Pick<StoreApp, "status">, user: User | null, betaVerified: boolean): boolean {
  if (app.status === "dev" && !isAdmin(user)) return false;
  return canDownload(app, user, betaVerified);
}

// =====================================================================
// 测试数据
// =====================================================================

const publishedApp: StoreApp = {
  id: "1", app_id: "forum", name: "米米论坛", status: "published",
  beta_slots: 0, beta_used_slots: 0,
};
const betaApp: StoreApp = {
  id: "2", app_id: "game", name: "小游戏", status: "beta",
  beta_slots: 10, beta_used_slots: 3,
};
const devApp: StoreApp = {
  id: "3", app_id: "tool", name: "开发工具", status: "dev",
  beta_slots: 0, beta_used_slots: 0,
};
const hiddenApp: StoreApp = {
  id: "4", app_id: "secret", name: "内部工具", status: "hidden",
  beta_slots: 0, beta_used_slots: 0,
};

const normalUser: User = { role: "user" };
const adminUser: User = { role: "admin" };
const superAdminUser: User = { role: "super_admin" };
const noUser: User = { role: null };

// =====================================================================
// 测试用例
// =====================================================================

describe("应用商店 - 下载权限判定 (canDownload)", () => {
  describe("published 应用", () => {
    it("普通用户可下载", () => {
      expect(canDownload(publishedApp, normalUser, false)).toBe(true);
    });
    it("管理员可下载", () => {
      expect(canDownload(publishedApp, adminUser, false)).toBe(true);
    });
    it("未登录用户也可下载（前端可见时）", () => {
      // published 不需要任何验证
      expect(canDownload(publishedApp, { role: null }, false)).toBe(true);
    });
  });

  describe("beta 应用", () => {
    it("普通用户未验证内测码 → 不可下载", () => {
      expect(canDownload(betaApp, normalUser, false)).toBe(false);
    });
    it("普通用户已验证内测码 → 可下载", () => {
      expect(canDownload(betaApp, normalUser, true)).toBe(true);
    });
    it("管理员无需内测码 → 可下载", () => {
      expect(canDownload(betaApp, adminUser, false)).toBe(true);
    });
    it("超管无需内测码 → 可下载", () => {
      expect(canDownload(betaApp, superAdminUser, false)).toBe(true);
    });
  });

  describe("dev 应用", () => {
    it("普通用户 → 不可下载", () => {
      expect(canDownload(devApp, normalUser, false)).toBe(false);
    });
    it("管理员 → 可下载（管理员可访问所有状态的应用）", () => {
      // canDownload 只看 status，dev 状态管理员通过 isAdmin 放行
      expect(canDownload(devApp, adminUser, false)).toBe(true);
    });
  });

  describe("hidden 应用", () => {
    it("普通用户 → 不可下载", () => {
      expect(canDownload(hiddenApp, normalUser, false)).toBe(false);
    });
    it("管理员 → 可下载", () => {
      expect(canDownload(hiddenApp, adminUser, false)).toBe(true);
    });
  });

  describe("边界情况", () => {
    it("未登录用户（null）对 beta 应用 → 不可下载", () => {
      expect(canDownload(betaApp, { role: null }, false)).toBe(false);
    });
    it("未登录用户对 published 应用 → 可下载", () => {
      expect(canDownload(publishedApp, { role: null }, false)).toBe(true);
    });
  });
});

describe("应用商店 - 列表可见性 (shouldShowInList)", () => {
  it("管理员能看到 hidden 应用", () => {
    expect(shouldShowInList(hiddenApp, adminUser)).toBe(true);
    expect(shouldShowInList(hiddenApp, superAdminUser)).toBe(true);
  });

  it("普通用户看不到 hidden 应用", () => {
    expect(shouldShowInList(hiddenApp, normalUser)).toBe(false);
  });

  it("普通用户能看到 published/beta/dev 应用", () => {
    expect(shouldShowInList(publishedApp, normalUser)).toBe(true);
    expect(shouldShowInList(betaApp, normalUser)).toBe(true);
    // dev 在列表里可见但不可下载
    expect(shouldShowInList(devApp, normalUser)).toBe(true);
  });

  it("所有用户都能看到非 hidden 应用", () => {
    for (const app of [publishedApp, betaApp, devApp]) {
      expect(shouldShowInList(app, normalUser)).toBe(true);
      expect(shouldShowInList(app, adminUser)).toBe(true);
    }
  });
});

describe("应用商店 - 管理操作权限 (canManage)", () => {
  it("普通用户不能管理", () => {
    expect(canManage(normalUser)).toBe(false);
  });

  it("管理员可以管理", () => {
    expect(canManage(adminUser)).toBe(true);
  });

  it("超管可以管理", () => {
    expect(canManage(superAdminUser)).toBe(true);
  });

  it("未登录不能管理", () => {
    expect(canManage(noUser)).toBe(false);
    expect(canManage({ role: null })).toBe(false);
  });
});

describe("应用商店 - 内测码验证", () => {
  it("正确内测码 → 通过", () => {
    const res = verifyBetaCode("ABC123", "ABC123", 10, 3);
    expect(res.ok).toBe(true);
  });

  it("错误内测码 → 失败", () => {
    const res = verifyBetaCode("WRONG", "ABC123", 10, 3);
    expect(res.ok).toBe(false);
    expect(res.error).toBe("内测码错误");
  });

  it("空内测码 → 失败", () => {
    const res = verifyBetaCode("", "ABC123", 10, 3);
    expect(res.ok).toBe(false);
    expect(res.error).toBe("请输入内测码");
  });

  it("空格内测码 → 失败", () => {
    const res = verifyBetaCode("   ", "ABC123", 10, 3);
    expect(res.ok).toBe(false);
    expect(res.error).toBe("请输入内测码");
  });

  it("未设置内测码的应用 → 失败", () => {
    const res = verifyBetaCode("ANY", null, 10, 3);
    expect(res.ok).toBe(false);
    expect(res.error).toBe("该应用未设置内测码");
  });

  it("内测名额已满 → 失败", () => {
    const res = verifyBetaCode("ABC123", "ABC123", 10, 10);
    expect(res.ok).toBe(false);
    expect(res.error).toBe("内测名额已满");
  });

  it("内测名额已满（超过） → 失败", () => {
    const res = verifyBetaCode("ABC123", "ABC123", 10, 15);
    expect(res.ok).toBe(false);
    expect(res.error).toBe("内测名额已满");
  });

  it("还有剩余名额 → 通过", () => {
    const res = verifyBetaCode("ABC123", "ABC123", 10, 9);
    expect(res.ok).toBe(true);
  });
});

describe("应用商店 - 应用独立性", () => {
  it("不同应用状态互不影响", () => {
    // 修改一个应用的状态不应影响其他应用
    const apps = [publishedApp, betaApp, devApp, hiddenApp];
    const originalStatuses = apps.map((a) => a.status);

    // 修改第一个应用为 hidden
    const modified = { ...apps[0], status: "hidden" as AppStatus };
    apps[0] = modified;

    // 其他应用状态不变
    expect(apps[1].status).toBe(originalStatuses[1]);
    expect(apps[2].status).toBe(originalStatuses[2]);
    expect(apps[3].status).toBe(originalStatuses[3]);
  });

  it("beta 应用的内测验证不影响其他 beta 应用", () => {
    const betaApp1 = { ...betaApp, app_id: "beta1" };
    const betaApp2 = { ...betaApp, app_id: "beta2" };

    // 验证 betaApp1 的内测码
    const verifiedApps = new Set<string>();
    const res1 = verifyBetaCode("CODE1", "CODE1", 10, 0);
    if (res1.ok) verifiedApps.add(betaApp1.app_id);

    // betaApp2 仍然未验证
    expect(verifiedApps.has(betaApp2.app_id)).toBe(false);
    expect(canDownload(betaApp2, normalUser, verifiedApps.has(betaApp2.app_id))).toBe(false);
  });

  it("下架一个应用不影响其他应用可见性", () => {
    const apps = [publishedApp, betaApp, devApp];
    const user = normalUser;

    // 把 beta 应用改为 hidden
    const modifiedBeta = { ...betaApp, status: "hidden" as AppStatus };

    // 其他应用仍然可见
    expect(shouldShowInList(publishedApp, user)).toBe(true);
    expect(shouldShowInList(modifiedBeta, user)).toBe(false);
    expect(shouldShowInList(devApp, user)).toBe(true);
  });
});

describe("应用商店 - 状态标签和颜色", () => {
  const APP_STATUS_LABEL: Record<AppStatus, string> = {
    hidden: "隐藏",
    dev: "开发中",
    beta: "内测中",
    published: "已上架",
  };

  const APP_STATUS_COLOR: Record<AppStatus, string> = {
    hidden: "#6b7280",
    dev: "#eab308",
    beta: "#f59e0b",
    published: "#22c55e",
  };

  it("所有状态都有对应标签", () => {
    const statuses: AppStatus[] = ["hidden", "dev", "beta", "published"];
    for (const s of statuses) {
      expect(APP_STATUS_LABEL[s]).toBeDefined();
      expect(APP_STATUS_LABEL[s].length).toBeGreaterThan(0);
    }
  });

  it("所有状态都有对应颜色", () => {
    const statuses: AppStatus[] = ["hidden", "dev", "beta", "published"];
    for (const s of statuses) {
      expect(APP_STATUS_COLOR[s]).toBeDefined();
      expect(APP_STATUS_COLOR[s]).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("状态值不会超出已知枚举", () => {
    const validStatuses = new Set(["hidden", "dev", "beta", "published"]);
    const testStatuses: AppStatus[] = ["hidden", "dev", "beta", "published"];
    for (const s of testStatuses) {
      expect(validStatuses.has(s)).toBe(true);
    }
  });
});

describe("应用商店 - 综合场景", () => {
  it("场景1: 新用户注册后看到应用商店 → published可下载，beta需内测码", () => {
    const newUser: User = { role: "user" };
    expect(canDownload(publishedApp, newUser, false)).toBe(true);
    expect(canDownload(betaApp, newUser, false)).toBe(false);
    expect(canDownload(devApp, newUser, false)).toBe(false);
    expect(canDownload(hiddenApp, newUser, false)).toBe(false);
  });

  it("场景2: 用户拿到beta内测码 → 可下载beta应用", () => {
    const user: User = { role: "user" };
    // 之前不能下载
    expect(canDownload(betaApp, user, false)).toBe(false);
    // 验证内测码后
    const verified = true;
    expect(canDownload(betaApp, user, verified)).toBe(true);
  });

  it("场景3: 管理员可以下载所有应用", () => {
    const admin: User = { role: "admin" };
    expect(canDownload(publishedApp, admin, false)).toBe(true);
    expect(canDownload(betaApp, admin, false)).toBe(true);
    expect(canDownload(devApp, admin, false)).toBe(true);
    expect(canDownload(hiddenApp, admin, false)).toBe(true);
  });

  it("场景4: 超管可以下载所有应用", () => {
    const superAdmin: User = { role: "super_admin" };
    expect(canDownload(publishedApp, superAdmin, false)).toBe(true);
    expect(canDownload(betaApp, superAdmin, false)).toBe(true);
    expect(canDownload(devApp, superAdmin, false)).toBe(true);
    expect(canDownload(hiddenApp, superAdmin, false)).toBe(true);
  });

  it("场景5: 管理员将应用从published改为hidden → 普通用户立即看不到", () => {
    const user: User = { role: "user" };
    const app: StoreApp = { ...publishedApp };

    // 之前能看到
    expect(shouldShowInList(app, user)).toBe(true);
    expect(canDownload(app, user, false)).toBe(true);

    // 改为 hidden
    const hiddenVersion = { ...app, status: "hidden" as AppStatus };

    // 现在看不到也下载不了
    expect(shouldShowInList(hiddenVersion, user)).toBe(false);
    expect(canDownload(hiddenVersion, user, false)).toBe(false);

    // 但管理员仍能看到和下载
    expect(shouldShowInList(hiddenVersion, adminUser)).toBe(true);
    expect(canDownload(hiddenVersion, adminUser, false)).toBe(true);
  });

  it("场景6: 应用商店列表只显示非hidden给普通用户", () => {
    const allApps = [publishedApp, betaApp, devApp, hiddenApp];
    const user: User = { role: "user" };

    const visible = allApps.filter((a) => shouldShowInList(a, user));
    expect(visible).toHaveLength(3);
    expect(visible.map((a) => a.app_id)).toEqual(["forum", "game", "tool"]);
    expect(visible.find((a) => a.status === "hidden")).toBeUndefined();
  });

  it("场景7: 管理员能看到全部应用", () => {
    const allApps = [publishedApp, betaApp, devApp, hiddenApp];

    const visible = allApps.filter((a) => shouldShowInList(a, adminUser));
    expect(visible).toHaveLength(4);
  });
});

// =====================================================================
// 新增测试：app_manage 权限校验逻辑
// =====================================================================

type AdminPermission =
  | "user_review" | "user_ban" | "user_manage" | "invite_manage"
  | "forum_manage" | "stats_view" | "tree_view" | "system_setting"
  | "review_queue" | "permissions" | "audit_log" | "app_manage";

const ROLE_PERMISSIONS: Record<string, AdminPermission[]> = {
  super_admin: [
    "user_review", "user_ban", "user_manage", "invite_manage",
    "forum_manage", "stats_view", "tree_view", "system_setting",
    "review_queue", "permissions", "audit_log", "app_manage",
  ],
  admin: [
    "user_review", "user_ban", "user_manage", "invite_manage",
    "forum_manage", "stats_view", "tree_view", "review_queue", "audit_log",
  ],
};

function hasPermission(role: string, permission: AdminPermission, adminPermissions?: AdminPermission[]): boolean {
  if (role === "super_admin") return true;
  if (ROLE_PERMISSIONS[role]?.includes(permission)) return true;
  if (adminPermissions?.includes(permission)) return true;
  return false;
}

function canManageApps(role: string | null, adminPermissions?: AdminPermission[]): boolean {
  if (!role) return false;
  if (role !== "admin" && role !== "super_admin") return false;
  return hasPermission(role, "app_manage", adminPermissions);
}

describe("应用商店 - app_manage 权限校验", () => {
  it("超级管理员默认拥有 app_manage 权限", () => {
    expect(canManageApps("super_admin")).toBe(true);
  });

  it("普通管理员默认没有 app_manage 权限", () => {
    expect(canManageApps("admin")).toBe(false);
  });

  it("普通管理员被单独授予 app_manage 后拥有权限", () => {
    expect(canManageApps("admin", ["app_manage"])).toBe(true);
  });

  it("普通管理员有其他权限但没有 app_manage → 无权限", () => {
    expect(canManageApps("admin", ["user_review", "forum_manage"])).toBe(false);
  });

  it("普通用户即使有 admin_permissions 也不能管理应用", () => {
    expect(canManageApps("user", ["app_manage"])).toBe(false);
  });

  it("未登录用户不能管理", () => {
    expect(canManageApps(null)).toBe(false);
  });
});

describe("应用商店 - 管理面板可见性判断", () => {
  function shouldShowAdminPanel(role: string | null, adminPermissions?: AdminPermission[]): boolean {
    return canManageApps(role, adminPermissions);
  }

  it("超级管理员看到管理面板", () => {
    expect(shouldShowAdminPanel("super_admin")).toBe(true);
  });

  it("有 app_manage 权限的普通管理员看到管理面板", () => {
    expect(shouldShowAdminPanel("admin", ["app_manage"])).toBe(true);
  });

  it("没有 app_manage 权限的普通管理员看不到管理面板", () => {
    expect(shouldShowAdminPanel("admin")).toBe(false);
    expect(shouldShowAdminPanel("admin", ["user_review"])).toBe(false);
  });

  it("普通用户看不到管理面板", () => {
    expect(shouldShowAdminPanel("user")).toBe(false);
  });

  it("未登录用户看不到管理面板", () => {
    expect(shouldShowAdminPanel(null)).toBe(false);
  });
});

describe("应用商店 - 管理操作审计日志要求", () => {
  function requiresAuditLog(action: string): boolean {
    const auditableActions = ["create_app", "update_app", "delete_app", "set_beta_code"];
    return auditableActions.includes(action);
  }

  it("创建应用需要审计日志", () => {
    expect(requiresAuditLog("create_app")).toBe(true);
  });

  it("更新应用需要审计日志", () => {
    expect(requiresAuditLog("update_app")).toBe(true);
  });

  it("删除应用需要审计日志", () => {
    expect(requiresAuditLog("delete_app")).toBe(true);
  });

  it("设置内测码需要审计日志", () => {
    expect(requiresAuditLog("set_beta_code")).toBe(true);
  });

  it("列表查询不需要审计日志", () => {
    expect(requiresAuditLog("list")).toBe(false);
  });

  it("未知操作不需要审计日志", () => {
    expect(requiresAuditLog("unknown_action")).toBe(false);
  });
});

describe("应用商店 - 应用创建默认值", () => {
  interface CreateAppInput {
    name?: string;
    icon?: string;
    developer?: string;
    category?: string;
    description?: string;
    features?: string[];
    version?: string;
    status?: AppStatus;
  }

  function buildCreateAppPayload(input: CreateAppInput) {
    return {
      name: input.name || "未命名应用",
      icon: input.icon || "📦",
      developer: input.developer || "米米宇宙",
      category: input.category || "其他",
      description: input.description || "",
      features: Array.isArray(input.features) ? input.features : [],
      version: input.version || "1.0.0",
      status: input.status || "dev",
    };
  }

  it("空输入创建应用 → 默认名称为'未命名应用'", () => {
    const payload = buildCreateAppPayload({});
    expect(payload.name).toBe("未命名应用");
  });

  it("空输入创建应用 → 默认状态为 dev", () => {
    const payload = buildCreateAppPayload({});
    expect(payload.status).toBe("dev");
  });

  it("空输入创建应用 → 默认图标为 📦", () => {
    const payload = buildCreateAppPayload({});
    expect(payload.icon).toBe("📦");
  });

  it("空输入创建应用 → 默认版本为 1.0.0", () => {
    const payload = buildCreateAppPayload({});
    expect(payload.version).toBe("1.0.0");
  });

  it("指定所有字段 → 使用用户输入", () => {
    const payload = buildCreateAppPayload({
      name: "聊天",
      icon: "💬",
      developer: "米米",
      category: "社交",
      description: "测试描述",
      features: ["功能1"],
      version: "2.0.0",
      status: "published",
    });
    expect(payload.name).toBe("聊天");
    expect(payload.icon).toBe("💬");
    expect(payload.status).toBe("published");
    expect(payload.features).toEqual(["功能1"]);
  });
});

describe("应用商店 - 状态切换场景", () => {
  function getVisibilityMatrix(status: AppStatus, role: string | null) {
    const user: User = { role: role as User["role"] };
    return {
      visible: shouldShowInList({ ...publishedApp, status }, user),
      downloadable: canDownload({ ...publishedApp, status }, user, false),
    };
  }

  it("从 published 切换到 hidden → 普通用户立即看不到", () => {
    const before = getVisibilityMatrix("published", "user");
    const after = getVisibilityMatrix("hidden", "user");
    expect(before.visible).toBe(true);
    expect(after.visible).toBe(false);
  });

  it("从 hidden 切换到 published → 普通用户立即可见", () => {
    const before = getVisibilityMatrix("hidden", "user");
    const after = getVisibilityMatrix("published", "user");
    expect(before.visible).toBe(false);
    expect(after.visible).toBe(true);
  });

  it("从 published 切换到 beta → 普通用户可见但不可下载", () => {
    const after = getVisibilityMatrix("beta", "user");
    expect(after.visible).toBe(true);
    expect(after.downloadable).toBe(false);
  });

  it("从 published 切换到 dev → 普通用户可见但不可下载", () => {
    const after = getVisibilityMatrix("dev", "user");
    expect(after.visible).toBe(true);
    expect(after.downloadable).toBe(false);
  });

  it("管理员在任何状态下都能下载", () => {
    const statuses: AppStatus[] = ["published", "beta", "dev", "hidden"];
    for (const s of statuses) {
      const v = getVisibilityMatrix(s, "admin");
      expect(v.visible).toBe(true);
      expect(v.downloadable).toBe(true);
    }
  });
});

describe("应用商店 - 内测码管理参数校验", () => {
  function validateBetaCodeInput(appId: string | null, code: string | null): { valid: boolean; error?: string } {
    if (!appId || !code) {
      return { valid: false, error: "缺少参数" };
    }
    return { valid: true };
  }

  it("缺少 app_id → 报错", () => {
    const result = validateBetaCodeInput(null, "CODE123");
    expect(result.valid).toBe(false);
    expect(result.error).toBe("缺少参数");
  });

  it("缺少 code → 报错", () => {
    const result = validateBetaCodeInput("app_1", null);
    expect(result.valid).toBe(false);
  });

  it("参数齐全 → 通过校验", () => {
    const result = validateBetaCodeInput("app_1", "BETA2024");
    expect(result.valid).toBe(true);
  });

  it("空字符串 app_id → 报错", () => {
    const result = validateBetaCodeInput("", "CODE123");
    expect(result.valid).toBe(false);
  });
});

// =====================================================================
// 独立「应用管理」App：B 方案权限模型（大管理 / 小管理）
// 纯函数来自 src/lib/app-admin.ts，不依赖 NextRequest / Supabase
// =====================================================================

import {
    isAdminRole,
    hasAppPermission,
    isBigManager,
    canOpenAppAdmin,
    canManageApp,
    canCreateApp,
    canDeleteApp,
    canReorderApps,
    canAssignManagers,
    filterAppsForAdmin,
    sanitizeUpdatePayload,
    buildReorderMap,
    moveItem,
    checkBatchStatusUpdate,
    checkBatchDelete,
    computeAppStats,
    validateBetaCodeInput as validateBetaCodeInputV2,
    betaCodeRemaining,
    validateManagerAssign,
    APP_ADMIN_AUDIT_ACTIONS,
    SMALL_MANAGER_UPDATE_ALLOWED,
    type AdminContext,
} from "../src/lib/app-admin";
import type { StoreAppItem, StoreAppBetaCode } from "../src/lib/apps";

function makeCtx(over: Partial<AdminContext> = {}): AdminContext {
    return {
        userId: "u-default",
        username: "default",
        role: "user",
        permissions: [],
        managedAppIds: [],
        ...over,
    };
}

const superAdminCtx = makeCtx({ userId: "u-root", username: "root", role: "super_admin" });
const bigAdminCtx = makeCtx({
    userId: "u-big",
    username: "bigboss",
    role: "admin",
    permissions: ["user_review", "app_manage"],
});
const plainAdminCtx = makeCtx({
    userId: "u-plain",
    username: "plainadmin",
    role: "admin",
    permissions: ["user_review"],
});
const smallAdminCtx = makeCtx({
    userId: "u-small",
    username: "smallguy",
    role: "admin",
    permissions: [],
    managedAppIds: ["game", "forum"],
});
const normalUserCtx = makeCtx({ userId: "u-1", username: "normal", role: "user" });
const guestCtx = makeCtx({ role: null });

function makeApp(appId: string, over: Partial<StoreAppItem> = {}): StoreAppItem {
    return {
        id: `id-${appId}`,
        app_id: appId,
        name: appId,
        icon: "📦",
        developer: "米米宇宙",
        category: "工具",
        description: "",
        features: [],
        screenshots: [],
        version: "1.0.0",
        status: "dev",
        updated_at: "2025-01-01T00:00:00Z",
        beta_info: "",
        beta_wipe: false,
        beta_slots: 0,
        beta_used_slots: 0,
        route: appId,
        order: 0,
        is_external: false,
        ...over,
    } as StoreAppItem;
}

function makeCode(appId: string, over: Partial<StoreAppBetaCode> = {}): StoreAppBetaCode {
    return {
        id: `c-${appId}`,
        app_id: appId,
        code: `CODE-${appId}`,
        max_uses: 10,
        used_count: 0,
        created_at: "2025-01-01T00:00:00Z",
        ...over,
    } as StoreAppBetaCode;
}

const allApps: StoreAppItem[] = [
    makeApp("forum", { name: "米米论坛", status: "published", order: 0 }),
    makeApp("game", { name: "小游戏", status: "beta", order: 1 }),
    makeApp("secret", { name: "内部工具", status: "hidden", order: 2 }),
    makeApp("tool", { name: "开发工具", status: "dev", order: 3 }),
];

// ---------- 角色与大管理判定 ----------

describe("应用管理 - 角色判定 (isAdminRole)", () => {
    it("super_admin / admin 是管理员", () => {
        expect(isAdminRole("super_admin")).toBe(true);
        expect(isAdminRole("admin")).toBe(true);
    });
    it("普通用户 / 未登录不是管理员", () => {
        expect(isAdminRole("user")).toBe(false);
        expect(isAdminRole(null)).toBe(false);
    });
});

describe("应用管理 - 大管理判定 (isBigManager)", () => {
    it("super_admin 是大管理", () => {
        expect(isBigManager(superAdminCtx)).toBe(true);
    });
    it("持有 app_manage 的 admin 是大管理", () => {
        expect(isBigManager(bigAdminCtx)).toBe(true);
    });
    it("无 app_manage 的 admin 不是大管理", () => {
        expect(isBigManager(plainAdminCtx)).toBe(false);
    });
    it("被分配 app 的小管理不是大管理", () => {
        expect(isBigManager(smallAdminCtx)).toBe(false);
    });
    it("普通用户不是大管理", () => {
        expect(isBigManager(normalUserCtx)).toBe(false);
    });
    it("细粒度权限判定：super_admin 无视 permissions 数组", () => {
        expect(hasAppPermission("super_admin", [], "app_manage")).toBe(true);
    });
    it("细粒度权限判定：admin 需在 permissions 中", () => {
        expect(hasAppPermission("admin", ["app_manage"], "app_manage")).toBe(true);
        expect(hasAppPermission("admin", ["user_review"], "app_manage")).toBe(false);
    });
    it("细粒度权限判定：普通用户永远 false", () => {
        expect(hasAppPermission("user", ["app_manage"], "app_manage")).toBe(false);
    });
});

// ---------- 独立 App 入口权限 ----------

describe("应用管理 - 独立 App 可见性 (canOpenAppAdmin)", () => {
    it("大管理可进入", () => {
        expect(canOpenAppAdmin(superAdminCtx)).toBe(true);
        expect(canOpenAppAdmin(bigAdminCtx)).toBe(true);
    });
    it("被分配了 app 的小管理可进入", () => {
        expect(canOpenAppAdmin(smallAdminCtx)).toBe(true);
    });
    it("没有任何分配的普通 admin 不可进入", () => {
        expect(canOpenAppAdmin(plainAdminCtx)).toBe(false);
    });
    it("普通用户 / 未登录不可进入", () => {
        expect(canOpenAppAdmin(normalUserCtx)).toBe(false);
        expect(canOpenAppAdmin(guestCtx)).toBe(false);
    });
});

// ---------- 单 app 操作权限（含越权 403 场景） ----------

describe("应用管理 - 单应用操作权限 (canManageApp)", () => {
    it("大管理可管理任意 app", () => {
        for (const app of allApps) {
            expect(canManageApp(superAdminCtx, app.app_id)).toBe(true);
            expect(canManageApp(bigAdminCtx, app.app_id)).toBe(true);
        }
    });
    it("小管理可管理被分配的 app（编辑/上下架/内测码）", () => {
        expect(canManageApp(smallAdminCtx, "game")).toBe(true);
        expect(canManageApp(smallAdminCtx, "forum")).toBe(true);
    });
    it("小管理越权操作未分配的 app → false（后端应返回 403）", () => {
        expect(canManageApp(smallAdminCtx, "secret")).toBe(false);
        expect(canManageApp(smallAdminCtx, "tool")).toBe(false);
    });
    it("无分配的 admin / 普通用户对任何 app 都无权", () => {
        expect(canManageApp(plainAdminCtx, "game")).toBe(false);
        expect(canManageApp(normalUserCtx, "game")).toBe(false);
    });
    it("空 app_id → false", () => {
        expect(canManageApp(superAdminCtx, null)).toBe(false);
        expect(canManageApp(superAdminCtx, "")).toBe(false);
        expect(canManageApp(smallAdminCtx, undefined)).toBe(false);
    });
});

// ---------- 创建 / 删除 / 排序 / 分配权限 ----------

describe("应用管理 - 高权限操作限制", () => {
    it("创建应用：仅大管理", () => {
        expect(canCreateApp(superAdminCtx)).toBe(true);
        expect(canCreateApp(bigAdminCtx)).toBe(true);
        expect(canCreateApp(smallAdminCtx)).toBe(false);
        expect(canCreateApp(plainAdminCtx)).toBe(false);
        expect(canCreateApp(normalUserCtx)).toBe(false);
    });
    it("删除应用：仅大管理", () => {
        expect(canDeleteApp(superAdminCtx)).toBe(true);
        expect(canDeleteApp(bigAdminCtx)).toBe(true);
        expect(canDeleteApp(smallAdminCtx)).toBe(false);
        expect(canDeleteApp(normalUserCtx)).toBe(false);
    });
    it("排序：仅大管理（全局操作）", () => {
        expect(canReorderApps(superAdminCtx)).toBe(true);
        expect(canReorderApps(bigAdminCtx)).toBe(true);
        expect(canReorderApps(smallAdminCtx)).toBe(false);
        expect(canReorderApps(plainAdminCtx)).toBe(false);
    });
    it("分配/移除小管理：仅 super_admin（有 app_manage 的 admin 也不行）", () => {
        expect(canAssignManagers(superAdminCtx)).toBe(true);
        expect(canAssignManagers(bigAdminCtx)).toBe(false);
        expect(canAssignManagers(smallAdminCtx)).toBe(false);
        expect(canAssignManagers(normalUserCtx)).toBe(false);
    });
});

// ---------- 列表过滤 ----------

describe("应用管理 - 小管理列表过滤 (filterAppsForAdmin)", () => {
    it("大管理看到全部应用（含 hidden）", () => {
        expect(filterAppsForAdmin(allApps, superAdminCtx)).toHaveLength(4);
        expect(filterAppsForAdmin(allApps, bigAdminCtx)).toHaveLength(4);
    });
    it("小管理只看到被分配的应用", () => {
        const visible = filterAppsForAdmin(allApps, smallAdminCtx);
        expect(visible.map((a) => a.app_id).sort()).toEqual(["forum", "game"]);
    });
    it("小管理看不到未分配的 hidden 应用", () => {
        const visible = filterAppsForAdmin(allApps, smallAdminCtx);
        expect(visible.find((a) => a.app_id === "secret")).toBeUndefined();
    });
    it("无权限用户返回空列表", () => {
        expect(filterAppsForAdmin(allApps, normalUserCtx)).toEqual([]);
        expect(filterAppsForAdmin(allApps, plainAdminCtx)).toEqual([]);
        expect(filterAppsForAdmin(allApps, guestCtx)).toEqual([]);
    });
    it("小管理被分配的应用被删除后自动从可见列表消失", () => {
        const after = allApps.filter((a) => a.app_id !== "game");
        expect(filterAppsForAdmin(after, smallAdminCtx).map((a) => a.app_id)).toEqual(["forum"]);
    });
});

// ---------- 小管理 update 白名单 ----------

describe("应用管理 - 小管理更新字段白名单 (sanitizeUpdatePayload)", () => {
    const payload = {
        id: "id-1",
        name: "新名字",
        status: "published",
        beta_info: "内测说明",
        app_id: "hacked-id",
        order: 999,
        is_external: true,
    };

    it("大管理：字段原样保留", () => {
        const out = sanitizeUpdatePayload(bigAdminCtx, payload);
        expect(out).toEqual(payload);
    });
    it("小管理：保留 name/status 等白名单字段", () => {
        const out = sanitizeUpdatePayload(smallAdminCtx, payload);
        expect(out.name).toBe("新名字");
        expect(out.status).toBe("published");
        expect(out.beta_info).toBe("内测说明");
        expect(out.id).toBe("id-1");
    });
    it("小管理：禁止修改 app_id / order / is_external", () => {
        const out = sanitizeUpdatePayload(smallAdminCtx, payload);
        expect("app_id" in out).toBe(false);
        expect("order" in out).toBe(false);
        expect("is_external" in out).toBe(false);
    });
    it("白名单包含 status（允许上下架）但不含 order（排序是大管理专属）", () => {
        expect(SMALL_MANAGER_UPDATE_ALLOWED).toContain("status");
        expect(SMALL_MANAGER_UPDATE_ALLOWED).toContain("route");
        expect(SMALL_MANAGER_UPDATE_ALLOWED).not.toContain("app_id");
        expect(SMALL_MANAGER_UPDATE_ALLOWED).not.toContain("order");
        expect(SMALL_MANAGER_UPDATE_ALLOWED).not.toContain("is_external");
    });
});

// ---------- 批量操作权限边界 ----------

describe("应用管理 - 批量上下架权限 (checkBatchStatusUpdate)", () => {
    it("大管理批量操作全部通过", () => {
        const r = checkBatchStatusUpdate(bigAdminCtx, ["forum", "game", "secret"]);
        expect(r.ok).toBe(true);
        expect(r.deniedAppIds).toHaveLength(0);
    });
    it("小管理操作自己被分配的 app → 通过", () => {
        const r = checkBatchStatusUpdate(smallAdminCtx, ["game", "forum"]);
        expect(r.ok).toBe(true);
    });
    it("小管理批量中混入未分配 app → fail-closed，明确列出越权项", () => {
        const r = checkBatchStatusUpdate(smallAdminCtx, ["game", "secret", "tool"]);
        expect(r.ok).toBe(false);
        expect(r.deniedAppIds.sort()).toEqual(["secret", "tool"]);
    });
    it("小管理批量全部未分配 → 全部拒绝", () => {
        const r = checkBatchStatusUpdate(smallAdminCtx, ["secret"]);
        expect(r.ok).toBe(false);
        expect(r.deniedAppIds).toEqual(["secret"]);
    });
    it("无权限用户批量 → 全部拒绝", () => {
        const r = checkBatchStatusUpdate(normalUserCtx, ["forum", "game"]);
        expect(r.ok).toBe(false);
        expect(r.deniedAppIds).toHaveLength(2);
    });
});

describe("应用管理 - 批量删除权限 (checkBatchDelete)", () => {
    it("大管理可批量删除", () => {
        expect(checkBatchDelete(superAdminCtx, ["a", "b"]).ok).toBe(true);
        expect(checkBatchDelete(bigAdminCtx, ["a"]).ok).toBe(true);
    });
    it("小管理不能批量删除任何应用（即使包含自己被分配的）", () => {
        const r = checkBatchDelete(smallAdminCtx, ["game", "forum"]);
        expect(r.ok).toBe(false);
        expect(r.deniedAppIds).toHaveLength(2);
    });
    it("普通用户批量删除 → 拒绝", () => {
        expect(checkBatchDelete(normalUserCtx, ["game"]).ok).toBe(false);
    });
});

// ---------- 排序 ----------

describe("应用管理 - 排序 (buildReorderMap / moveItem)", () => {
    it("buildReorderMap 按展示顺序生成 0 起的 order 映射", () => {
        const map = buildReorderMap(["forum", "game", "secret"]);
        expect(map).toEqual({ forum: 0, game: 1, secret: 2 });
    });
    it("空数组返回空映射", () => {
        expect(buildReorderMap([])).toEqual({});
    });
    it("moveItem 下移：第二项与第三项交换", () => {
        const moved = moveItem(["a", "b", "c"], 1, 1);
        expect(moved).toEqual(["a", "c", "b"]);
    });
    it("moveItem 上移：第二项与第一项交换", () => {
        const moved = moveItem(["a", "b", "c"], 1, -1);
        expect(moved).toEqual(["b", "a", "c"]);
    });
    it("moveItem 边界：首项上移 / 末项下移原样返回", () => {
        expect(moveItem(["a", "b"], 0, -1)).toEqual(["a", "b"]);
        expect(moveItem(["a", "b"], 1, 1)).toEqual(["a", "b"]);
    });
    it("moveItem 越界索引原样返回", () => {
        expect(moveItem(["a"], 5, 1)).toEqual(["a"]);
        expect(moveItem(["a"], -1, -1)).toEqual(["a"]);
    });
    it("上移第一名应用后 store 展示顺序同步改变", () => {
        const order = ["forum", "game", "secret"];
        const moved = moveItem(order, 1, -1);
        const map = buildReorderMap(moved);
        expect(map.game).toBe(0);
        expect(map.forum).toBe(1);
    });
});

// ---------- 统计概览 ----------

describe("应用管理 - 统计概览 (computeAppStats)", () => {
    const codes: StoreAppBetaCode[] = [
        makeCode("game", { max_uses: 10, used_count: 3 }),
        makeCode("tool", { max_uses: 5, used_count: 5 }),
    ];

    it("按状态统计应用数", () => {
        const stats = computeAppStats(allApps, codes);
        expect(stats.total).toBe(4);
        expect(stats.published).toBe(1);
        expect(stats.beta).toBe(1);
        expect(stats.dev).toBe(1);
        expect(stats.hidden).toBe(1);
    });
    it("内测码额度聚合：已用 3+5=8，总额度 10+5=15", () => {
        const stats = computeAppStats(allApps, codes);
        expect(stats.betaUsed).toBe(8);
        expect(stats.betaMax).toBe(15);
        expect(stats.betaCodeCount).toBe(2);
    });
    it("无内测码时额度为 0", () => {
        const stats = computeAppStats(allApps, []);
        expect(stats.betaUsed).toBe(0);
        expect(stats.betaMax).toBe(0);
        expect(stats.betaCodeCount).toBe(0);
    });
    it("空应用列表统计全 0", () => {
        const stats = computeAppStats([], []);
        expect(stats.total).toBe(0);
        expect(stats.published + stats.beta + stats.dev + stats.hidden).toBe(0);
    });
    it("betaCodeRemaining 剩余名额计算不为负", () => {
        expect(betaCodeRemaining({ max_uses: 10, used_count: 3 })).toBe(7);
        expect(betaCodeRemaining({ max_uses: 5, used_count: 5 })).toBe(0);
        expect(betaCodeRemaining({ max_uses: 5, used_count: 9 })).toBe(0);
    });
});

// ---------- 内测码 list/delete/set 校验 ----------

describe("应用管理 - 内测码接口校验", () => {
    it("set_beta_code 缺少 app_id → 报错", () => {
        const r = validateBetaCodeInputV2("", "CODE");
        expect(r.valid).toBe(false);
        expect(r.error).toContain("应用");
    });
    it("set_beta_code 空内测码 → 报错", () => {
        const r = validateBetaCodeInputV2("game", "   ");
        expect(r.valid).toBe(false);
        expect(r.error).toContain("内测码");
    });
    it("set_beta_code 参数齐全 → 通过", () => {
        expect(validateBetaCodeInputV2("game", "BETA2024").valid).toBe(true);
    });
    it("一个 app 一条内测码：set 为 upsert，delete 为清除（审计动作清单覆盖）", () => {
        expect(APP_ADMIN_AUDIT_ACTIONS).toContain("set_beta_code");
        expect(APP_ADMIN_AUDIT_ACTIONS).toContain("delete_beta_code");
        // 列表查询是只读动作，不进审计清单
        expect(APP_ADMIN_AUDIT_ACTIONS).not.toContain("list_beta_codes");
        expect(APP_ADMIN_AUDIT_ACTIONS).not.toContain("manage_list");
    });
    it("清除内测码（delete_beta_code）小管理可对自己 app 操作", () => {
        expect(canManageApp(smallAdminCtx, "game")).toBe(true);
        expect(canManageApp(smallAdminCtx, "secret")).toBe(false);
    });
});

// ---------- 小管理分配 ----------

describe("应用管理 - 分配小管理校验", () => {
    it("参数齐全 → 通过", () => {
        expect(validateManagerAssign("game", "alice").valid).toBe(true);
    });
    it("缺少 app_id → 报错", () => {
        expect(validateManagerAssign("", "alice").valid).toBe(false);
    });
    it("缺少用户名 → 报错", () => {
        expect(validateManagerAssign("game", " ").valid).toBe(false);
    });
    it("分配动作需审计", () => {
        expect(APP_ADMIN_AUDIT_ACTIONS).toContain("add_app_manager");
        expect(APP_ADMIN_AUDIT_ACTIONS).toContain("remove_app_manager");
    });
    it("小管理无法自行分配管理员（仅 super_admin）", () => {
        expect(canAssignManagers(smallAdminCtx)).toBe(false);
    });
});

// ---------- 综合场景 ----------

describe("应用管理 - B 方案综合场景", () => {
    it("场景：超管分配小管理后，小管理登录只看到被分配的 app", () => {
        // 超管视角：4 个
        expect(filterAppsForAdmin(allApps, superAdminCtx)).toHaveLength(4);
        // 小管理视角：2 个
        const visible = filterAppsForAdmin(allApps, smallAdminCtx);
        expect(visible.map((a) => a.app_id).sort()).toEqual(["forum", "game"]);
    });

    it("场景：小管理尝试创建应用 → 拒绝（403 由路由层映射）", () => {
        expect(canCreateApp(smallAdminCtx)).toBe(false);
    });

    it("场景：小管理尝试删除自己被分配的应用 → 拒绝", () => {
        expect(canDeleteApp(smallAdminCtx)).toBe(false);
    });

    it("场景：小管理编辑自己 app 的状态（上架）→ 允许且字段在白名单", () => {
        expect(canManageApp(smallAdminCtx, "game")).toBe(true);
        const out = sanitizeUpdatePayload(smallAdminCtx, { id: "id-game", status: "published" });
        expect(out.status).toBe("published");
    });

    it("场景：小管理尝试通过 update 篡改 app_id → 字段被剥离", () => {
        const out = sanitizeUpdatePayload(smallAdminCtx, {
            id: "id-game",
            name: "合法字段",
            app_id: "forged",
        });
        expect(out.name).toBe("合法字段");
        expect(out.app_id).toBeUndefined();
    });

    it("场景：小管理批量上架 [game, secret] → secret 越权被拒，整体 fail-closed", () => {
        const r = checkBatchStatusUpdate(smallAdminCtx, ["game", "secret"]);
        expect(r.ok).toBe(false);
        expect(r.deniedAppIds).toEqual(["secret"]);
    });

    it("场景：大管理批量删除 → 放行；小管理批量删除 → 拒绝", () => {
        expect(checkBatchDelete(bigAdminCtx, ["forum", "game"]).ok).toBe(true);
        const r = checkBatchDelete(smallAdminCtx, ["forum", "game"]);
        expect(r.ok).toBe(false);
        expect(r.deniedAppIds).toContain("forum");
        expect(r.deniedAppIds).toContain("game");
    });

    it("场景：超管移除小管理分配后，小管理立即失去该 app 权限", () => {
        const before = canManageApp(smallAdminCtx, "game");
        expect(before).toBe(true);
        const revokedCtx = makeCtx({ ...smallAdminCtx, managedAppIds: ["forum"] });
        expect(canManageApp(revokedCtx, "game")).toBe(false);
        expect(canManageApp(revokedCtx, "forum")).toBe(true);
    });

    it("场景：普通 admin 被超管授予 app_manage 后升级为大管理", () => {
        const promoted = makeCtx({ ...plainAdminCtx, permissions: ["user_review", "app_manage"] });
        expect(isBigManager(promoted)).toBe(true);
        expect(filterAppsForAdmin(allApps, promoted)).toHaveLength(4);
        expect(canCreateApp(promoted)).toBe(true);
    });

    it("场景：所有写操作动作都在审计清单中", () => {
        for (const action of [
            "create_app", "update_app", "delete_app", "set_beta_code", "delete_beta_code",
            "reorder_apps", "batch_update_status", "batch_delete_apps",
            "add_app_manager", "remove_app_manager",
        ]) {
            expect(APP_ADMIN_AUDIT_ACTIONS).toContain(action);
        }
        expect(APP_ADMIN_AUDIT_ACTIONS).toHaveLength(10);
    });
});
