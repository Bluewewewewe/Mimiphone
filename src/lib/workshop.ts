/**
 * 迷你小作坊（开团平台）业务逻辑层
 *
 * 本文件只包含纯函数与类型定义，不依赖 NextRequest / Supabase，
 * 供 API 路由与单元测试（__tests__/workshop-permissions.test.ts）共用。
 */

// ===================== 常量 =====================

export const WS_PRODUCT_CODE_START = 10001;
export const WS_CAROUSEL_MAX = 5;
export const WS_MAX_GROUPS_PER_LEADER = 2;

export type WSProductStatus = "pending" | "active" | "gray" | "offline";
export const WS_PRODUCT_STATUSES: WSProductStatus[] = ["pending", "active", "gray", "offline"];

export type WSApplicationStatus = "pending" | "approved" | "rejected";

// ===================== 类型 =====================

export interface WSGroup {
    id: string;
    name: string;
    // 与 API 行映射 (_lib.ts wsMapGroup) 及前端 wsData.groups 对齐
    leaderUid: string; // 团长 userId（可能为空串）
    leaderUser: string; // 团长用户名
    startAt: number | null; // epoch ms
    endAt: number | null;
    maxProducts: number;
    active: boolean;
}

export interface WSLeader {
    userId: string;
    userName: string;
    groupIds: string[];
    expiresAt: number | null; // epoch ms
    active: boolean;
}

export interface WSProduct {
    id: string;
    codeNum: number;
    code: string;
    name: string;
    desc: string;
    image: string;
    contactImage: string;
    price: string;
    groupId: string | null;
    category: string; // 大类
    subCategory: string; // 小类
    hasQuestion: boolean;
    question: string;
    answer: string;
    status: WSProductStatus;
    wantCount: number;
    leaderUid: string | null;
    leaderUser: string;
    listedUntil: number | null;
    createdAt: number | null;
}

export interface WSApplication {
    id: string;
    userId: string;
    user: string;
    note: string;
    status: WSApplicationStatus;
    ts: number;
}

export interface WSCategory {
    id: string;
    name: string;
    subs: string[];
}

export interface WSCarouselConfig {
    customCount: number;
    customIds: string[];
    banners: Record<string, string>;
}

export interface WSUserContext {
    id: string; // users.id (UUID)
    name: string; // username
    role: string; // 'user' | 'admin' | 'super_admin'
    isAdmin: boolean;
}

// ===================== 纯函数 =====================

/** 商品编号格式化：10001 -> "WS-10001" */
export function wsFormatCode(num: number): string {
    return "WS-" + String(num).padStart(5, "0");
}

/**
 * 下一个商品编号。
 * 生产环境由 Postgres SEQUENCE（workshop_product_code_seq）原子分配；
 * 此函数用于兜底/测试：取已有最大编号 + 1
 */
export function wsNextProductCode(existingCodeNums: number[]): number {
    let max = WS_PRODUCT_CODE_START - 1;
    for (const n of existingCodeNums) {
        if (typeof n === "number" && n > max) max = n;
    }
    return max + 1;
}

/** 是否为管理员角色 */
export function wsIsAdminRole(role: string | null | undefined): boolean {
    return role === "admin" || role === "super_admin";
}

/** 团长档案是否有效（存在、active、未过期） */
export function wsLeaderIsActive(leader: WSLeader | null | undefined, now: number = Date.now()): boolean {
    if (!leader || leader.active === false) return false;
    if (leader.expiresAt && now > leader.expiresAt) return false;
    return true;
}

/**
 * 团当前是否处于有效期且启用
 * - active=false → 无效
 * - 未到 startAt → 无效
 * - 超过 endAt → 无效
 */
export function wsGroupIsActive(group: WSGroup | null | undefined, now: number = Date.now()): boolean {
    if (!group || group.active === false) return false;
    if (group.startAt && now < group.startAt) return false;
    if (group.endAt && now > group.endAt) return false;
    return true;
}

/**
 * 商品在「浏览网格」中是否对某用户可见。
 *
 * 规则（见需求）：
 * - offline：所有人不可见
 * - pending：仅管理员与提交团长本人可见
 * - active / gray：可见（gray 置灰展示）
 * - 团不存在 / 团停用 / 团未开始 / 团已结束：不可见
 * - 超过商品 listedUntil：不可见
 */
