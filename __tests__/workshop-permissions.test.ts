/**
 * 迷你小作坊（开团平台）权限与业务规则测试
 *
 * 覆盖 src/lib/workshop.ts 全部纯函数：
 *   1. 商品编号格式化 / 序列生成
 *   2. 角色判定（管理员）
 *   3. 团长档案有效性（active / 过期）
 *   4. 团有效期（未开始 / 进行中 / 已结束 / 停用）
 *   5. 商品可见性（offline/pending/active/gray × 游客/用户/团长/管理员 × 团有效期 × listedUntil）
 *   6. 提交商品权限（仅团长/管理员）
 *   7. 提交初始状态（团长→pending，管理员→active）
 *   8. 商品编号可见性
 *   9. 商品修改权限（管理员任意 / 团长仅自己的）
 *  10. 状态流转合法性
 *  11. 团分配上限（每团长最多 2 个团、重复分配拦截）
 *  12. 「想要」toggle 语义与计数
 *  13. 轮播配置规整（0-5 范围、去重、截断）
 *
 * 运行：npx vitest run __tests__/workshop-permissions.test.ts
 */

import { describe, it, expect } from "vitest";
import {
    wsFormatCode,
    wsNextProductCode,
    wsIsAdminRole,
    wsLeaderIsActive,
    wsGroupIsActive,
    wsCanViewProduct,
    wsCanSubmitProduct,
    wsInitialProductStatus,
    wsCanSeeProductCodes,
    wsCanAdminister,
    wsCanModifyProduct,
    wsIsValidStatusTransition,
    wsValidateLeaderGroupAssign,
    wsCanAddGroupToLeader,
    wsToggleWant,
    wsWantCountAfter,
    wsNormalizeCarouselConfig,
    WS_PRODUCT_CODE_START,
    WS_MAX_GROUPS_PER_LEADER,
    type WSProduct,
    type WSGroup,
    type WSLeader,
    type WSUserContext,
} from "../src/lib/workshop";

// 固定「当前时间」，保证时间相关用例确定性
const NOW = 1_000_000_000_000; // 固定基准时间
const HOUR = 3600 * 1000;

// ===================== 测试夹具构造 =====================

function makeUser(over: Partial<WSUserContext> = {}): WSUserContext {
    return { id: "u-1", name: "alice", role: "user", isAdmin: false, ...over };
}

function makeLeader(over: Partial<WSLeader> = {}): WSLeader {
    return {
        userId: "u-leader",
        userName: "leader1",
        groupIds: ["g-1"],
        expiresAt: null,
        active: true,
        ...over,
    };
}

function makeGroup(over: Partial<WSGroup> = {}): WSGroup {
    return {
        id: "g-1",
        name: "九月团",
        leaderUid: "u-leader",
        leaderUser: "leader1",
        startAt: NOW - HOUR,
        endAt: NOW + HOUR,
        maxProducts: 5,
        active: true,
        ...over,
    };
}

function makeProduct(over: Partial<WSProduct> = {}): WSProduct {
    return {
        id: "p-1",
        codeNum: 10001,
        code: "WS-10001",
        name: "10cm棉花娃娃",
        desc: "",
        image: "",
        contactImage: "",
        price: "99",
        groupId: "g-1",
        category: "娃娃",
        subCategory: "10cm娃",
        hasQuestion: false,
        question: "",
        answer: "",
        status: "active",
        wantCount: 0,
        leaderUid: "u-leader",
        leaderUser: "leader1",
        listedUntil: null,
        createdAt: NOW - HOUR,
        ...over,
    };
}

// ===================== 1. 商品编号 =====================

describe("商品编号格式化与序列", () => {
    it("起始编号格式为 WS-10001", () => {
        expect(wsFormatCode(WS_PRODUCT_CODE_START)).toBe("WS-10001");
    });

    it("编号不足 5 位前补零", () => {
        expect(wsFormatCode(1)).toBe("WS-00001");
    });

    it("编号超过 5 位直接显示", () => {
        expect(wsFormatCode(100001)).toBe("WS-100001");
    });

    it("空表时下一个编号 = 起始值", () => {
        expect(wsNextProductCode([])).toBe(WS_PRODUCT_CODE_START);
    });

    it("已有编号取最大值 + 1", () => {
        expect(wsNextProductCode([10001, 10005, 10003])).toBe(10006);
    });

    it("跳过非数字脏数据", () => {
        expect(wsNextProductCode([10001, NaN, 10002] as number[])).toBe(10003);
    });
});

// ===================== 2. 角色判定 =====================

