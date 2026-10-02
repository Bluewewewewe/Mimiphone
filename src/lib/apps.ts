export type AppStatus = "hidden" | "dev" | "beta" | "published";

export interface StoreAppItem {
    id: string;
    app_id: string;
    name: string;
    icon: string;
    developer: string;
    category: string;
    description: string;
    features: string[];
    screenshots: string[];
    version: string;
    status: AppStatus;
    updated_at: string;
    expected_release?: string | null;
    beta_info?: string;
    beta_wipe: boolean;
    beta_slots: number;
    beta_used_slots: number;
    route: string;
    order: number;
    is_external: boolean;
}

export interface StoreAppBetaCode {
    id: string;
    app_id: string;
    code: string;
    max_uses: number;
    used_count: number;
    created_by?: string;
    created_at: string;
}

export const APP_STATUS_LABEL: Record<AppStatus, string> = {
    hidden: "隐藏",
    dev: "开发中",
    beta: "内测中",
    published: "已上架"
};

export const APP_STATUS_COLOR: Record<AppStatus, string> = {
    hidden: "#6b7280",
    dev: "#eab308",
    beta: "#f59e0b",
    published: "#22c55e"
};

export function getDefaultApps(): StoreAppItem[] {
    return [
        {
            id: "app_chat",
            app_id: "chat",
            name: "家庭群",
            icon: "💬",
            developer: "米米宇宙",
            category: "社交",
            description: "家庭群聊，随时随地和家人保持联系。",
            features: ["即时消息", "表情互动", "家庭动态"],
            screenshots: [],
            version: "1.0.0",
            status: "published",
            updated_at: new Date().toISOString(),
            beta_wipe: false,
            beta_slots: 0,
            beta_used_slots: 0,
            route: "chat",
            order: 1,
            is_external: false
        },
        {
            id: "app_forum",
            app_id: "forum",
            name: "米米论坛",
            icon: "📱",
            developer: "米米宇宙",
            category: "社区",
            description: "兴趣社区，分享生活点滴。",
            features: ["发帖讨论", "板块分类", "点赞回复"],
            screenshots: [],
            version: "1.0.0",
            status: "published",
            updated_at: new Date().toISOString(),
            beta_wipe: false,
            beta_slots: 0,
            beta_used_slots: 0,
            route: "forum",
            order: 2,
            is_external: false
        },
        {
            id: "app_pickup",
            app_id: "pickup",
            name: "米米请就位",
            icon: "🎭",
            developer: "米米宇宙",
            category: "社区",
            description: "演绎广场——发帖开楼，演绎角色，沉浸式剧情。",
            features: ["角色演绎", "剧情楼层", "身份锁定", "热度排序"],
            screenshots: [],
            version: "1.0.0",
            status: "published",
            updated_at: new Date().toISOString(),
            beta_wipe: false,
            beta_slots: 0,
            beta_used_slots: 0,
            route: "pickup",
            order: 4,
            is_external: false
        },
        {
            id: "app_game",
            app_id: "game",
            name: "小游戏",
            icon: "🎮",
            developer: "米米宇宙",
            category: "娱乐",
            description: "轻松休闲小游戏合集。",
            features: ["即开即玩", "排行榜", "成就系统"],
            screenshots: [],
            version: "0.9.0",
            status: "dev",
            updated_at: new Date().toISOString(),
            beta_wipe: false,
            beta_slots: 0,
            beta_used_slots: 0,
            route: "game",
            order: 3,
            is_external: false
        }
    ];
}