export function wsCanViewProduct(
    product: WSProduct,
    groups: WSGroup[],
    user: WSUserContext | null,
    now: number = Date.now()
): boolean {
    if (product.status === "offline") return false;

    if (product.status === "pending") {
        if (!user) return false;
        if (user.isAdmin) return true;
        if (product.leaderUid && product.leaderUid === user.id) {
            // 提交者本人：也要求团有效，避免展示到无效团
        } else {
            return false;
        }
    }

    const group = groups.find((g) => g.id === product.groupId) || null;
    if (!wsGroupIsActive(group, now)) return false;

    if (product.listedUntil && now > product.listedUntil) return false;

    return true;
}

/**
 * 权限：谁能提交商品（团长或管理员）
 */
export function wsCanSubmitProduct(
    user: WSUserContext | null,
    leader: WSLeader | null | undefined,
    now: number = Date.now()
): boolean {
    if (!user) return false;
    if (user.isAdmin) return true;
    return wsLeaderIsActive(leader, now);
}

/**
 * 团长提交的商品初始状态：
 * - 管理员直接上架 → active
 * - 团长提交 → pending（待审核）
 */
export function wsInitialProductStatus(user: WSUserContext | null): WSProductStatus {
    return user?.isAdmin ? "active" : "pending";
}

/**
 * 商品编号可见性：管理员与团长可见（团长看自己商品编号，
 * 网格/详情中管理员可看全部——前端对非自己商品隐藏编号由 UI 层处理，
 * 这里给出「是否有资格看到编号」的总开关）
 */
export function wsCanSeeProductCodes(
    user: WSUserContext | null,
    leader: WSLeader | null | undefined,
    now: number = Date.now()
): boolean {
    if (!user) return false;
    if (user.isAdmin) return true;
    return wsLeaderIsActive(leader, now);
}

/**
 * 管理员操作权限（审核申请/商品、上下架、建团、分类、轮播等全部管理动作）
 */
export function wsCanAdminister(user: WSUserContext | null): boolean {
    return !!user?.isAdmin;
}

/**
 * 团长编辑/操作自己商品的权限：
 * - 管理员：任意商品
 * - 团长：仅自己提交的商品
 */
export function wsCanModifyProduct(
    product: WSProduct,
    user: WSUserContext | null,
    now: number = Date.now()
): boolean {
    if (!user) return false;
    if (user.isAdmin) return true;
    return !!product.leaderUid && product.leaderUid === user.id;
}

/** 管理员审核商品允许设置的状态 */
export function wsIsValidStatusTransition(target: string): target is WSProductStatus {
    return (WS_PRODUCT_STATUSES as string[]).includes(target);
}

/**
 * 给团长分配团时的校验：一个团长最多 WS_MAX_GROUPS_PER_LEADER 个团。
 * 返回错误信息，null 表示通过。
 */
export function wsValidateLeaderGroupAssign(
    currentGroupIds: string[],
    newGroupId: string
): string | null {
    const set = new Set(currentGroupIds || []);
    if (set.has(newGroupId)) return "该团已分配给此团长";
    if (set.size >= WS_MAX_GROUPS_PER_LEADER) {
        return `每个团长最多 ${WS_MAX_GROUPS_PER_LEADER} 个团`;
    }
    return null;
}

/** 创建团时校验团长团数量（同上规则，供建团入口复用） */
export function wsCanAddGroupToLeader(currentGroupIds: string[]): boolean {
    return new Set(currentGroupIds || []).size < WS_MAX_GROUPS_PER_LEADER;
}

/**
 * 想要 toggle：已想要 → 取消（false）；未想要 → 添加（true）
 */
export function wsToggleWant(currentlyWanted: boolean): boolean {
    return !currentlyWanted;
}

/** toggle 后的想要总数 */
export function wsWantCountAfter(currentWantCount: number, wantedBefore: boolean): number {
    return wantedBefore ? Math.max(0, currentWantCount - 1) : currentWantCount + 1;
}

/**
 * 轮播配置规整（与前端 wsEnsureCarouselConfig 对齐）：
 * - customCount 限制在 0~5
 * - customIds 去重、截断到 customCount
 */
export function wsNormalizeCarouselConfig(cfg: Partial<WSCarouselConfig>): WSCarouselConfig {
    let customCount = typeof cfg.customCount === "number" ? Math.round(cfg.customCount) : 0;
    customCount = Math.max(0, Math.min(WS_CAROUSEL_MAX, customCount));
    const customIds = (cfg.customIds || [])
        .filter((id, i, arr) => !!id && arr.indexOf(id) === i)
        .slice(0, customCount);
    const banners = cfg.banners && typeof cfg.banners === "object" ? cfg.banners : {};
    return { customCount, customIds, banners };
}