describe("管理员角色判定", () => {
    it("admin / super_admin 为管理员", () => {
        expect(wsIsAdminRole("admin")).toBe(true);
        expect(wsIsAdminRole("super_admin")).toBe(true);
    });

    it("普通用户 / 空值不是管理员", () => {
        expect(wsIsAdminRole("user")).toBe(false);
        expect(wsIsAdminRole(null)).toBe(false);
        expect(wsIsAdminRole(undefined)).toBe(false);
        expect(wsIsAdminRole("")).toBe(false);
    });
});

// ===================== 3. 团长档案 =====================

describe("团长档案有效性", () => {
    it("active 且无过期时间 → 有效", () => {
        expect(wsLeaderIsActive(makeLeader(), NOW)).toBe(true);
    });

    it("expiresAt 在未来 → 有效", () => {
        expect(wsLeaderIsActive(makeLeader({ expiresAt: NOW + HOUR }), NOW)).toBe(true);
    });

    it("expiresAt 已过 → 无效", () => {
        expect(wsLeaderIsActive(makeLeader({ expiresAt: NOW - HOUR }), NOW)).toBe(false);
    });

    it("active=false → 无效（即使未过期）", () => {
        expect(
            wsLeaderIsActive(makeLeader({ active: false, expiresAt: NOW + HOUR }), NOW)
        ).toBe(false);
    });

    it("null / undefined → 无效", () => {
        expect(wsLeaderIsActive(null, NOW)).toBe(false);
        expect(wsLeaderIsActive(undefined, NOW)).toBe(false);
    });
});

// ===================== 4. 团有效期 =====================

describe("团有效期", () => {
    it("进行中（startAt 前、endAt 后之间）→ 有效", () => {
        expect(wsGroupIsActive(makeGroup(), NOW)).toBe(true);
    });

    it("未到 startAt → 无效", () => {
        expect(wsGroupIsActive(makeGroup({ startAt: NOW + HOUR }), NOW)).toBe(false);
    });

    it("超过 endAt → 无效", () => {
        expect(wsGroupIsActive(makeGroup({ endAt: NOW - HOUR }), NOW)).toBe(false);
    });

    it("active=false → 无效", () => {
        expect(wsGroupIsActive(makeGroup({ active: false }), NOW)).toBe(false);
    });

    it("无时间限制且 active → 有效", () => {
        expect(wsGroupIsActive(makeGroup({ startAt: null, endAt: null }), NOW)).toBe(true);
    });

    it("null/undefined → 无效", () => {
        expect(wsGroupIsActive(null, NOW)).toBe(false);
        expect(wsGroupIsActive(undefined, NOW)).toBe(false);
    });
});

// ===================== 5. 商品可见性 =====================

describe("商品浏览可见性 wsCanViewProduct", () => {
    const groups = [makeGroup()];

    it("offline 商品：所有人不可见（含管理员）", () => {
        const p = makeProduct({ status: "offline" });
        const admin = makeUser({ id: "u-admin", role: "super_admin", isAdmin: true });
        expect(wsCanViewProduct(p, groups, null, NOW)).toBe(false);
        expect(wsCanViewProduct(p, groups, admin, NOW)).toBe(false);
    });

    it("active 商品：普通用户可见", () => {
        const p = makeProduct({ status: "active" });
        expect(wsCanViewProduct(p, groups, makeUser(), NOW)).toBe(true);
    });

    it("gray 商品：普通用户可见（置灰展示）", () => {
        const p = makeProduct({ status: "gray" });
        expect(wsCanViewProduct(p, groups, makeUser(), NOW)).toBe(true);
    });

    it("pending 商品：游客不可见", () => {
        const p = makeProduct({ status: "pending" });
        expect(wsCanViewProduct(p, groups, null, NOW)).toBe(false);
    });

    it("pending 商品：普通用户（非提交者）不可见", () => {
        const p = makeProduct({ status: "pending", leaderUid: "u-leader" });
        expect(wsCanViewProduct(p, groups, makeUser({ id: "u-other" }), NOW)).toBe(false);
    });

    it("pending 商品：提交团长本人可见", () => {
        const p = makeProduct({ status: "pending", leaderUid: "u-leader" });
        const leaderUser = makeUser({ id: "u-leader" });
        expect(wsCanViewProduct(p, groups, leaderUser, NOW)).toBe(true);
    });

    it("pending 商品：管理员可见", () => {
        const p = makeProduct({ status: "pending", leaderUid: "u-leader" });
        const admin = makeUser({ id: "u-admin", role: "admin", isAdmin: true });
        expect(wsCanViewProduct(p, groups, admin, NOW)).toBe(true);
    });

    it("active 商品但团不存在 → 不可见", () => {
        const p = makeProduct({ groupId: "g-not-exist" });
        expect(wsCanViewProduct(p, groups, makeUser(), NOW)).toBe(false);
    });

    it("active 商品但团已结束 → 不可见", () => {
        const p = makeProduct();
        const endedGroups = [makeGroup({ endAt: NOW - HOUR })];
        expect(wsCanViewProduct(p, endedGroups, makeUser(), NOW)).toBe(false);
    });

    it("active 商品但团未开始 → 不可见", () => {
        const p = makeProduct();
        const futureGroups = [makeGroup({ startAt: NOW + HOUR })];
        expect(wsCanViewProduct(p, futureGroups, makeUser(), NOW)).toBe(false);
    });

    it("超过 listedUntil → 不可见", () => {
        const p = makeProduct({ listedUntil: NOW - HOUR });
        expect(wsCanViewProduct(p, groups, makeUser(), NOW)).toBe(false);
    });

    it("listedUntil 在未来 → 可见", () => {
        const p = makeProduct({ listedUntil: NOW + HOUR });
        expect(wsCanViewProduct(p, groups, makeUser(), NOW)).toBe(true);
    });

    it("pending 商品：提交者本人但团已失效 → 不可见", () => {
        const p = makeProduct({ status: "pending", leaderUid: "u-leader" });
        const endedGroups = [makeGroup({ endAt: NOW - HOUR })];
        const leaderUser = makeUser({ id: "u-leader" });
        expect(wsCanViewProduct(p, endedGroups, leaderUser, NOW)).toBe(false);
    });
});

// ===================== 6. 提交商品权限 =====================

describe("提交商品权限 wsCanSubmitProduct", () => {
    it("游客不能提交", () => {
        expect(wsCanSubmitProduct(null, makeLeader(), NOW)).toBe(false);
    });

    it("普通用户（非团长）不能提交", () => {
        expect(wsCanSubmitProduct(makeUser(), null, NOW)).toBe(false);
    });

    it("有效团长可以提交", () => {
        const leader = makeLeader({ userId: "u-leader" });
        const user = makeUser({ id: "u-leader" });
        expect(wsCanSubmitProduct(user, leader, NOW)).toBe(true);
    });

    it("档案过期的团长不能提交", () => {
        const leader = makeLeader({ expiresAt: NOW - HOUR });
        const user = makeUser({ id: "u-leader" });
        expect(wsCanSubmitProduct(user, leader, NOW)).toBe(false);
    });

    it("管理员无需团长档案即可提交", () => {
        const admin = makeUser({ role: "admin", isAdmin: true });
        expect(wsCanSubmitProduct(admin, null, NOW)).toBe(true);
    });
});

// ===================== 7. 初始状态 =====================

describe("商品提交初始状态", () => {
    it("团长提交 → pending 待审核", () => {
        const leader = makeUser({ id: "u-leader" });
        expect(wsInitialProductStatus(leader)).toBe("pending");
    });

    it("管理员提交 → active 直接上架", () => {
        const admin = makeUser({ role: "super_admin", isAdmin: true });
        expect(wsInitialProductStatus(admin)).toBe("active");
    });

    it("游客 → pending（防御性默认）", () => {
        expect(wsInitialProductStatus(null)).toBe("pending");
    });
});

// ===================== 8. 编号可见性 =====================

describe("商品编号可见性", () => {
    it("游客不可见编号", () => {
        expect(wsCanSeeProductCodes(null, makeLeader(), NOW)).toBe(false);
    });

    it("普通用户不可见编号", () => {
        expect(wsCanSeeProductCodes(makeUser(), null, NOW)).toBe(false);
    });

    it("有效团长可见编号", () => {
        const user = makeUser({ id: "u-leader" });
        expect(wsCanSeeProductCodes(user, makeLeader(), NOW)).toBe(true);
    });

    it("过期团长不可见编号", () => {
        const user = makeUser({ id: "u-leader" });
        const leader = makeLeader({ expiresAt: NOW - HOUR });
        expect(wsCanSeeProductCodes(user, leader, NOW)).toBe(false);
    });

    it("管理员可见编号", () => {
        const admin = makeUser({ role: "admin", isAdmin: true });
        expect(wsCanSeeProductCodes(admin, null, NOW)).toBe(true);
    });
});

// ===================== 9. 管理员操作权限 =====================

describe("管理操作权限 wsCanAdminister", () => {
    it("仅管理员可管理", () => {
        expect(wsCanAdminister(null)).toBe(false);
        expect(wsCanAdminister(makeUser())).toBe(false);
        expect(wsCanAdminister(makeUser({ role: "admin", isAdmin: true }))).toBe(true);
        expect(wsCanAdminister(makeUser({ role: "super_admin", isAdmin: true }))).toBe(true);
    });
});

// ===================== 10. 商品修改权限 =====================

describe("商品修改权限 wsCanModifyProduct", () => {
    it("游客不能修改", () => {
        expect(wsCanModifyProduct(makeProduct(), null, NOW)).toBe(false);
    });

    it("团长只能修改自己提交的商品", () => {
        const p = makeProduct({ leaderUid: "u-leader" });
        const owner = makeUser({ id: "u-leader" });
        const other = makeUser({ id: "u-other" });
        expect(wsCanModifyProduct(p, owner, NOW)).toBe(true);
        expect(wsCanModifyProduct(p, other, NOW)).toBe(false);
    });

    it("管理员可修改任意商品", () => {
        const p = makeProduct({ leaderUid: "u-leader" });
        const admin = makeUser({ id: "u-admin", role: "admin", isAdmin: true });
        expect(wsCanModifyProduct(p, admin, NOW)).toBe(true);
    });

    it("商品无 leaderUid 时非管理员不可修改", () => {
        const p = makeProduct({ leaderUid: "" });
        expect(wsCanModifyProduct(p, makeUser({ id: "u-leader" }), NOW)).toBe(false);
    });
});

// ===================== 11. 状态流转 =====================

describe("商品状态合法性", () => {
    it("四种合法状态", () => {
        for (const s of ["pending", "active", "gray", "offline"]) {
            expect(wsIsValidStatusTransition(s)).toBe(true);
        }
    });

    it("非法状态被拒", () => {
        expect(wsIsValidStatusTransition("deleted")).toBe(false);
        expect(wsIsValidStatusTransition("")).toBe(false);
        expect(wsIsValidStatusTransition("PUBLISHED")).toBe(false);
    });
});

// ===================== 12. 团分配上限 =====================

describe("团长团分配校验", () => {
    it("空列表可分配新团", () => {
        expect(wsValidateLeaderGroupAssign([], "g-new")).toBeNull();
    });

    it("已有 1 个团可再分配 1 个（上限 2）", () => {
        expect(wsValidateLeaderGroupAssign(["g-1"], "g-2")).toBeNull();
    });

    it("已有 2 个团不能再分配", () => {
        const err = wsValidateLeaderGroupAssign(["g-1", "g-2"], "g-3");
        expect(err).toContain(String(WS_MAX_GROUPS_PER_LEADER));
    });

    it("重复分配同一团被拦截", () => {
        const err = wsValidateLeaderGroupAssign(["g-1"], "g-1");
        expect(err).toContain("已分配");
    });

    it("wsCanAddGroupToLeader 与上限一致", () => {
        expect(wsCanAddGroupToLeader([])).toBe(true);
        expect(wsCanAddGroupToLeader(["g-1"])).toBe(true);
        expect(wsCanAddGroupToLeader(["g-1", "g-2"])).toBe(false);
    });

    it("脏数据（null/undefined）按空列表处理", () => {
        expect(wsCanAddGroupToLeader(null as unknown as string[])).toBe(true);
    });
});

// ===================== 13. 想要 toggle =====================

describe("「想要」toggle 语义", () => {
    it("未想要 → 想要", () => {
        expect(wsToggleWant(false)).toBe(true);
    });

    it("已想要 → 取消", () => {
        expect(wsToggleWant(true)).toBe(false);
    });

    it("想要时计数 +1", () => {
        expect(wsWantCountAfter(3, false)).toBe(4);
    });

    it("取消时计数 -1", () => {
        expect(wsWantCountAfter(3, true)).toBe(2);
    });

    it("取消时计数不会变成负数", () => {
        expect(wsWantCountAfter(0, true)).toBe(0);
    });
});

// ===================== 14. 轮播配置规整 =====================

describe("轮播配置规整 wsNormalizeCarouselConfig", () => {
    it("customCount 限制在 0~5", () => {
        expect(wsNormalizeCarouselConfig({ customCount: -3 }).customCount).toBe(0);
        expect(wsNormalizeCarouselConfig({ customCount: 99 }).customCount).toBe(5);
    });

    it("customCount 四舍五入", () => {
        expect(wsNormalizeCarouselConfig({ customCount: 2.6 }).customCount).toBe(3);
    });

    it("customIds 去重", () => {
        const cfg = wsNormalizeCarouselConfig({
            customCount: 5,
            customIds: ["p1", "p1", "p2"],
        });
        expect(cfg.customIds).toEqual(["p1", "p2"]);
    });

    it("customIds 截断到 customCount", () => {
        const cfg = wsNormalizeCarouselConfig({
            customCount: 2,
            customIds: ["p1", "p2", "p3", "p4"],
        });
        expect(cfg.customIds).toEqual(["p1", "p2"]);
    });

    it("空值/非法 banners 兜底为空对象", () => {
        expect(wsNormalizeCarouselConfig({}).banners).toEqual({});
        expect(wsNormalizeCarouselConfig({ banners: null as unknown as Record<string, string> }).banners).toEqual({});
    });

    it("过滤空 id", () => {
        const cfg = wsNormalizeCarouselConfig({
            customCount: 5,
            customIds: ["", "p1", null as unknown as string],
        });
        expect(cfg.customIds).toEqual(["p1"]);
    });
});
