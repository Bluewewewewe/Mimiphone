"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { UnlockState, DEFAULT_UNLOCK_STATE, IDENTITY_QUESTIONS } from "@/lib/unlock-config";
import { DEBUG_ENABLED, DEBUG_LEVELS, parseDebugParams, applyDebugLevel } from "@/lib/debug-config";
import { loadChatMemory, getMemoryContext, getRecentMemories, addMemoryBatch } from "@/lib/chat-memory";
import { getPublicMemories, submitPromotionCandidate } from "@/lib/public-memory";
import { refreshWeiboData, generateSimComments, rollEasterEgg, getSuperTopicData } from "@/lib/weibo-simulator";
import { needsRefresh as needsNewsRefresh, getLastUpdateDescription } from "@/lib/news-fetcher";

import {
    addToCart,
    removeFromCart,
    clearCart,
    getCartTotal,
    getHotProducts,
    getProductsByCategory,
    triggerCPAutoShop,
    getRandomOnlineMembers,
    generateBrowseComments,
    INITIAL_PRODUCTS,
    INITIAL_MEMBERS,
    INITIAL_ORDERS,
} from "@/lib/shopping";

import type {
    ShopProduct,
    CartItem,
    ShopMember,
    ShopOrder,
    BrowseComment,
    ProductCategory,
} from "@/lib/shopping";

import {
    checkUnlock,
    buildIdentityContext,
    LOCKED_AVAILABLE_APPS,
    UNLOCK_ONLY_APPS,
    isAdminPassword,
    SECRET_NAMES,
    DEFAULT_NAMES,
} from "@/lib/unlock-config";

import { ForumApp } from "@/components/forum-app";
import { AdminApp } from "@/components/admin-app";
import { InviteApp } from "@/components/invite-app";
import UserProfileApp from "@/components/user-profile-app";
import { AdminReviewApp } from "@/components/admin-review-app";
import AppStoreApp from "@/components/app-store-app";
import AppAdminApp from "@/components/admin/app-admin-app";
import AdminDashboard from "@/components/admin-dashboard";
import type { StoreAppItem } from "@/lib/apps";


interface Message {
    from: "me" | "dad" | "mom" | "system";
    text: string;
    id: number;
}

interface WBSection {
    id: string;
    icon: string;
    title: string;
    subtitle: string;
    color: string;
    content: string;
}

function WorldBookApp({ onClose }: { onClose?: () => void }) {
    const [sections, setSections] = useState<WBSection[]>([]);
    const [expanded, setExpanded] = useState<string | null>(null);
    const [tab, setTab] = useState<"characters" | "rules">("characters");

    useEffect(() => {
        fetch("/api/world-book").then(r => r.json()).then(data => setSections(data.sections || [])).catch(() => {});
    }, []);

    const characterSections = sections.filter(s => ["dad", "mom", "cp"].includes(s.id));
    const ruleSections = sections.filter(s => !["dad", "mom", "cp"].includes(s.id));

    const formatContent = (text: string) => {
        return text.split("\n").map((line, i) => {
            if (line.startsWith("【") || line.startsWith("|")) {
                return (
                    <div
                        key={i}
                        style={{
                            fontWeight: 600,
                            marginTop: 8,
                            marginBottom: 2,
                            fontSize: 11,
                            color: "#92400e"
                        }}>{line}</div>
                );
            }

            if (line.startsWith("•")) {
                return (
                    <div
                        key={i}
                        style={{
                            paddingLeft: 12,
                            fontSize: 11,
                            lineHeight: "18px",
                            color: "#78350f"
                        }}>{line}</div>
                );
            }

            if (line.startsWith("-")) {
                return (
                    <div
                        key={i}
                        style={{
                            paddingLeft: 12,
                            fontSize: 11,
                            lineHeight: "18px",
                            color: "#78350f"
                        }}>{line}</div>
                );
            }

            if (line.match(/^\d+\./)) {
                return (
                    <div
                        key={i}
                        style={{
                            paddingLeft: 12,
                            fontSize: 11,
                            lineHeight: "18px",
                            color: "#78350f"
                        }}>{line}</div>
                );
            }

            if (line.trim() === "") return (
                <div
                    key={i}
                    style={{
                        height: 4
                    }} />
            );

            return (
                <div
                    key={i}
                    style={{
                        fontSize: 11,
                        lineHeight: "18px",
                        color: "#78350f"
                    }}>{line}</div>
            );
        });
    };

    return (
        <div
            style={{
                height: "100%",
                display: "flex",
                flexDirection: "column",
                background: "linear-gradient(180deg, #fef9ee 0%, #fef3c7 100%)"
            }}>
            {}
            <div
                style={{
                    padding: "14px 16px 8px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexShrink: 0,
                    position: "relative"
                }}>
                {onClose && <button
                    onClick={onClose}
                    style={{
                        position: "absolute",
                        left: "16px",
                        top: "50%",
                        transform: "translateY(-50%)",
                        background: "none",
                        border: "none",
                        fontSize: "20px",
                        color: "#78350f",
                        cursor: "pointer",
                        padding: "8px"
                    }}>←
                              </button>}
                <span
                    style={{
                        fontSize: 17,
                        fontWeight: 700,
                        color: "#78350f",
                        margin: "0 auto"
                    }}>📖 世界书</span>
                <span
                    style={{
                        fontSize: 11,
                        color: "#a16207",
                        background: "rgba(251,191,36,0.15)",
                        padding: "2px 8px",
                        borderRadius: 8
                    }}>🔒 只读</span>
            </div>
            {}
            <div
                style={{
                    display: "flex",
                    padding: "0 16px 8px",
                    gap: 8,
                    flexShrink: 0
                }}>
                <button
                    onClick={() => setTab("characters")}
                    style={{
                        flex: 1,
                        padding: "6px 0",
                        borderRadius: 10,
                        border: "none",
                        fontSize: 13,
                        fontWeight: 600,
                        background: tab === "characters" ? "rgba(251,191,36,0.3)" : "rgba(255,255,255,0.35)",
                        color: tab === "characters" ? "#92400e" : "#a16207",
                        backdropFilter: "blur(12px)",
                        cursor: "pointer"
                    }}>👤 人物</button>
                <button
                    onClick={() => setTab("rules")}
                    style={{
                        flex: 1,
                        padding: "6px 0",
                        borderRadius: 10,
                        border: "none",
                        fontSize: 13,
                        fontWeight: 600,
                        background: tab === "rules" ? "rgba(251,191,36,0.3)" : "rgba(255,255,255,0.35)",
                        color: tab === "rules" ? "#92400e" : "#a16207",
                        backdropFilter: "blur(12px)",
                        cursor: "pointer"
                    }}>📋 规则</button>
            </div>
            {}
            <div
                style={{
                    flex: 1,
                    overflow: "auto",
                    padding: "0 12px 16px"
                }}>
                {(tab === "characters" ? characterSections : ruleSections).map(s => <div
                    key={s.id}
                    style={{
                        background: "rgba(255,255,255,0.45)",
                        backdropFilter: "blur(16px)",
                        borderRadius: 14,
                        marginBottom: 10,
                        overflow: "hidden",
                        border: `1.5px solid ${s.color}25`
                    }}>
                    {}
                    <div
                        onClick={() => setExpanded(expanded === s.id ? null : s.id)}
                        style={{
                            padding: "12px 14px",
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            cursor: "pointer"
                        }}>
                        <div
                            style={{
                                width: 42,
                                height: 42,
                                borderRadius: 12,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: 22,
                                background: `${s.color}18`,
                                flexShrink: 0
                            }}>{s.icon}</div>
                        <div
                            style={{
                                flex: 1,
                                minWidth: 0
                            }}>
                            <div
                                style={{
                                    fontSize: 14,
                                    fontWeight: 700,
                                    color: "#78350f"
                                }}>{s.title}</div>
                            <div
                                style={{
                                    fontSize: 11,
                                    color: "#a16207",
                                    marginTop: 1,
                                    whiteSpace: "nowrap",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis"
                                }}>{s.subtitle}</div>
                        </div>
                        <span
                            style={{
                                fontSize: 12,
                                color: "#d97706",
                                transition: "transform 0.2s",
                                transform: expanded === s.id ? "rotate(180deg)" : "rotate(0deg)"
                            }}>▼</span>
                    </div>
                    {}
                    {expanded === s.id && <div
                        style={{
                            padding: "0 14px 14px",
                            borderTop: `1px solid ${s.color}15`,
                            maxHeight: 320,
                            overflow: "auto"
                        }}>
                        <div
                            style={{
                                paddingTop: 10
                            }}>{formatContent(s.content)}</div>
                    </div>}
                </div>)}
            </div>
        </div>
    );
}

interface ChatHistory {
    dad: Message[];
    mom: Message[];
    family: Message[];
}

type StatusGif = {
    emoji: string;
    anim: string;
    label: string;
};

function getParentStatus(hour: number) {
    let dadStatus: string, dadDesc: string, momStatus: string, momDesc: string;
    let dadGif: StatusGif, momGif: StatusGif;

    if (hour >= 7 && hour < 8) {
        dadStatus = "🟢 在家";
        dadDesc = "做早餐中";
        momStatus = "🟢 在家";
        momDesc = "赖床中";

        dadGif = {
            emoji: "🍳",
            anim: "sizzle",
            label: "煎蛋中"
        };

        momGif = {
            emoji: "😴",
            anim: "zzz",
            label: "zzz"
        };
    } else if (hour >= 8 && hour < 9) {
        dadStatus = "🟡 出门";
        dadDesc = "上班路上";
        momStatus = "🟢 在家";
        momDesc = "化妆";

        dadGif = {
            emoji: "🚗",
            anim: "drive",
            label: "嘟嘟"
        };

        momGif = {
            emoji: "💄",
            anim: "sparkle",
            label: "变美中"
        };
    } else if (hour >= 9 && hour < 12) {
        dadStatus = "🔴 忙碌";
        dadDesc = "公司开会";
        momStatus = "🟡 出门";
        momDesc = "工作/逛街";

        dadGif = {
            emoji: "💼",
            anim: "typing",
            label: "开会中"
        };

        momGif = {
            emoji: "🛍️",
            anim: "bounce",
            label: "买买买"
        };
    } else if (hour >= 12 && hour < 13) {
        dadStatus = "🟢 在家";
        dadDesc = "午休吃饭";
        momStatus = "🟡 出门";
        momDesc = "和朋友午饭";

        dadGif = {
            emoji: "🍱",
            anim: "steam",
            label: "干饭"
        };

        momGif = {
            emoji: "🥂",
            anim: "cheers",
            label: "干杯"
        };
    } else if (hour >= 13 && hour < 18) {
        dadStatus = "🔴 忙碌";
        dadDesc = "继续工作";
        momStatus = "🟢 在家";
        momDesc = "回家追剧";

        dadGif = {
            emoji: "💻",
            anim: "typing",
            label: "搬砖"
        };

        momGif = {
            emoji: "📺",
            anim: "tvglow",
            label: "追剧中"
        };
    } else if (hour >= 18 && hour < 19) {
        dadStatus = "🟡 出门";
        dadDesc = "下班回家";
        momStatus = "🟢 在家";
        momDesc = "做晚饭";

        dadGif = {
            emoji: "🏠",
            anim: "drive",
            label: "回家啦"
        };

        momGif = {
            emoji: "🍲",
            anim: "steam",
            label: "煲汤中"
        };
    } else if (hour >= 19 && hour < 21) {
        dadStatus = "🟢 在家";
        dadDesc = "看电视";
        momStatus = "🟢 在家";
        momDesc = "靠在爸爸身上";

        dadGif = {
            emoji: "🛋️",
            anim: "rock",
            label: "放松"
        };

        momGif = {
            emoji: "💕",
            anim: "heartbeat",
            label: "贴贴"
        };
    } else if (hour >= 21 && hour < 23) {
        dadStatus = "🟢 在家";
        dadDesc = "聊天互动";
        momStatus = "🟢 在家";
        momDesc = "聊天互动";

        dadGif = {
            emoji: "💬",
            anim: "bounce",
            label: "聊天中"
        };

        momGif = {
            emoji: "😊",
            anim: "sparkle",
            label: "开心"
        };
    } else {
        dadStatus = "🟢 在家";
        dadDesc = "熬夜刷手机";
        momStatus = "🟢 在家";
        momDesc = "半睡半醒";

        dadGif = {
            emoji: "📱",
            anim: "swipe",
            label: "刷刷刷"
        };

        momGif = {
            emoji: "💤",
            anim: "zzz",
            label: "半梦半醒"
        };
    }

    return {
        dadStatus,
        dadDesc,
        momStatus,
        momDesc,
        dadGif,
        momGif
    };
}

let msgIdCounter = Date.now();

function nextId() {
    return ++msgIdCounter;
}

interface AppItem {
    id: string;
    emoji: string;
    label: string;
    color: string;
}

const FIRST_PAGE_APPS: AppItem[] = [{
    id: "app-store",
    emoji: "🛒",
    label: "应用商店",
    color: "#2e7d32"
}, {
    id: "forum",
    emoji: "🏘️",
    label: "社区论坛",
    color: "#8b5cf6"
}, {
    id: "mimicosmo",
    emoji: "📚",
    label: "米米课程表",
    color: "#7c3aed"
}, {
    id: "miniworkshop",
    emoji: "🛠️",
    label: "迷你小作坊",
    color: "#059669"
}, {
    id: "lpmi",
    emoji: "🌽",
    label: "LPMI测试",
    color: "#365314"
}];

const SECOND_PAGE_APPS = [{
    id: "mixin",
    emoji: "💬",
    label: "米信",
    color: "#07c160"
}, {
    id: "weibo",
    emoji: "📱",
    label: "微博",
    color: "#ef4444"
}, {
    id: "home",
    emoji: "🏠",
    label: "家里",
    color: "#14b8a6"
}, {
    id: "pet",
    emoji: "🐾",
    label: "宠物",
    color: "#10b981"
}, {
    id: "dressup",
    emoji: "👗",
    label: "换装",
    color: "#a855f7"
}, {
    id: "profile",
    emoji: "👤",
    label: "我的",
    color: "#06b6d4"
}, {
    id: "call",
    emoji: "📞",
    label: "通话",
    color: "#06b6d4"
}, {
    id: "browser",
    emoji: "🌐",
    label: "浏览器",
    color: "#6366f1"
}, {
    id: "music",
    emoji: "🎵",
    label: "音乐",
    color: "#ec4899"
}, {
    id: "shopping",
    emoji: "🛍️",
    label: "啪多多",
    color: "#f43f5e"
}];

const ALL_HOME_APPS = [...FIRST_PAGE_APPS, ...SECOND_PAGE_APPS];

const DEFAULT_DOCK_APP_IDS = ["settings", "mimicosmo", "miniworkshop", "forum"];
const DOCK_APPS: AppItem[] = DEFAULT_DOCK_APP_IDS.map(id => {
    const app = ALL_HOME_APPS.find(a => a.id === id);
    if (app) return app;
    if (id === "settings") return { id: "settings", emoji: "⚙️", label: "设置", color: "#64748b" };
    return { id, emoji: "❓", label: id, color: "#94a3b8" };
});

function getAppById(id: string): AppItem | undefined {
    if (id === "settings") return { id: "settings", emoji: "⚙️", label: "设置", color: "#64748b" };
    return ALL_HOME_APPS.find(a => a.id === id);
}

function getAppLabel(id: string, unlocked: boolean): string {
    const map: Record<string, string> = {
        mixin: "米信",
        weibo: "微博",
        home: "家里",
        pet: "宠物",
        dressup: "换装",
        me: "我的",
        worldbook: "世界书",
        call: "通话",
        browser: "浏览器",
        music: "音乐",
        shopping: "啪多多",
        lpmi: "LPMI测试",
        mimicosmo: "米米课程表",
        miniworkshop: "迷你小作坊",
        forum: "社区论坛",
        profile: "我的",
        settings: "设置"
    };

    return map[id] || id;
}

// Weibo Verification Admin Panel Component
function AdminManagePanel({ currentUsername }: { currentUsername: string }) {
    const [pendingAdmins, setPendingAdmins] = useState<Array<{
        id: string;
        username: string;
        display_name: string;
        level: number;
        created_at: string;
    }>>([]);
    const [allAdmins, setAllAdmins] = useState<Array<{
        id: string;
        username: string;
        display_name: string;
        level: number;
        is_admin: boolean;
        admin_approved: boolean;
        admin_pending: boolean;
        approved_by: string;
        approved_at: string;
        created_at: string;
    }>>([]);
    const [allUsers, setAllUsers] = useState<Array<{
        id: string;
        username: string;
        display_name: string;
        level: number;
        is_admin: boolean;
        admin_approved: boolean;
        weibo_verified: boolean;
        weibo_uid: string;
        weibo_name: string;
        role: string;
        created_at: string;
    }>>([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [showUserList, setShowUserList] = useState(false);

    const fetchData = async () => {
        try {
            setLoading(true);
            const [pendingRes, allRes, usersRes] = await Promise.all([
                fetch("/api/auth", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "list_pending_admins" })
                }),
                fetch("/api/auth", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "list_admins" })
                }),
                fetch("/api/auth", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "list_users" })
                })
            ]);
            const pendingResult = await pendingRes.json();
            const allResult = await allRes.json();
            const usersResult = await usersRes.json();
            if (pendingResult.success) setPendingAdmins(pendingResult.data);
            if (allResult.success) setAllAdmins(allResult.data);
            if (usersResult.success) setAllUsers(usersResult.data);
        } catch (e) {
            console.error("Fetch admin data failed:", e);
        } finally {
            setLoading(false);
        }
    };

    const handleApprove = async (targetUserId: string) => {
        setActionLoading(targetUserId);
        try {
            await fetch("/api/auth", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "approve_admin",
                    username: currentUsername,
                    targetUserId
                })
            });
            fetchData();
        } catch (e) {
            console.error("Approve failed:", e);
        } finally {
            setActionLoading(null);
        }
    };

    const handleReject = async (targetUserId: string) => {
        setActionLoading(targetUserId);
        try {
            await fetch("/api/auth", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "reject_admin",
                    username: currentUsername,
                    targetUserId
                })
            });
            fetchData();
        } catch (e) {
            console.error("Reject failed:", e);
        } finally {
            setActionLoading(null);
        }
    };

    const handleSetRole = async (targetUserId: string, role: string) => {
        setActionLoading(targetUserId);
        try {
            await fetch("/api/auth", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "set_role",
                    username: currentUsername,
                    targetUserId,
                    role
                })
            });
            fetchData();
        } catch (e) {
            console.error("Set role failed:", e);
        } finally {
            setActionLoading(null);
        }
    };

    useState(() => {
        fetchData();
    });

    return (
        <div style={{ padding: "0 4px" }}>
            <div style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 12
            }}>
                <span style={{ fontSize: 16, fontWeight: 700, color: "#92400e" }}>👑 管理员管理</span>
                <button
                    onClick={fetchData}
                    style={{
                        background: "rgba(245,158,11,0.1)",
                        border: "1px solid rgba(245,158,11,0.3)",
                        borderRadius: 8,
                        padding: "4px 10px",
                        fontSize: 11,
                        color: "#92400e",
                        cursor: "pointer"
                    }}>🔄 刷新</button>
            </div>

            {loading ? (
                <div style={{ textAlign: "center", padding: 30, color: "#bbb", fontSize: 13 }}>加载中...</div>
            ) : (
                <>
                    {/* 待审批 */}
                    <div style={{
                        background: "rgba(234,179,8,0.06)",
                        borderRadius: 12,
                        padding: 12,
                        marginBottom: 12,
                        border: "1px solid rgba(234,179,8,0.15)"
                    }}>
                        <div style={{
                            fontSize: 13,
                            fontWeight: 700,
                            color: "#92400e",
                            marginBottom: 10,
                            display: "flex",
                            alignItems: "center",
                            gap: 6
                        }}>
                            <span>⏳ 待审批</span>
                            {pendingAdmins.length > 0 && (
                                <span style={{
                                    background: "#eab308",
                                    color: "#fff",
                                    borderRadius: 10,
                                    padding: "1px 8px",
                                    fontSize: 10,
                                    fontWeight: 700
                                }}>{pendingAdmins.length}</span>
                            )}
                        </div>

                        {pendingAdmins.length === 0 ? (
                            <div style={{ fontSize: 12, color: "#bbb", textAlign: "center", padding: 10 }}>
                                暂无待审批申请
                            </div>
                        ) : (
                            pendingAdmins.map(admin => (
                                <div key={admin.id} style={{
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                    padding: "10px 12px",
                                    background: "rgba(255,255,255,0.7)",
                                    borderRadius: 10,
                                    marginBottom: 8,
                                    border: "1px solid rgba(234,179,8,0.15)"
                                }}>
                                    <div>
                                        <div style={{ fontSize: 13, fontWeight: 600, color: "#2e5c33" }}>
                                            {admin.display_name || admin.username}
                                        </div>
                                        <div style={{ fontSize: 11, color: "#999", marginTop: 2 }}>
                                            @{admin.username} · 申请时间 {new Date(admin.created_at).toLocaleDateString("zh-CN")}
                                        </div>
                                    </div>
                                    <div style={{ display: "flex", gap: 6 }}>
                                        <button
                                            onClick={() => handleApprove(admin.id)}
                                            disabled={actionLoading === admin.id}
                                            style={{
                                                padding: "5px 12px",
                                                borderRadius: 8,
                                                border: "none",
                                                fontSize: 11,
                                                fontWeight: 600,
                                                background: "#22c55e",
                                                color: "#fff",
                                                cursor: actionLoading === admin.id ? "not-allowed" : "pointer",
                                                opacity: actionLoading === admin.id ? 0.5 : 1
                                            }}>✓ 通过</button>
                                        <button
                                            onClick={() => handleReject(admin.id)}
                                            disabled={actionLoading === admin.id}
                                            style={{
                                                padding: "5px 12px",
                                                borderRadius: 8,
                                                border: "none",
                                                fontSize: 11,
                                                fontWeight: 600,
                                                background: "#ef4444",
                                                color: "#fff",
                                                cursor: actionLoading === admin.id ? "not-allowed" : "pointer",
                                                opacity: actionLoading === admin.id ? 0.5 : 1
                                            }}>✗ 拒绝</button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    {/* 管理员列表 */}
                    <div style={{
                        background: "rgba(255,255,255,0.5)",
                        borderRadius: 12,
                        padding: 12,
                        border: "1px solid rgba(255,255,255,0.4)"
                    }}>
                        <div style={{
                            fontSize: 13,
                            fontWeight: 700,
                            color: "#92400e",
                            marginBottom: 10
                        }}>📋 管理员列表 ({allAdmins.length})</div>

                        {allAdmins.map(admin => (
                            <div key={admin.id} style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                padding: "10px 12px",
                                background: "rgba(255,255,255,0.7)",
                                borderRadius: 10,
                                marginBottom: 6,
                                border: "1px solid rgba(255,255,255,0.5)"
                            }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                    <span style={{ fontSize: 18 }}>👑</span>
                                    <div>
                                        <div style={{ fontSize: 13, fontWeight: 600, color: "#2e5c33" }}>
                                            {admin.display_name || admin.username}
                                        </div>
                                        <div style={{ fontSize: 11, color: "#999", marginTop: 2 }}>
                                            @{admin.username}
                                            {admin.approved_by && ` · 由 ${admin.approved_by} 审批`}
                                        </div>
                                    </div>
                                </div>
                                <div style={{
                                    fontSize: 10,
                                    fontWeight: 600,
                                    padding: "3px 8px",
                                    borderRadius: 6,
                                    background: admin.admin_approved ? "rgba(34,197,94,0.1)" : "rgba(234,179,8,0.1)",
                                    color: admin.admin_approved ? "#16a34a" : "#ca8a04"
                                }}>
                                    {admin.admin_approved ? "已审批" : "待审批"}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* 用户列表（含微博ID） */}
                    <div style={{
                        background: "rgba(255,255,255,0.5)",
                        borderRadius: 12,
                        padding: 12,
                        marginTop: 12,
                        border: "1px solid rgba(255,255,255,0.4)"
                    }}>
                        <div style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            marginBottom: 10
                        }}>
                            <span style={{
                                fontSize: 13,
                                fontWeight: 700,
                                color: "#92400e"
                            }}>👥 用户列表 ({allUsers.length})</span>
                            <button
                                onClick={() => setShowUserList(!showUserList)}
                                style={{
                                    background: "none",
                                    border: "none",
                                    fontSize: 11,
                                    color: "#5a9e6a",
                                    cursor: "pointer",
                                    textDecoration: "underline"
                                }}
                            >{showUserList ? "收起" : "展开"}</button>
                        </div>

                        {showUserList && (
                            <div>
                                {allUsers.length === 0 ? (
                                    <div style={{ fontSize: 12, color: "#bbb", textAlign: "center", padding: 10 }}>
                                        暂无用户
                                    </div>
                                ) : (
                                    allUsers.map(user => (
                                        <div key={user.id} style={{
                                            padding: "10px 12px",
                                            background: "rgba(255,255,255,0.7)",
                                            borderRadius: 10,
                                            marginBottom: 6,
                                            border: "1px solid rgba(255,255,255,0.5)"
                                        }}>
                                            <div style={{
                                                display: "flex",
                                                justifyContent: "space-between",
                                                alignItems: "center"
                                            }}>
                                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                                    <span style={{ fontSize: 16 }}>
                                                        {user.is_admin && user.admin_approved ? "👑" : "👤"}
                                                    </span>
                                                    <div>
                                                        <div style={{ fontSize: 13, fontWeight: 600, color: "#2e5c33" }}>
                                                            {user.display_name || user.username}
                                                        </div>
                                                        <div style={{ fontSize: 11, color: "#999", marginTop: 2 }}>
                                                            @{user.username} · Lv.{user.level}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div style={{
                                                    fontSize: 10,
                                                    fontWeight: 600,
                                                    padding: "3px 8px",
                                                    borderRadius: 6,
                                                    background: user.weibo_verified ? "rgba(34,197,94,0.1)" : "rgba(156,163,175,0.1)",
                                                    color: user.weibo_verified ? "#16a34a" : "#6b7280"
                                                }}>
                                                    {user.weibo_verified ? "✓ 已验证" : "未验证"}
                                                </div>
                                            </div>
                                            {/* 微博信息 */}
                                            {(user.weibo_uid || user.weibo_name) && (
                                                <div style={{
                                                    marginTop: 8,
                                                    padding: "8px 10px",
                                                    background: "rgba(245,158,11,0.05)",
                                                    borderRadius: 8,
                                                    border: "1px solid rgba(245,158,11,0.15)"
                                                }}>
                                                    <div style={{
                                                        fontSize: 10,
                                                        fontWeight: 600,
                                                        color: "#92400e",
                                                        marginBottom: 4
                                                    }}>🔗 绑定微博</div>
                                                    <div style={{ fontSize: 12, color: "#2e5c33", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                                        {user.weibo_name && <span style={{ fontWeight: 600 }}>{user.weibo_name}</span>}
                                                        {user.weibo_uid && (
                                                            <a
                                                                href={`https://weibo.com/u/${user.weibo_uid}`}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                style={{
                                                                    color: "#2e7d32",
                                                                    textDecoration: "underline",
                                                                    fontSize: 11,
                                                                    fontWeight: 500
                                                                }}
                                                            >
                                                                查看微博主页 ↗
                                                            </a>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                            {/* 角色管理 */}
                                            <div style={{
                                                marginTop: 8,
                                                padding: "8px 10px",
                                                background: "rgba(6,182,212,0.05)",
                                                borderRadius: 8,
                                                border: "1px solid rgba(6,182,212,0.15)"
                                            }}>
                                                <div style={{
                                                    fontSize: 10,
                                                    fontWeight: 600,
                                                    color: "#0e7490",
                                                    marginBottom: 6
                                                }}>🎭 角色管理</div>
                                                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                                                    {(["user", "teacher", "leader", "admin"] as const).map(role => {
                                                        const roleInfo: Record<string, { label: string; color: string }> = {
                                                            user: { label: "用户", color: "#6b7280" },
                                                            teacher: { label: "老师", color: "#2e7d32" },
                                                            leader: { label: "团长", color: "#f59e0b" },
                                                            admin: { label: "管理员", color: "#dc2626" }
                                                        };
                                                        const info = roleInfo[role];
                                                        const isCurrentRole = user.role === role;
                                                        return (
                                                            <button
                                                                key={role}
                                                                onClick={() => handleSetRole(user.username, role)}
                                                                style={{
                                                                    fontSize: 11,
                                                                    padding: "4px 10px",
                                                                    borderRadius: 6,
                                                                    border: isCurrentRole ? `1px solid ${info.color}` : "1px solid rgba(0,0,0,0.1)",
                                                                    background: isCurrentRole ? info.color : "white",
                                                                    color: isCurrentRole ? "white" : info.color,
                                                                    cursor: "pointer",
                                                                    fontWeight: isCurrentRole ? 600 : 500
                                                                }}
                                                            >
                                                                {info.label}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}

function InviteAdminPanel({ currentUsername }: { currentUsername: string }) {
    const [inviteCodes, setInviteCodes] = useState<Array<{
        id: string;
        code: string;
        created_by: string;
        used_by: string | null;
        use_count: number;
        max_uses: number;
        is_active: boolean;
        expires_at: string | null;
        created_at: string;
        note: string;
    }>>([]);
    const [inviteTree, setInviteTree] = useState<{
        invited: Array<{
            username: string;
            display_name: string;
            invited_by: string;
            created_at: string;
        }>;
        admins: Array<{
            username: string;
            display_name: string;
            created_at: string;
        }>;
    }>({ invited: [], admins: [] });
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [maxUses, setMaxUses] = useState(1);
    const [expiresDays, setExpiresDays] = useState(0);
    const [inviteRequired, setInviteRequired] = useState(false);
    const [copiedCode, setCopiedCode] = useState("");

    const fetchData = async () => {
        try {
            setLoading(true);
            const [codesRes, treeRes, settingsRes] = await Promise.all([
                fetch("/api/invite", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "list" })
                }),
                fetch("/api/invite", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "tree" })
                }),
                fetch("/api/auth", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "get_invite_settings" })
                })
            ]);
            const codesResult = await codesRes.json();
            const treeResult = await treeRes.json();
            const settingsResult = await settingsRes.json();
            if (codesResult.success) setInviteCodes(codesResult.data);
            if (treeResult.success) setInviteTree(treeResult.data);
            if (settingsResult.success) setInviteRequired(settingsResult.data?.invite_required === "true");
        } catch (e) {
            console.error("Fetch invite data failed:", e);
        } finally {
            setLoading(false);
        }
    };

    const handleGenerate = async () => {
        setGenerating(true);
        try {
            await fetch("/api/invite", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "generate",
                    username: currentUsername,
                    maxUses,
                    expiresInDays: expiresDays || undefined,
                })
            });
            fetchData();
        } catch (e) {
            console.error("Generate failed:", e);
        } finally {
            setGenerating(false);
        }
    };

    const handleDeactivate = async (code: string) => {
        await fetch("/api/invite", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "deactivate", code })
        });
        fetchData();
    };

    const handleToggleInviteRequired = async () => {
        await fetch("/api/auth", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                action: "get_invite_settings"
            })
        });
        const newValue = !inviteRequired;
        await fetch("/api/invite", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                action: "update_settings",
                username: currentUsername,
                key: "invite_required",
                value: String(newValue),
            })
        });
        setInviteRequired(newValue);
    };

    const copyCode = (code: string) => {
        navigator.clipboard.writeText(code);
        setCopiedCode(code);
        setTimeout(() => setCopiedCode(""), 2000);
    };

    useState(() => {
        fetchData();
    });

    // 构建邀请树
    const buildTree = () => {
        const tree: Record<string, Array<{ username: string; display_name: string; created_at: string }>> = {};
        inviteTree.invited.forEach(u => {
            if (!tree[u.invited_by]) tree[u.invited_by] = [];
            tree[u.invited_by].push({ username: u.username, display_name: u.display_name, created_at: u.created_at });
        });
        return tree;
    };

    const tree = buildTree();

    return (
        <div style={{ padding: "0 4px" }}>
            <div style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 12
            }}>
                <span style={{ fontSize: 16, fontWeight: 700, color: "#92400e" }}>🎟️ 邀请码管理</span>
                <button
                    onClick={fetchData}
                    style={{
                        background: "rgba(245,158,11,0.1)",
                        border: "1px solid rgba(245,158,11,0.3)",
                        borderRadius: 8,
                        padding: "4px 10px",
                        fontSize: 11,
                        color: "#92400e",
                        cursor: "pointer"
                    }}>🔄 刷新</button>
            </div>

            {/* 邀请码开关 */}
            <div style={{
                background: inviteRequired ? "rgba(239,68,68,0.06)" : "rgba(34,197,94,0.06)",
                borderRadius: 12,
                padding: 12,
                marginBottom: 12,
                border: `1px solid ${inviteRequired ? "rgba(239,68,68,0.2)" : "rgba(34,197,94,0.2)"}`
            }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: inviteRequired ? "#dc2626" : "#16a34a" }}>
                            {inviteRequired ? "🔒 邀请码模式：已开启" : "🔓 邀请码模式：已关闭"}
                        </div>
                        <div style={{ fontSize: 11, color: "#666", marginTop: 4 }}>
                            {inviteRequired ? "新用户注册必须填写邀请码" : "新用户注册无需邀请码"}
                        </div>
                    </div>
                    <button
                        onClick={handleToggleInviteRequired}
                        style={{
                            padding: "6px 14px",
                            borderRadius: 8,
                            border: "none",
                            fontSize: 12,
                            fontWeight: 600,
                            background: inviteRequired ? "#ef4444" : "#22c55e",
                            color: "#fff",
                            cursor: "pointer"
                        }}>
                        {inviteRequired ? "关闭" : "开启"}
                    </button>
                </div>
            </div>

            {/* 生成邀请码 */}
            <div style={{
                background: "rgba(255,255,255,0.6)",
                borderRadius: 12,
                padding: 12,
                marginBottom: 12,
                border: "1px solid rgba(255,255,255,0.5)"
            }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#92400e", marginBottom: 10 }}>✨ 生成邀请码</div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <div style={{ fontSize: 11, color: "#666" }}>可用次数:</div>
                    <input
                        type="number"
                        value={maxUses}
                        onChange={(e) => setMaxUses(Number(e.target.value) || 1)}
                        min={1}
                        max={999}
                        style={{
                            width: 60,
                            padding: "4px 8px",
                            borderRadius: 6,
                            border: "1px solid #ddd",
                            fontSize: 12,
                            textAlign: "center"
                        }}
                    />
                    <div style={{ fontSize: 11, color: "#666" }}>有效期(天):</div>
                    <input
                        type="number"
                        value={expiresDays}
                        onChange={(e) => setExpiresDays(Number(e.target.value) || 0)}
                        min={0}
                        placeholder="不限"
                        style={{
                            width: 60,
                            padding: "4px 8px",
                            borderRadius: 6,
                            border: "1px solid #ddd",
                            fontSize: 12,
                            textAlign: "center"
                        }}
                    />
                    <button
                        onClick={handleGenerate}
                        disabled={generating}
                        style={{
                            padding: "5px 14px",
                            borderRadius: 8,
                            border: "none",
                            fontSize: 12,
                            fontWeight: 600,
                            background: "#f59e0b",
                            color: "#fff",
                            cursor: generating ? "not-allowed" : "pointer",
                            opacity: generating ? 0.5 : 1
                        }}>
                        {generating ? "生成中..." : "生成"}
                    </button>
                </div>
            </div>

            {loading ? (
                <div style={{ textAlign: "center", padding: 30, color: "#bbb", fontSize: 13 }}>加载中...</div>
            ) : (
                <>
                    {/* 邀请码列表 */}
                    <div style={{
                        background: "rgba(255,255,255,0.5)",
                        borderRadius: 12,
                        padding: 12,
                        marginBottom: 12,
                        border: "1px solid rgba(255,255,255,0.4)"
                    }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#92400e", marginBottom: 10 }}>
                            📋 邀请码列表 ({inviteCodes.length})
                        </div>
                        {inviteCodes.length === 0 ? (
                            <div style={{ fontSize: 12, color: "#bbb", textAlign: "center", padding: 10 }}>暂无邀请码</div>
                        ) : (
                            inviteCodes.map(ic => (
                                <div key={ic.id} style={{
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                    padding: "8px 10px",
                                    background: "rgba(255,255,255,0.7)",
                                    borderRadius: 8,
                                    marginBottom: 6,
                                    border: "1px solid rgba(255,255,255,0.5)"
                                }}>
                                    <div>
                                        <div style={{
                                            fontSize: 13,
                                            fontWeight: 700,
                                            fontFamily: "monospace",
                                            color: ic.is_active ? "#2e7d32" : "#999"
                                        }}>
                                            {ic.code}
                                        </div>
                                        <div style={{ fontSize: 10, color: "#999", marginTop: 2 }}>
                                            创建者: {ic.created_by} · {ic.use_count}/{ic.max_uses}次
                                            {ic.used_by && ` · 被 ${ic.used_by} 使用`}
                                            {!ic.is_active && " · 已停用"}
                                        </div>
                                    </div>
                                    <div style={{ display: "flex", gap: 4 }}>
                                        <button
                                            onClick={() => copyCode(ic.code)}
                                            style={{
                                                padding: "3px 8px",
                                                borderRadius: 6,
                                                border: "none",
                                                fontSize: 10,
                                                background: copiedCode === ic.code ? "#22c55e" : "#e5e7eb",
                                                color: copiedCode === ic.code ? "#fff" : "#666",
                                                cursor: "pointer"
                                            }}>
                                            {copiedCode === ic.code ? "已复制" : "复制"}
                                        </button>
                                        {ic.is_active && (
                                            <button
                                                onClick={() => handleDeactivate(ic.code)}
                                                style={{
                                                    padding: "3px 8px",
                                                    borderRadius: 6,
                                                    border: "none",
                                                    fontSize: 10,
                                                    background: "rgba(239,68,68,0.1)",
                                                    color: "#ef4444",
                                                    cursor: "pointer"
                                                }}>停用</button>
                                        )}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    {/* 邀请关系树 */}
                    <div style={{
                        background: "rgba(255,255,255,0.5)",
                        borderRadius: 12,
                        padding: 12,
                        border: "1px solid rgba(255,255,255,0.4)"
                    }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#92400e", marginBottom: 10 }}>
                            🌳 邀请关系树
                        </div>

                        {/* 根节点：管理员 */}
                        {inviteTree.admins.map(admin => (
                            <div key={admin.username} style={{ marginBottom: 8 }}>
                                <div style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 6,
                                    padding: "6px 10px",
                                    background: "rgba(245,158,11,0.1)",
                                    borderRadius: 8,
                                    border: "1px solid rgba(245,158,11,0.2)"
                                }}>
                                    <span>👑</span>
                                    <span style={{ fontSize: 12, fontWeight: 700, color: "#92400e" }}>
                                        {admin.display_name || admin.username}
                                    </span>
                                    <span style={{ fontSize: 10, color: "#999" }}>@{admin.username}</span>
                                    {tree[admin.username] && (
                                        <span style={{
                                            fontSize: 10,
                                            background: "#f59e0b",
                                            color: "#fff",
                                            borderRadius: 8,
                                            padding: "1px 6px",
                                            fontWeight: 600
                                        }}>邀请了 {tree[admin.username].length} 人</span>
                                    )}
                                </div>
                                {/* 子节点 */}
                                {tree[admin.username] && (
                                    <div style={{ marginLeft: 20, marginTop: 4 }}>
                                        {tree[admin.username].map(u => (
                                            <div key={u.username}>
                                                <div style={{
                                                    display: "flex",
                                                    alignItems: "center",
                                                    gap: 6,
                                                    padding: "4px 10px",
                                                    fontSize: 11,
                                                    color: "#2e5c33"
                                                }}>
                                                    <span>└─</span>
                                                    <span>👤</span>
                                                    <span style={{ fontWeight: 600 }}>{u.display_name || u.username}</span>
                                                    <span style={{ color: "#999" }}>@{u.username}</span>
                                                    <span style={{ color: "#bbb", fontSize: 10 }}>
                                                        {new Date(u.created_at).toLocaleDateString("zh-CN")}
                                                    </span>
                                                </div>
                                                {/* 二级子节点 */}
                                                {tree[u.username] && (
                                                    <div style={{ marginLeft: 20 }}>
                                                        {tree[u.username].map(u2 => (
                                                            <div key={u2.username} style={{
                                                                display: "flex",
                                                                alignItems: "center",
                                                                gap: 6,
                                                                padding: "3px 10px",
                                                                fontSize: 10,
                                                                color: "#666"
                                                            }}>
                                                                <span>└─</span>
                                                                <span>👤</span>
                                                                <span>{u2.display_name || u2.username}</span>
                                                                <span style={{ color: "#bbb" }}>@{u2.username}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}

                        {inviteTree.invited.length === 0 && inviteTree.admins.length === 0 && (
                            <div style={{ fontSize: 12, color: "#bbb", textAlign: "center", padding: 10 }}>
                                暂无邀请关系
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}

function WeiboVerifyAdmin() {
    const [verifications, setVerifications] = useState<Array<{
        id: string;
        user_id: string;
        weibo_uid: string;
        weibo_name: string;
        verification_code: string;
        step1_dm_sent: boolean;
        step1_passed: boolean;
        step2_passed: boolean;
        step2_chaohua_level: number;
        status: string;
        admin_note: string;
        created_at: string;
    }>>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<"pending" | "verified" | "rejected" | "all">("pending");

    const fetchVerifications = async () => {
        try {
            const authToken = localStorage.getItem("auth_token");
            const res = await fetch("/api/weibo-verify?list=true&status=" + filter, {
                headers: authToken ? { "Authorization": `Bearer ${authToken}` } : {}
            });
            const result = await res.json();
            if (result.data) {
                setVerifications(result.data);
            }
        } catch (e) {
            console.error("Fetch verifications failed:", e);
        } finally {
            setLoading(false);
        }
    };

    const handleAction = async (username: string, action: string, note?: string) => {
        try {
            const authToken = localStorage.getItem("auth_token");
            await fetch("/api/weibo-verify", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action,
                    username,
                    adminNote: note || `Admin ${action}`,
                    authToken
                })
            });
            fetchVerifications();
        } catch (e) {
            console.error("Admin action failed:", e);
        }
    };

    // Fetch on mount and when filter changes
    useState(() => {
        fetchVerifications();
    });

    return (
        <div style={{ padding: "0 4px" }}>
            <div style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 12
            }}>
                <span style={{ fontSize: 16, fontWeight: 700, color: "#92400e" }}>🔐 微博验证审核</span>
                <button
                    onClick={fetchVerifications}
                    style={{
                        background: "rgba(245,158,11,0.1)",
                        border: "1px solid rgba(245,158,11,0.3)",
                        borderRadius: 8,
                        padding: "4px 10px",
                        fontSize: 11,
                        color: "#92400e",
                        cursor: "pointer"
                    }}>🔄 刷新</button>
            </div>

            {/* Filter tabs */}
            <div style={{
                display: "flex",
                gap: 6,
                marginBottom: 12
            }}>
                {([
                    { key: "pending" as const, label: "待审核" },
                    { key: "verified" as const, label: "已通过" },
                    { key: "rejected" as const, label: "已拒绝" },
                    { key: "all" as const, label: "全部" }
                ]).map(f => (
                    <button
                        key={f.key}
                        onClick={() => { setFilter(f.key); setLoading(true); fetchVerifications(); }}
                        style={{
                            padding: "4px 10px",
                            borderRadius: 8,
                            border: "none",
                            fontSize: 11,
                            fontWeight: filter === f.key ? 600 : 400,
                            background: filter === f.key ? "#f59e0b" : "rgba(255,255,255,0.5)",
                            color: filter === f.key ? "#fff" : "#92400e",
                            cursor: "pointer"
                        }}>{f.label}</button>
                ))}
            </div>

            {loading ? (
                <div style={{ textAlign: "center", padding: 30, color: "#bbb", fontSize: 13 }}>加载中...</div>
            ) : verifications.length === 0 ? (
                <div style={{ textAlign: "center", padding: 30, color: "#bbb", fontSize: 13 }}>暂无验证记录</div>
            ) : (
                verifications.map(v => (
                    <div key={v.id} style={{
                        background: "rgba(255,255,255,0.7)",
                        borderRadius: 12,
                        padding: 12,
                        marginBottom: 8,
                        border: "1px solid rgba(255,255,255,0.6)"
                    }}>
                        <div style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            marginBottom: 8
                        }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: "#92400e" }}>
                                @{v.user_id}
                            </span>
                            <span style={{
                                fontSize: 10,
                                padding: "2px 8px",
                                borderRadius: 6,
                                background: v.status === "verified" ? "#dcfce7" : v.status === "rejected" ? "#fee2e2" : "#fef3c7",
                                color: v.status === "verified" ? "#166534" : v.status === "rejected" ? "#991b1b" : "#92400e"
                            }}>{v.status === "verified" ? "已通过" : v.status === "rejected" ? "已拒绝" : "待审核"}</span>
                        </div>
                        <div style={{ fontSize: 11, color: "#666", marginBottom: 6 }}>
                            微博UID: {v.weibo_uid || "未填"} | 昵称: {v.weibo_name || "未填"}
                        </div>
                        <div style={{ fontSize: 11, color: "#666", marginBottom: 6 }}>
                            验证码: <span style={{ fontFamily: "monospace", fontWeight: 600, color: "#2e7d32" }}>{v.verification_code}</span>
                        </div>
                        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                            <span style={{
                                fontSize: 10,
                                padding: "2px 6px",
                                borderRadius: 4,
                                background: v.step1_passed ? "#dcfce7" : "#f5f5f5",
                                color: v.step1_passed ? "#166534" : "#999"
                            }}>① 私信 {v.step1_passed ? "✓" : "✗"}</span>
                            <span style={{
                                fontSize: 10,
                                padding: "2px 6px",
                                borderRadius: 4,
                                background: v.step2_passed ? "#dcfce7" : "#f5f5f5",
                                color: v.step2_passed ? "#166534" : "#999"
                            }}>② 超话 {v.step2_passed ? "✓" : "✗"}</span>
                        </div>
                        {v.status === "pending" && (
                            <div style={{ display: "flex", gap: 6 }}>
                                <button
                                    onClick={() => handleAction(v.user_id, "admin_approve_step1")}
                                    style={{
                                        flex: 1,
                                        padding: "6px",
                                        borderRadius: 8,
                                        border: "1px solid #86efac",
                                        background: "#f0fdf4",
                                        color: "#166534",
                                        fontSize: 11,
                                        fontWeight: 600,
                                        cursor: "pointer"
                                    }}>✅ 通过私信</button>
                                <button
                                    onClick={() => handleAction(v.user_id, "admin_approve_all")}
                                    style={{
                                        flex: 1,
                                        padding: "6px",
                                        borderRadius: 8,
                                        border: "1px solid #86efac",
                                        background: "#dcfce7",
                                        color: "#166534",
                                        fontSize: 11,
                                        fontWeight: 600,
                                        cursor: "pointer"
                                    }}>✅ 全部通过</button>
                                <button
                                    onClick={() => handleAction(v.user_id, "admin_reject")}
                                    style={{
                                        flex: 1,
                                        padding: "6px",
                                        borderRadius: 8,
                                        border: "1px solid #fca5a5",
                                        background: "#fef2f2",
                                        color: "#991b1b",
                                        fontSize: 11,
                                        fontWeight: 600,
                                        cursor: "pointer"
                                    }}>❌ 拒绝</button>
                            </div>
                        )}
                    </div>
                ))
            )}
        </div>
    );
}

const KNOB_STYLES: Array<{ id: string; label: string; icon: string }> = [
    { id: "circle", label: "圆形", icon: "●" },
    { id: "star", label: "星星", icon: "★" },
    { id: "heart", label: "爱心", icon: "♥" },
    { id: "bolt", label: "闪电", icon: "⚡" },
    { id: "flower", label: "花朵", icon: "✿" }
];

export default function PhonePage() {
    const [time, setTime] = useState("--:--");
    const [dateStr, setDateStr] = useState("");

    const [parentStatus, setParentStatus] = useState<{
        dadStatus: string;
        dadDesc: string;
        momStatus: string;
        momDesc: string;
        dadGif: StatusGif;
        momGif: StatusGif;
    }>({
        dadStatus: "···",
        dadDesc: "",
        momStatus: "···",
        momDesc: "",

        dadGif: {
            emoji: "⏳",
            anim: "",
            label: ""
        },

        momGif: {
            emoji: "⏳",
            anim: "",
            label: ""
        }
    });

    const [currentPage, setCurrentPage] = useState(0);
    const [currentApp, setCurrentApp] = useState<string | null>(null);
    const [appClosing, setAppClosing] = useState(false);
    const [loginUsername, setLoginUsername] = useState("");
    const [loginPassword, setLoginPassword] = useState("");
    const [loginMode, setLoginMode] = useState<"login" | "register">("login");
    const [loginError, setLoginError] = useState("");
    const [defaultPasswordTip, setDefaultPasswordTip] = useState(false);
    const [loginLoading, setLoginLoading] = useState(false);
    const [showForgotPassword, setShowForgotPassword] = useState(false);
    const [forgotPasswordForm, setForgotPasswordForm] = useState({ username: "", weiboNickname: "", weiboLink: "" });
    const [forgotPasswordSubmitted, setForgotPasswordSubmitted] = useState(false);
    const [forgotPasswordRequests, setForgotPasswordRequests] = useState<Array<{ id: string; username: string; weiboNickname: string; weiboLink: string; status: "pending" | "processed"; createdAt: string }>>([]);
    const [isPageLoading, setIsPageLoading] = useState(true);
    const [accountDisplayName, setAccountDisplayName] = useState(loginUsername);
    const [accountCurrentPassword, setAccountCurrentPassword] = useState("");
    const [accountNewPassword, setAccountNewPassword] = useState("");
    const [accountLoading, setAccountLoading] = useState(false);
    const [accountMessage, setAccountMessage] = useState("");
    const [dockAppIds, setDockAppIds] = useState<string[]>(DEFAULT_DOCK_APP_IDS);
    const [isDockReplacing, setIsDockReplacing] = useState(false);
    const [viewingUserProfile, setViewingUserProfile] = useState<string | null>(null);
    const [wallpaper, setWallpaper] = useState<string>("default");
    const [knobStyle, setKnobStyle] = useState<string>("circle");
    const [changePasswordCurrent, setChangePasswordCurrent] = useState("");
    const [changePasswordNew, setChangePasswordNew] = useState("");
    const [changePasswordConfirm, setChangePasswordConfirm] = useState("");
    const [changePasswordLoading, setChangePasswordLoading] = useState(false);
    const [changePasswordMessage, setChangePasswordMessage] = useState("");
    const [userBio, setUserBio] = useState("");
    const [bioDraft, setBioDraft] = useState("");
    const [bioLoading, setBioLoading] = useState(false);
    const [bioMessage, setBioMessage] = useState("");
    const [installedStoreApps, setInstalledStoreApps] = useState<Array<{ id: string; name: string; icon: string }>>(() => {
        try {
            const raw = localStorage.getItem("mimi_installed_apps_v1");
            const parsed = raw ? JSON.parse(raw) : [];
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    });

    const WALLPAPER_PRESETS: Record<string, string> = {
        default: "linear-gradient(175deg, #f0f7f2 0%, #e8f3eb 30%, #dceee2 60%, #d4e8da 100%)",
        fresh: "linear-gradient(135deg, #e8f5e9 0%, #c8e6c9 50%, #a5d6a7 100%)",
        mint: "linear-gradient(135deg, #e0f2f1 0%, #b2dfdb 50%, #80cbc4 100%)",
        sky: "linear-gradient(135deg, #e1f5fe 0%, #b3e5fc 50%, #81d4fa 100%)",
        blush: "linear-gradient(135deg, #fff3e0 0%, #ffe0b2 50%, #ffcc80 100%)",
        dusk: "linear-gradient(135deg, #f3e5f5 0%, #e1bee7 50%, #ce93d8 100%)",
        dots: "radial-gradient(circle, rgba(90,158,106,0.12) 2px, transparent 2px), linear-gradient(175deg, #f0f7f2 0%, #e8f3eb 100%)",
        lines: "repeating-linear-gradient(45deg, rgba(90,158,106,0.06) 0, rgba(90,158,106,0.06) 1px, transparent 1px, transparent 12px), linear-gradient(175deg, #f0f7f2 0%, #e8f3eb 100%)"
    };

    interface WeiboAccount {
        nickname: string;
        avatar: string;
        bio: string;
        isSet: boolean;
    }

    const [weiboAccount, setWeiboAccount] = useState<WeiboAccount>({
        nickname: "游客用户",
        avatar: "😎",
        bio: "",
        isSet: false
    });

    useEffect(() => {
        // 页面加载完成后隐藏 Loading
        const timer = setTimeout(() => setIsPageLoading(false), 500);
        return () => clearTimeout(timer);
    }, []);
    const [requestAdmin, setRequestAdmin] = useState(false);
    const [adminPendingMsg, setAdminPendingMsg] = useState("");
    const [invitationCode, setInvitationCode] = useState("");
    const [registerWeiboName, setRegisterWeiboName] = useState("");
    const [weiboLink, setWeiboLink] = useState("");
    const [inviteRequired, setInviteRequired] = useState(false);
    const [myInviteCodes, setMyInviteCodes] = useState<Array<{ code: string; use_count: number; max_uses: number; is_active: boolean; used_by?: string }>>([]);
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [isAdmin, setIsAdmin] = useState(false);
    const [adminViewMode, setAdminViewMode] = useState<"admin" | "user">("admin");
    const [authToken, setAuthToken] = useState<string | null>(null);
    const [kickedMessage, setKickedMessage] = useState<string | null>(null);
    const [knobPos, setKnobPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
    const [showKnobMenu, setShowKnobMenu] = useState(false);
    const [knobDragging, setKnobDragging] = useState(false);

    // 新注册系统状态
    const [showAdminApp, setShowAdminApp] = useState(false);
    const [showNewAdmin, setShowNewAdmin] = useState(false);
    const [adminRole, setAdminRole] = useState<'super_admin' | 'review_admin' | 'ops_admin'>('super_admin');

    // Weibo verification state
    const [showWeiboVerify, setShowWeiboVerify] = useState(false);
    const [wbVerifyStep, setWbVerifyStep] = useState<"input" | "waiting" | "verified">("input");
    const [wbVerifyCode, setWbVerifyCode] = useState("");
    const [wbVerifyUid, setWbVerifyUid] = useState("");
    const [wbVerifyName, setWbVerifyName] = useState("");
    const [wbStep1Passed, setWbStep1Passed] = useState(false);
    const [wbStep2Passed, setWbStep2Passed] = useState(false);
    const [wbVerifyStatus, setWbVerifyStatus] = useState<"none" | "pending" | "verified" | "rejected">("none");
    const [adminTab, setAdminTab] = useState<"dashboard" | "cpchat" | "content" | "token" | "god" | "weibo" | "admins" | "invite">("dashboard");
    const [tokenBalance, setTokenBalance] = useState(100);

    const [tokenPricing, setTokenPricing] = useState({
        postImage: 5,
        viewPrivateChat: 10,
        aiChat: 3
    });

    const [tokenCostPer, setTokenCostPer] = useState(1);
    const [tokenTotalConsumed, setTokenTotalConsumed] = useState(12345);

    const [tokenUserRecords, setTokenUserRecords] = useState([{
        name: "小糖",
        level: 3,
        consumed: 5680,
        lastActive: "2分钟前"
    }, {
        name: "甜度满分",
        level: 5,
        consumed: 6665,
        lastActive: "15分钟前"
    }]);

    const [cpChatMessages, setCpChatMessages] = useState([{
        id: 1,
        from: "A",
        text: "今天想你了",
        time: "10:23"
    }, {
        id: 2,
        from: "B",
        text: "我也是，等下给你发糖",
        time: "10:25"
    }]);

    const [cpChatInput, setCpChatInput] = useState("");
    const [cpChatTarget, setCpChatTarget] = useState<"A" | "B">("A");
    const [cpChatRevealed, setCpChatRevealed] = useState(false);
    const [showCpChatPaywall, setShowCpChatPaywall] = useState(false);
    const [userLevel, setUserLevel] = useState(1);
    const [adminAnnouncement, setAdminAnnouncement] = useState("");
    const [adminHotSearchLocked, setAdminHotSearchLocked] = useState<number[]>([]);
    const [toast, setToast] = useState<{ message: string; show: boolean }>({ message: "", show: false });
    const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const appCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const touchStartX = useRef(0);
    const touchDeltaX = useRef(0);
    const isDragging = useRef(false);
    const mouseDownPending = useRef(false);
    const sliderRef = useRef<HTMLDivElement>(null);

    const [chatHistory, setChatHistory] = useState<ChatHistory>(() => {
        if (typeof window !== "undefined") {
            try {
                const saved = localStorage.getItem("phone_chat_history");

                if (saved) {
                    const parsed = JSON.parse(saved);

                    if (parsed._v !== 2) {
                        localStorage.removeItem("phone_chat_data");
                    } else if (parsed.dad && parsed.mom && parsed.family) {
                        const dedup = (msgs: Message[]) => {
                            const seen = new Set<number>();

                            return msgs.filter((m: Message) => {
                                if (seen.has(m.id))
                                    return false;

                                seen.add(m.id);
                                return true;
                            });
                        };

                        const reId = (msgs: Message[]) => msgs.map((m: Message) => ({
                            ...m,
                            id: nextId()
                        }));

                        return {
                            dad: reId(dedup(parsed.dad)),
                            mom: reId(dedup(parsed.mom)),
                            family: reId(dedup(parsed.family))
                        };
                    }
                }
            } catch {}
        }

        return {
            dad: [{
                from: "dad",
                text: "在吗，吃了没",
                id: nextId()
            }],

            mom: [{
                from: "mom",
                text: "宝贝~在干嘛呀",
                id: nextId()
            }],

            family: []
        };
    });

    useEffect(() => {
        try {
            const trimmed = {
                dad: chatHistory.dad.slice(-50),
                mom: chatHistory.mom.slice(-50),
                family: chatHistory.family.slice(-50)
            };

            localStorage.setItem("phone_chat_history", JSON.stringify({
                v: 2,
                data: trimmed
            }));
        } catch {}
    }, [chatHistory]);

    const [mounted, setMounted] = useState(false);
    const [unlockState, setUnlockState] = useState<UnlockState>(DEFAULT_UNLOCK_STATE);
    const [unlockAnimActive, setUnlockAnimActive] = useState(false);
    const dadLabel = unlockState.unlocked ? "爸爸" : DEFAULT_NAMES.dad1;
    const momLabel = unlockState.unlocked ? "妈咪" : DEFAULT_NAMES.dad2;

    useEffect(() => {
        try {
            const savedUnlock = localStorage.getItem("phone_unlock_state");

            if (savedUnlock) {
                const parsed = JSON.parse(savedUnlock);

                if (typeof parsed.unlocked === "boolean") setUnlockState({
                    ...DEFAULT_UNLOCK_STATE,
                    ...parsed
                });
            }

            const savedIdentity = localStorage.getItem("phone_identity_answers");

            if (savedIdentity) setUnlockState(prev => ({
                ...prev,
                identityAnswers: JSON.parse(savedIdentity)
            }));
        } catch {}

        setMounted(true);

        // 检查是否需要邀请码
        fetch("/api/auth", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "get_invite_settings" })
        })
        .then(r => r.json())
        .then(result => {
            if (result.success && result.data?.invite_required === "true") {
                setInviteRequired(true);
            }
        })
        .catch(() => {});

        // 自动登录：检查是否有有效的 token
        const savedToken = localStorage.getItem("auth_token");
        if (savedToken) {
            // 本地 mock 管理员 token 直接恢复，仅开发环境
            if (process.env.NODE_ENV !== "production" && savedToken.startsWith("mock_admin_")) {
                const mockUser = localStorage.getItem("mock_admin_user") || "admin";
                setIsAdmin(true);
                setIsLoggedIn(true);
                setAuthToken(savedToken);
                setAdminViewMode("admin");
                setAdminRole("super_admin");
                setLoginUsername(mockUser);
                const savedBio = localStorage.getItem("mimi_user_bio") || "";
                setUserBio(savedBio);
                setBioDraft(savedBio);
                setWeiboAccount(prev => ({
                    ...prev,
                    nickname: mockUser,
                    isSet: true
                }));
                return;
            }

            fetch("/api/auth", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "validate", token: savedToken })
            })
            .then(r => r.json())
            .then(result => {
                if (result.valid) {
                    const userData = result.data;
                    const isAdminUser = userData.isAdmin === true;
                    setIsAdmin(isAdminUser);
                    setIsLoggedIn(true);
                    setAuthToken(savedToken);
                    setLoginUsername(userData.username || "");
                    setUserBio(userData.userBio || "");
                    setBioDraft(userData.userBio || "");
                    localStorage.setItem("mimi_user_bio", userData.userBio || "");
                    setAdminViewMode(isAdminUser ? "admin" : "user");
                    if (userData.id) {
                        localStorage.setItem("userId", userData.id);
                    }
                    if (userData.role) {
                        localStorage.setItem("role", userData.role);
                    }
                    // 获取用户的邀请码
                    fetch("/api/auth", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ action: "list_my_invite_codes", token: savedToken })
                    })
                    .then(r => r.json())
                    .then(res => {
                        if (res.success) {
                            setMyInviteCodes(res.data || []);
                        }
                    })
                    .catch(() => {});
                    setWeiboAccount(prev => ({
                        ...prev,
                        nickname: userData.username || userData.displayName,
                        isSet: true
                    }));
                    if (!isAdminUser && !userData.weiboVerified) {
                        setShowWeiboVerify(true);
                    }
                    if (userData.isDefaultPassword) {
                        setDefaultPasswordTip(true);
                    }
                } else {
                    // Token 无效（可能被其他设备踢下线）
                    localStorage.removeItem("auth_token");
                    if (result.error?.includes("过期") || result.error?.includes("登录")) {
                        setKickedMessage("你的账号已在其他设备登录，当前设备已下线");
                    }
                }
            })
            .catch(() => {
                localStorage.removeItem("auth_token");
            });
        }
    }, []);

    // 加载 Dock 配置
    useEffect(() => {
        try {
            const savedDock = localStorage.getItem("phone_dock_apps_v1");
            if (savedDock) {
                const parsed = JSON.parse(savedDock) as string[];
                if (Array.isArray(parsed) && parsed.length >= 1 && parsed.length <= 5) {
                    setDockAppIds(parsed);
                }
            }
        } catch {}
    }, []);

    // 加载壁纸配置
    useEffect(() => {
        try {
            const savedWallpaper = localStorage.getItem("phone_wallpaper_v1");
            if (savedWallpaper && WALLPAPER_PRESETS[savedWallpaper]) {
                setWallpaper(savedWallpaper);
            }
        } catch {}
    }, []);

    // 加载悬浮旋钮位置
    useEffect(() => {
        try {
            const saved = localStorage.getItem("mimi_knob_position_v1");
            if (saved) {
                const parsed = JSON.parse(saved);
                if (typeof parsed.x === "number" && typeof parsed.y === "number") {
                    setKnobPos(parsed);
                }
            }
        } catch {}
    }, []);

    // 加载悬浮旋钮样式
    useEffect(() => {
        try {
            const saved = localStorage.getItem("mimi_knob_style_v1");
            if (saved && KNOB_STYLES.find((s) => s.id === saved)) {
                setKnobStyle(saved);
            }
        } catch {}
    }, []);

    // 加载已安装的应用商店应用
    useEffect(() => {
        try {
            const saved = localStorage.getItem("mimi_installed_apps_v1");
            if (saved) {
                const parsed = JSON.parse(saved) as Array<{ id: string; name: string; icon: string; route: string }>;
                if (Array.isArray(parsed)) {
                    setInstalledStoreApps(parsed);
                }
            }
        } catch {}
    }, []);

    // 监听 iframe 消息（关闭 APP）
    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            if (event.data?.type === "CLOSE_APP") {
                setCurrentApp(null);
            }
        };
        window.addEventListener("message", handleMessage);
        return () => window.removeEventListener("message", handleMessage);
    }, []);

    // 保存 Dock 配置
    useEffect(() => {
        try {
            localStorage.setItem("phone_dock_apps_v1", JSON.stringify(dockAppIds));
        } catch {}
    }, [dockAppIds]);

    useEffect(() => {
        if (mounted) {
            try {
                localStorage.setItem("phone_unlock_state", JSON.stringify(unlockState));
            } catch {}
        }
    }, [unlockState, mounted]);

    useEffect(() => {
        if (loginUsername) {
            setAccountDisplayName(loginUsername);
        }
    }, [loginUsername]);

    const [meSubPage, setMeSubPage] = useState<"main" | "settings" | "identity" | "unlock" | "about" | "invite" | "account" | "wallpaper" | "theme" | "change-password" | "knob-style" | "bio">("main");
    const [identityStep, setIdentityStep] = useState(0);
    const [debugMode, setDebugMode] = useState(false);
    const [debugLevel, setDebugLevel] = useState<number | "all" | null>(null);
    const [showDebugPanel, setShowDebugPanel] = useState(false);
    const debugClickCount = useRef(0);
    const debugClickTimer = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        if (!mounted)
            return;

        const {
            enabled,
            level
        } = parseDebugParams();

        if (enabled) {
            setDebugMode(true);
            setDebugLevel(level);

            if (level) {
                const applied = applyDebugLevel(level);

                if (applied.unlocked) {
                    setUnlockState(prev => ({
                        ...prev,
                        unlocked: true
                    }));
                }

                if (applied.adminAccess) {
                    setIsAdmin(true);
                    setAdminViewMode("admin");
                }

                setUserLevel(applied.userLevel);

                console.log(
                    `🔧 Debug mode ON - Level: ${level === "all" ? "ALL" : level} (${applied.levelName}), 用户等级: Lv.${applied.userLevel}`
                );
            } else {
                console.log("🔧 Debug mode ON - 无指定关卡，手动选择");
            }
        }
    }, [mounted]);

    useEffect(() => {
        if (!mounted)
            return;
        if (typeof document === "undefined")
            return;
        const appContent = document.querySelector(".app-content") as HTMLElement | null;
        if (appContent)
            appContent.scrollTop = 0;
        const iframes = document.querySelectorAll(".external-app-cache-iframe");
        iframes.forEach((iframe) => {
            const el = iframe as HTMLIFrameElement;
            if (el.contentWindow)
                el.contentWindow.scrollTo(0, 0);
        });
    }, [currentApp, mounted]);

    const knobDragStart = useRef<{ x: number; y: number; posX: number; posY: number } | null>(null);
    const knobRef = useRef<HTMLDivElement | null>(null);

    const handleKnobPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
        e.preventDefault();
        setKnobDragging(true);
        setShowKnobMenu(false);
        knobDragStart.current = {
            x: e.clientX,
            y: e.clientY,
            posX: knobPos.x,
            posY: knobPos.y,
        };
        if (knobRef.current) {
            knobRef.current.setPointerCapture(e.pointerId);
        }
    }, [knobPos.x, knobPos.y]);

    const handleKnobPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
        if (!knobDragging || !knobDragStart.current) return;
        const dx = e.clientX - knobDragStart.current.x;
        const dy = e.clientY - knobDragStart.current.y;
        setKnobPos({ x: knobDragStart.current.posX + dx, y: knobDragStart.current.posY + dy });
    }, [knobDragging]);

    const handleKnobPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
        setKnobDragging(false);
        if (knobRef.current) {
            knobRef.current.releasePointerCapture(e.pointerId);
        }
        try {
            localStorage.setItem("mimi_knob_position_v1", JSON.stringify(knobPos));
        } catch {}
    }, [knobPos]);

    const handleKnobClick = useCallback(() => {
        if (knobDragging) return;
        setShowKnobMenu((v) => !v);
    }, [knobDragging]);

    const handleKnobBack = useCallback(() => {
        setShowKnobMenu(false);
        if (currentApp) {
            setAppClosing(true);
            setTimeout(() => {
                setCurrentApp(null);
                setAppClosing(false);
            }, 220);
        }
    }, [currentApp]);

    const handleKnobHome = useCallback(() => {
        setShowKnobMenu(false);
        setAppClosing(true);
        setTimeout(() => {
            setCurrentApp(null);
            setAppClosing(false);
        }, 220);
    }, []);

    const handleChangePassword = useCallback(async () => {
        const hasUpper = /[A-Z]/.test(changePasswordNew);
        const hasLower = /[a-z]/.test(changePasswordNew);
        const hasNumber = /\d/.test(changePasswordNew);
        const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(changePasswordNew);
        const isStrong = changePasswordNew.length >= 8 && hasUpper && hasLower && hasNumber && hasSpecial;
        const isMatch = changePasswordNew && changePasswordNew === changePasswordConfirm;

        if (!isStrong) {
            setChangePasswordMessage("密码至少8位且包含大写、小写、数字和特殊字符");
            return;
        }
        if (!isMatch) {
            setChangePasswordMessage("两次输入的新密码不一致");
            return;
        }
        setChangePasswordLoading(true);
        setChangePasswordMessage("");
        const token = localStorage.getItem("auth_token");
        try {
            const res = await fetch("/api/auth", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "change_password",
                    token,
                    currentPassword: changePasswordCurrent.trim(),
                    newPassword: changePasswordNew
                })
            });
            const json = await res.json();
            if (json.success) {
                setChangePasswordMessage("修改成功，请重新登录");
                localStorage.removeItem("auth_token");
                setIsLoggedIn(false);
                setIsAdmin(false);
                setCurrentApp(null);
                setMeSubPage("main");
                setLoginUsername("");
                setLoginPassword("");
                setChangePasswordCurrent("");
                setChangePasswordNew("");
                setChangePasswordConfirm("");
                setTimeout(() => {
                    setChangePasswordMessage("");
                }, 1500);
            } else {
                setChangePasswordMessage(json.error || "修改失败");
            }
        } catch (e) {
            setChangePasswordMessage("网络错误");
        } finally {
            setChangePasswordLoading(false);
        }
    }, [changePasswordCurrent, changePasswordNew, changePasswordConfirm]);

    const handleDebugTitleClick = useCallback(() => {
        if (!DEBUG_ENABLED || debugMode)
            return;

        debugClickCount.current += 1;

        if (debugClickTimer.current)
            clearTimeout(debugClickTimer.current);

        if (debugClickCount.current >= 5) {
            setDebugMode(true);
            setShowDebugPanel(true);
            debugClickCount.current = 0;
            console.log("🔧 Debug panel activated via 5-click");
        } else {
            debugClickTimer.current = setTimeout(() => {
                debugClickCount.current = 0;
            }, 2000);
        }
    }, [debugMode]);

    useEffect(() => {
        if (!showDebugPanel)
            return;

        const handleKey = (e: KeyboardEvent) => {
            if (e.key === "Escape")
                setShowDebugPanel(false);
        };

        window.addEventListener("keydown", handleKey);
        return () => window.removeEventListener("keydown", handleKey);
    }, [showDebugPanel]);

    const [weiboSim, setWeiboSim] = useState({
        heat: 23000,
        likes: 18000,
        comments: 4200,
        reposts: 6000,

        currentHashtag: null as {
            text: string;
            tier: string;
            heat: number;
        } | null,

        subHashtags: [] as {
            text: string;
            tier: string;
            heat: number;
        }[],

        timeline: "刚刚",
        simComments: [] as ReturnType<typeof generateSimComments>,
        easterEgg: null as ReturnType<typeof rollEasterEgg>,

        superTopic: {
            name: "田雷梓渝超话",
            checkInCount: 98000,
            postCount: 1350000,
            fansCount: 650000,
            rank: 2
        }
    });

    const [weiboRefreshing, setWeiboRefreshing] = useState(false);
    const [lastNewsUpdate, setLastNewsUpdate] = useState("2025.07 第1周");
    const weiboRefreshTimer = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        if (!mounted)
            return;

        const doRefresh = async () => {
            try {
                const res = await fetch("/api/weibo/refresh");

                if (res.ok) {
                    const json = await res.json();

                    if (json.success) {
                        setWeiboSim(prev => ({
                            ...prev,
                            heat: json.data.heat,
                            likes: json.data.likes,
                            comments: json.data.comments,
                            reposts: json.data.reposts,
                            currentHashtag: json.data.currentHashtag,
                            subHashtags: json.data.subHashtags,
                            timeline: json.data.timeline,
                            simComments: json.data.simComments,
                            easterEgg: json.data.easterEgg,
                            superTopic: json.data.superTopic
                        }));
                    }
                }
            } catch {}
        };

        doRefresh();
        weiboRefreshTimer.current = setInterval(doRefresh, 30000);

        return () => {
            if (weiboRefreshTimer.current)
                clearInterval(weiboRefreshTimer.current);
        };
    }, [mounted]);

    const [newsUpdateInfo, setNewsUpdateInfo] = useState("检测中…");

    useEffect(() => {
        if (!mounted)
            return;

        const checkNews = async () => {
            try {
                const res = await fetch("/api/news/refresh");

                if (res.ok) {
                    const json = await res.json();

                    if (json.success) {
                        setNewsUpdateInfo(json.data.lastUpdated);
                    }
                }
            } catch {
                setNewsUpdateInfo("（离线）");
            }
        };

        checkNews();
    }, [mounted]);

    const [publicMemories, setPublicMemories] = useState<Record<string, string[]>>({});
    const chatMemoryRef = useRef<ReturnType<typeof loadChatMemory>>(null);
    const publicMemoriesRef = useRef<Record<string, string[]>>({});

    useEffect(() => {
        if (!mounted)
            return;

        const CACHE_KEY = "public_memories_cache";
        const CACHE_TIME_KEY = "public_memories_cache_time";
        const CACHE_TTL = 5 * 60 * 1000;

        const loadPublicMemories = async () => {
            try {
                const cached = localStorage.getItem(CACHE_KEY);
                const cachedTime = localStorage.getItem(CACHE_TIME_KEY);

                if (cached && cachedTime && Date.now() - parseInt(cachedTime) < CACHE_TTL) {
                    const data = JSON.parse(cached);
                    setPublicMemories(data);
                    publicMemoriesRef.current = data;
                    return;
                }

                const res = await fetch("/api/admin/memory?action=list");

                if (res.ok) {
                    const data = await res.json();
                    const grouped: Record<string, string[]> = {};

                    for (const m of data.memories || []) {
                        const cat = m.category || "general";

                        if (!grouped[cat])
                            grouped[cat] = [];

                        grouped[cat].push(m.content);
                    }

                    setPublicMemories(grouped);
                    publicMemoriesRef.current = grouped;
                    localStorage.setItem(CACHE_KEY, JSON.stringify(grouped));
                    localStorage.setItem(CACHE_TIME_KEY, String(Date.now()));
                }
            } catch {}
        };

        loadPublicMemories();
    }, [mounted]);

    useEffect(() => {
        if (!isLoggedIn || !loginUsername)
            return;

        chatMemoryRef.current = loadChatMemory(loginUsername);
    }, [isLoggedIn, loginUsername]);

    const buildMemoryContext = useCallback(() => {
        const parts: string[] = [];
        const recent = getRecentMemories(loginUsername, 5);

        if (recent.length > 0) {
            parts.push("【用户聊天记忆】");

            for (const m of recent) {
                parts.push(`- [${m.category}] ${m.content}`);
            }
        }

        const pm = publicMemoriesRef.current;
        const pmKeys = Object.keys(pm);

        if (pmKeys.length > 0) {
            parts.push("【公共世界记忆】");

            for (const cat of pmKeys) {
                const items = pm[cat].slice(-3);

                for (const item of items) {
                    parts.push(`- [${cat}] ${item}`);
                }
            }
        }

        return parts.join("\n");
    }, []);

    const [identityInput, setIdentityInput] = useState("");
    const [unlockInput1, setUnlockInput1] = useState("");
    const [unlockInput2, setUnlockInput2] = useState("");
    const [nicknameInput1, setNicknameInput1] = useState("");
    const [nicknameInput2, setNicknameInput2] = useState("");
    const [adminInput, setAdminInput] = useState("");
    const [chatInput, setChatInput] = useState("");
    const [isSending, setIsSending] = useState(false);
    const [typingWho, setTypingWho] = useState<string | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const autoChatTimerRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        function tick() {
            const now = new Date();
            const h = String(now.getHours()).padStart(2, "0");
            const m = String(now.getMinutes()).padStart(2, "0");
            setTime(h + ":" + m);
            const days = ["日", "一", "二", "三", "四", "五", "六"];
            setDateStr(`${now.getMonth() + 1}月${now.getDate()}日 星期${days[now.getDay()]}`);
            setParentStatus(getParentStatus(now.getHours()));
        }

        tick();
        const interval = setInterval(tick, 30000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({
            behavior: "smooth"
        });
    }, [chatHistory, typingWho]);

    const lastUserMsgTimeRef = useRef(Date.now());
    const lastHeartbeatMsgTimeRef = useRef(0);

    useEffect(() => {
        lastUserMsgTimeRef.current = Date.now();
    }, [chatHistory.family, chatHistory.dad, chatHistory.mom]);

    useEffect(() => {
        function scheduleHeartbeat() {
            const hour = new Date().getHours();
            const isDaytime = hour >= 7 && hour < 23;
            const delay = isDaytime ? 180000 + Math.random() * 180000 : 480000 + Math.random() * 420000;

            autoChatTimerRef.current = setTimeout(async () => {
                const currentHour = new Date().getHours();

                if (currentHour >= 23 || currentHour < 7) {
                    scheduleHeartbeat();
                    return;
                }

                const minsSinceUser = (Date.now() - lastUserMsgTimeRef.current) / 60000;

                if (minsSinceUser < 5) {
                    scheduleHeartbeat();
                    return;
                }

                const minsSinceHeartbeat = (Date.now() - lastHeartbeatMsgTimeRef.current) / 60000;

                if (minsSinceHeartbeat < 10) {
                    scheduleHeartbeat();
                    return;
                }

                try {
                    const recentMsgs = chatHistory.family?.slice(-10).map(m => ({
                        from: m.from,
                        text: m.text
                    })) || [];

                    const res = await fetch("/api/heartbeat", {
                        method: "POST",

                        headers: {
                            "Content-Type": "application/json"
                        },

                        body: JSON.stringify({
                            recentMessages: recentMsgs,
                            currentApp
                        })
                    });

                    if (res.ok) {
                        const data = await res.json();

                        if (data.shouldAct && data.messages?.length > 0) {
                            lastHeartbeatMsgTimeRef.current = Date.now();

                            for (const msg of data.messages) {
                                const isPartnerChat = msg.toPartner === true;
                                const delayMs = isPartnerChat ? msg === data.messages[0] ? 500 : 1500 + Math.random() * 2000 : msg.speaker === data.messages[0]?.speaker ? 1000 : 2000 + Math.random() * 2000;
                                await new Promise(r => setTimeout(r, delayMs));
                                const speakerKey: "dad" | "mom" = msg.speaker === "mom" ? "mom" : "dad";
                                const parts = splitAiMessage(msg.text);

                                for (let pi = 0; pi < parts.length; pi++) {
                                    if (pi > 0) {
                                        await new Promise(r => setTimeout(r, 1000 + Math.random() * 1000));
                                    }

                                    if (isPartnerChat) {
                                        setChatHistory(prev => ({
                                            ...prev,

                                            family: [...prev.family, {
                                                from: speakerKey,
                                                text: parts[pi],
                                                id: nextId()
                                            }]
                                        }));
                                    } else {
                                        const privateMsg = {
                                            from: speakerKey,
                                            text: parts[pi],
                                            id: nextId()
                                        };

                                        const familyMsg = {
                                            from: speakerKey,
                                            text: parts[pi],
                                            id: nextId()
                                        };

                                        setChatHistory(prev => ({
                                            ...prev,
                                            [speakerKey]: [...prev[speakerKey], privateMsg],
                                            family: [...prev.family, familyMsg]
                                        }));
                                    }
                                }
                            }
                        }
                    }
                } catch {}

                scheduleHeartbeat();
            }, delay);
        }

        scheduleHeartbeat();

        return () => {
            if (autoChatTimerRef.current)
                clearTimeout(autoChatTimerRef.current);
        };
    }, [currentApp]);

    function splitAiMessage(text: string): string[] {
        const trimmed = text.trim();

        if (!trimmed)
            return [trimmed];

        if (trimmed.length <= 6)
            return [trimmed];

        if (trimmed.includes("|||")) {
            const parts = trimmed.split("|||").map(s => s.trim()).filter(s => s.length > 0);

            if (parts.length >= 1)
                return parts.slice(0, 4);
        }

        const sentences: string[] = [];
        let current = "";

        for (let i = 0; i < trimmed.length; i++) {
            current += trimmed[i];
            const ch = trimmed[i];
            const isBreakPunct = /[。！？…~～\n]/.test(ch);
            const isCommaBreak = /[，；,;]/.test(ch);
            const nextCh = trimmed[i + 1] || "";
            const isTurnWord = /[但是不过然而可是而且然后接着所以]/.test(nextCh);

            if (isBreakPunct || isCommaBreak && isTurnWord) {
                sentences.push(current.trim());
                current = "";
            }
        }

        if (current.trim())
            sentences.push(current.trim());

        if (sentences.length <= 1) {
            if (trimmed.length <= 15)
                return [trimmed];

            const commaParts = trimmed.split(/[，,]/);

            if (commaParts.length >= 2 && commaParts.every(p => p.trim().length > 0)) {
                const result: string[] = [];
                let buf = "";

                for (const part of commaParts) {
                    if (buf && (buf + part).length > 20) {
                        result.push(buf.trim());
                        buf = part;
                    } else {
                        buf = buf ? buf + "，" + part : part;
                    }
                }

                if (buf.trim())
                    result.push(buf.trim());

                return result.slice(0, 4);
            }

            return [trimmed];
        }

        const merged: string[] = [];

        for (const s of sentences) {
            if (merged.length > 0 && s.length < 3) {
                merged[merged.length - 1] += s;
            } else {
                merged.push(s);
            }
        }

        if (merged.length <= 4)
            return merged;

        const result: string[] = [];
        let buf = "";

        for (const s of merged) {
            if (result.length >= 3) {
                buf = buf ? buf + s : s;
            } else if ((buf + s).length > 25 && result.length < 3) {
                if (buf)
                    result.push(buf);

                buf = s;
            } else {
                buf = buf ? buf + s : s;
            }
        }

        if (buf.trim())
            result.push(buf.trim());

        return result.slice(0, 4);
    }

    async function addSplitMessages(
        character: "dad" | "mom" | "family",
        speaker: "dad" | "mom",
        fullText: string
    ) {
        const parts = splitAiMessage(fullText);

        for (let i = 0; i < parts.length; i++) {
            if (i > 0) {
                await new Promise(r => setTimeout(r, 1000 + Math.random() * 1000));
            }

            setChatHistory(prev => ({
                ...prev,

                [character]: [...prev[character], {
                    from: speaker,
                    text: parts[i],
                    id: nextId()
                }]
            }));
        }
    }

    async function loadMyInviteCodes() {
        try {
            const token = localStorage.getItem("auth_token");
            if (!token) return;
            const res = await fetch("/api/auth", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "list_my_invite_codes", token })
            });
            const json = await res.json();
            if (json.success) {
                setMyInviteCodes(json.data || []);
            }
        } catch (e) {
            console.error("加载邀请码失败:", e);
        }
    }

    const handleLogin = async () => {
        const username = loginUsername.trim();
        const password = loginPassword.trim();

        if (!username) {
            setLoginError("请输入用户名");
            return;
        }
        if (!password) {
            setLoginError("请输入密码");
            return;
        }
        if (loginMode === "register") {
            if (!invitationCode.trim()) {
                setLoginError("请输入邀请码");
                return;
            }
            if (!registerWeiboName.trim()) {
                setLoginError("请输入微博昵称");
                return;
            }
            if (!weiboLink.trim()) {
                setLoginError("请填写微博主页链接");
                return;
            }
        }

        setLoginError("");
        // Mock 管理员账号验证（仅开发环境）
        if (process.env.NODE_ENV !== "production") {
            const MOCK_ADMINS: Record<string, string> = {
                "admin": "admin123",
                "manager_lin": "admin123",
                "cp_official": "admin123"
            };
            if (MOCK_ADMINS[username.toLowerCase()] === password) {
                setIsAdmin(true);
                setIsLoggedIn(true);
                setAdminViewMode("admin");
                setAdminRole("super_admin");
                setLoginLoading(false);
                const mockToken = `mock_admin_${username}_${Date.now()}`;
                setAuthToken(mockToken);
                localStorage.setItem("auth_token", mockToken);
                localStorage.setItem("mock_admin_user", username);
                setDefaultPasswordTip(true);
                return;
            }
        }
        setLoginLoading(true);

        try {
            const res = await fetch("/api/auth", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: loginMode,
                    username,
                    password,
                    weiboName: loginMode === "register" ? registerWeiboName.trim() : undefined,
                    weiboLink: loginMode === "register" ? weiboLink.trim() : undefined,
                    invitationCode: loginMode === "register" ? invitationCode.trim() : undefined,
                })
            });
            const result = await res.json();

            if (!result.success) {
                setLoginError(result.error || "操作失败");
                setLoginLoading(false);
                return;
            }

            // 注册成功后进入待审核状态
            if (loginMode === "register" && result.pending) {
                setAdminPendingMsg(result.message || "注册成功，账号正在审核中，请耐心等待管理员通过后再登录");
                setLoginLoading(false);
                setLoginPassword("");
                setInvitationCode("");
                setRegisterWeiboName("");
                setWeiboLink("");
                return;
            }

            // Login/Register successful
            const isAdminUser = result.data?.isAdmin === true;
            setIsAdmin(isAdminUser);
            setIsLoggedIn(true);
            setLoginUsername(username);
            setUserBio(result.data?.userBio || "");
            setBioDraft(result.data?.userBio || "");
            localStorage.setItem("mimi_user_bio", result.data?.userBio || "");
            setAdminViewMode(isAdminUser ? "admin" : "user");

            // 保存登录 token（单设备登录）
            if (result.data?.token) {
                setAuthToken(result.data.token);
                localStorage.setItem("auth_token", result.data.token);
                localStorage.removeItem("mock_admin_user");
            }
            if (result.data?.id) {
                localStorage.setItem("userId", result.data.id);
            }
            if (result.data?.role) {
                localStorage.setItem("role", result.data.role);
            }

            if (result.data?.isDefaultPassword) {
                setDefaultPasswordTip(true);
            }

            loadMyInviteCodes();

            setWeiboAccount(prev => ({
                ...prev,
                nickname: username,
                isSet: true
            }));

            // For non-admin users, check Weibo verification status
            if (!isAdminUser) {
                try {
                    const verifyRes = await fetch(`/api/weibo-verify?username=${encodeURIComponent(username)}`);
                    const verifyResult = await verifyRes.json();
                    if (verifyResult.data && verifyResult.data.status === "verified") {
                        setWbVerifyStatus("verified");
                        setWbStep1Passed(true);
                        setWbStep2Passed(true);
                        setShowWeiboVerify(false);
                        setWbVerifyCode(verifyResult.data.verification_code);
                        setWbVerifyUid(verifyResult.data.weibo_uid || "");
                        setWbVerifyName(verifyResult.data.weibo_name || "");
                        setWbStep1Passed(verifyResult.data.step1_passed);
                        setWbStep2Passed(verifyResult.data.step2_passed);
                        setWbVerifyStep("waiting");
                        setWbVerifyStatus("pending");
                        setShowWeiboVerify(true);
                    } else {
                        setWbVerifyStep("input");
                        setWbVerifyStatus("none");
                        setShowWeiboVerify(true);
                    }
                } catch (verifyErr) {
                    console.error("微博验证失败:", verifyErr);
                    setWbVerifyStep("input");
                    setWbVerifyStatus("none");
                    setShowWeiboVerify(true);
                }
            }

            setLoginPassword("");
        } catch (err) {
            console.error("登录/注册失败:", err);
            setLoginError("网络错误，请重试");
        } finally {
            setLoginLoading(false);
        }
    };

    // Weibo verification functions
    const initWeiboVerify = async () => {
        try {
            const res = await fetch("/api/weibo-verify", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "init",
                    username: loginUsername.trim(),
                    weiboUid: wbVerifyUid,
                    weiboName: wbVerifyName
                })
            });
            const result = await res.json();
            if (result.data) {
                setWbVerifyCode(result.data.verification_code);
                setWbVerifyStep("waiting");
                setWbVerifyStatus("pending");
            }
        } catch (e) {
            console.error("Init weibo verify failed:", e);
        }
    };

    const checkWeiboVerifyStatus = async () => {
        try {
            const res = await fetch(`/api/weibo-verify?username=${encodeURIComponent(loginUsername.trim())}`);
            const result = await res.json();
            if (result.data) {
                setWbStep1Passed(result.data.step1_passed);
                setWbStep2Passed(result.data.step2_passed);
                setWbVerifyCode(result.data.verification_code);
                if (result.data.status === "verified") {
                    setWbVerifyStep("verified");
                    setWbVerifyStatus("verified");
                    setShowWeiboVerify(false);
                } else if (result.data.status === "rejected") {
                    setWbVerifyStatus("rejected");
                } else {
                    setWbVerifyStep("waiting");
                    setWbVerifyStatus("pending");
                }
            }
        } catch {
            // 微博验证 API 失败，默认显示验证页面
            setWbVerifyStep("input");
            setWbVerifyStatus("none");
            setShowWeiboVerify(true);
        }
    };

    const submitWeiboInfo = async () => {
        if (!wbVerifyUid.trim()) return;
        try {
            const res = await fetch("/api/weibo-verify", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "submit_code",
                    username: loginUsername.trim(),
                    weiboUid: wbVerifyUid.trim(),
                    weiboName: wbVerifyName.trim()
                })
            });
            const result = await res.json();
            if (result.data) {
                setWbVerifyStep("waiting");
                setWbVerifyStatus("pending");
            }
        } catch (e) {
            console.error("Submit weibo info failed:", e);
        }
    };

    const consumeToken = (amount: number, reason: string): boolean => {
        if (tokenBalance < amount) {
            alert(`Token 不足！${reason}需要 ${amount} Token，当前余额 ${tokenBalance}。请充值。`);
            return false;
        }

        setTokenBalance(prev => prev - amount);
        setTokenTotalConsumed(prev => prev + amount);
        return true;
    };

    const handleAdminSetCpChat = () => {
        if (!cpChatInput.trim())
            return;

        const newMsg = {
            id: Date.now(),
            from: cpChatTarget,
            text: cpChatInput.trim(),

            time: new Date().toLocaleTimeString("zh-CN", {
                hour: "2-digit",
                minute: "2-digit"
            })
        };

        setCpChatMessages(prev => [...prev, newMsg]);
        setCpChatInput("");
    };

    const cpSugarSentences = useRef([{
        from: "A" as const,
        text: "今天也辛苦了，回来给你揉肩"
    }, {
        from: "B" as const,
        text: "你做的早餐好好吃~谢谢"
    }, {
        from: "A" as const,
        text: "想吃什么？下班顺路买"
    }, {
        from: "B" as const,
        text: "你昨天是不是又偷偷看我手机了"
    }, {
        from: "A" as const,
        text: "没有，我光明正大看的"
    }, {
        from: "B" as const,
        text: "哼，讨厌，但是也喜欢你"
    }, {
        from: "A" as const,
        text: "明天下雨，我送你上班"
    }, {
        from: "B" as const,
        text: "好呀好呀，那你早点起~"
    }, {
        from: "A" as const,
        text: "你靠我身上看电影的样子好可爱"
    }, {
        from: "B" as const,
        text: "才不是故意的呢..."
    }, {
        from: "A" as const,
        text: "周末带你去吃那家新开的火锅"
    }, {
        from: "B" as const,
        text: "真的吗！我爱死你了！"
    }]);

    const cpSugarIdx = useRef(0);

    useEffect(() => {
        if (!isLoggedIn || isAdmin)
            return;

        const timer = setInterval(() => {
            const sentences = cpSugarSentences.current;
            const idx = cpSugarIdx.current % sentences.length;
            const sentence = sentences[idx];
            cpSugarIdx.current++;

            const newMsg = {
                id: Date.now() + Math.random(),
                from: sentence.from,
                text: sentence.text,

                time: new Date().toLocaleTimeString("zh-CN", {
                    hour: "2-digit",
                    minute: "2-digit"
                })
            };

            setCpChatMessages(prev => [...prev, newMsg]);
            setTokenTotalConsumed(prev => prev + 0);
        }, 120000 + Math.random() * 180000);

        return () => clearInterval(timer);
    }, [isLoggedIn, isAdmin]);

    const [isEditing, setIsEditing] = useState(false);
    const [selectedAppId, setSelectedAppId] = useState<string | null>(null);
    const [homeAppIds, setHomeAppIds] = useState<string[]>(() => FIRST_PAGE_APPS.map(a => a.id));
    const appGridRef = useRef<HTMLDivElement | null>(null);
    const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const [dragItem, setDragItem] = useState<number | null>(null);
    const edgeHoverTimerRef = useRef<NodeJS.Timeout | null>(null);

    const saveAppOrder = useCallback(() => {
        if (typeof window === "undefined")
            return;

        try {
            const firstPageIds = homeAppIds.filter(id => FIRST_PAGE_APPS.some(a => a.id === id));
            localStorage.setItem("phone_app_order_v4", JSON.stringify(firstPageIds));
        } catch {}
    }, [homeAppIds]);

    const enterEditMode = useCallback(() => {
        if (isEditing)
            return;
        setIsEditing(true);
    }, [isEditing]);

    const exitEditMode = useCallback(() => {
        if (!isEditing)
            return;
        setIsEditing(false);
        setSelectedAppId(null);
        setIsDockReplacing(false);
        saveAppOrder();
    }, [isEditing, saveAppOrder]);

    const addToDock = useCallback((appId: string) => {
        if (!appId)
            return;

        setDockAppIds(prev => {
            if (prev.includes(appId))
                return prev;

            if (prev.length < 5) {
                const next = [...prev, appId];

                try {
                    localStorage.setItem("phone_dock_apps_v1", JSON.stringify(next));
                } catch {}

                return next;
            }

            setIsDockReplacing(true);
            return prev;
        });
    }, []);

    const replaceDockApp = useCallback((targetId: string) => {
        if (!selectedAppId || !isDockReplacing)
            return;

        setDockAppIds(prev => {
            const idx = prev.indexOf(targetId);

            if (idx === -1)
                return prev;

            const next = [...prev];

            next[idx] = selectedAppId;

            try {
                localStorage.setItem("phone_dock_apps_v1", JSON.stringify(next));
            } catch {}

            return next;
        });
        setIsDockReplacing(false);
        setSelectedAppId(null);
    }, [selectedAppId, isDockReplacing]);

    useEffect(() => {
        if (typeof window === "undefined")
            return;

        try {
            const saved = localStorage.getItem("phone_app_order_v4");

            if (saved) {
                const order = JSON.parse(saved) as string[];
                const valid = order.filter(id => FIRST_PAGE_APPS.some(a => a.id === id));
                const remaining = FIRST_PAGE_APPS.filter(a => !valid.includes(a.id)).map(a => a.id);
                setHomeAppIds([...valid, ...remaining]);
            } else {
                setHomeAppIds(FIRST_PAGE_APPS.map(a => a.id));
            }
        } catch {
            setHomeAppIds(FIRST_PAGE_APPS.map(a => a.id));
        }
    }, []);

    const handleAppItemClick = useCallback((appId: string) => {
        const isFirstPage = FIRST_PAGE_APPS.some(a => a.id === appId);

        if (!isEditing) {
            openApp(appId);
            return;
        }

        if (!isFirstPage)
            return;

        if (!selectedAppId) {
            setSelectedAppId(appId);
            return;
        }

        if (selectedAppId === appId) {
            setSelectedAppId(null);
            return;
        }

        setHomeAppIds(prev => {
            const next = [...prev];
            const i1 = next.indexOf(selectedAppId);
            const i2 = next.indexOf(appId);

            if (i1 >= 0 && i2 >= 0) {
                [next[i1], next[i2]] = [next[i2], next[i1]];
            }

            return next;
        });
        setSelectedAppId(null);
    }, [isEditing, selectedAppId, openApp]);

    const startLongPress = useCallback((target: HTMLElement) => {
        if (isEditing)
            return;

        const appItem = target.closest(".app-item");

        if (!appItem)
            return;

        longPressTimerRef.current = setTimeout(() => {
            setIsEditing(true);

            if (typeof navigator !== "undefined" && navigator.vibrate) {
                navigator.vibrate(50);
            }
        }, 500);
    }, [isEditing]);

    const clearLongPress = useCallback(() => {
        if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
        }
    }, []);

    const handleGridPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
        startLongPress(e.target as HTMLElement);
    }, [startLongPress]);

    const handleGridPointerUp = useCallback(() => {
        clearLongPress();
    }, [clearLongPress]);

    const handleGridPointerMove = useCallback(() => {
        clearLongPress();
    }, [clearLongPress]);

    const handleGridContextMenu = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        e.preventDefault();
    }, []);

    const handleTouchStart = useCallback((e: React.TouchEvent) => {
        if (dragItem !== null)
            return;

        touchStartX.current = e.touches[0].clientX;
        isDragging.current = true;
    }, [dragItem]);

    const handleTouchMove = useCallback((e: React.TouchEvent) => {
        if (dragItem !== null || !isDragging.current)
            return;

        touchDeltaX.current = e.touches[0].clientX - touchStartX.current;

        if (sliderRef.current) {
            const offset = -currentPage * 100;
            const pxToPercent = touchDeltaX.current / sliderRef.current.parentElement!.offsetWidth * 100;
            sliderRef.current.style.transition = "none";
            sliderRef.current.style.transform = `translateX(${offset + pxToPercent}%)`;
        }
    }, [currentPage, dragItem]);

    const handleTouchEnd = useCallback(() => {
        if (dragItem !== null)
            return;

        if (!isDragging.current)
            return;

        isDragging.current = false;

        if (sliderRef.current) {
            const threshold = sliderRef.current.parentElement!.offsetWidth * 0.15;
            let newPage = currentPage;

            if (touchDeltaX.current < -threshold && currentPage < 1)
                newPage = currentPage + 1;
            else if (touchDeltaX.current > threshold && currentPage > 0)
                newPage = currentPage - 1;

            setCurrentPage(newPage);
            sliderRef.current.style.transition = "transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)";
            sliderRef.current.style.transform = `translateX(${-newPage * 100}%)`;
        }

        touchDeltaX.current = 0;
    }, [currentPage, dragItem]);

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        touchStartX.current = e.clientX;
        touchDeltaX.current = 0;
        isDragging.current = false;
        mouseDownPending.current = true;
    }, []);

    useEffect(() => {
        const onMouseMove = (e: MouseEvent) => {
            if (!mouseDownPending.current && !isDragging.current)
                return;

            const delta = e.clientX - touchStartX.current;

            if (mouseDownPending.current && Math.abs(delta) > 5) {
                mouseDownPending.current = false;
                isDragging.current = true;
            }

            if (!isDragging.current)
                return;

            touchDeltaX.current = delta;

            if (sliderRef.current) {
                const offset = -currentPage * 100;
                const pxToPercent = delta / sliderRef.current.parentElement!.offsetWidth * 100;
                sliderRef.current.style.transition = "none";
                sliderRef.current.style.transform = `translateX(${offset + pxToPercent}%)`;
            }
        };

        const onMouseUp = () => {
            if (!isDragging.current && !mouseDownPending.current)
                return;

            mouseDownPending.current = false;

            if (!isDragging.current)
                return;

            isDragging.current = false;

            if (sliderRef.current) {
                const threshold = sliderRef.current.parentElement!.offsetWidth * 0.15;
                let newPage = currentPage;

                if (touchDeltaX.current < -threshold && currentPage < 1)
                    newPage = currentPage + 1;
                else if (touchDeltaX.current > threshold && currentPage > 0)
                    newPage = currentPage - 1;

                setCurrentPage(newPage);
                sliderRef.current.style.transition = "transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)";
                sliderRef.current.style.transform = `translateX(${-newPage * 100}%)`;
            }

            touchDeltaX.current = 0;
        };

        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("mouseup", onMouseUp);

        return () => {
            window.removeEventListener("mousemove", onMouseMove);
            window.removeEventListener("mouseup", onMouseUp);
        };
    }, [currentPage]);

    function showToast(message: string) {
        if (toastTimerRef.current)
            clearTimeout(toastTimerRef.current);
        setToast({ message, show: true });
        toastTimerRef.current = setTimeout(() => setToast({ message: "", show: false }), 2000);
    }

    function openApp(appId: string) {
        const isSecondPage = SECOND_PAGE_APPS.some(a => a.id === appId);
        const isInstalledFromStore = installedStoreApps.some(a => a.id === appId);

        if (isSecondPage && !isAdmin && !isInstalledFromStore) {
            showToast("装修中，敬请期待");
            return;
        }

        if (appId === "settings") {
            setCurrentApp("me");
            setMeSubPage("settings");
            setAppClosing(false);
            return;
        }

        setCurrentApp(appId);
        setAppClosing(false);

        if (appId === "me")
            setMeSubPage("main");
    }

    function closeApp() {
        if (appClosing) return;
        setAppClosing(true);

        if (appCloseTimerRef.current)
            clearTimeout(appCloseTimerRef.current);
        appCloseTimerRef.current = setTimeout(() => {
            setCurrentApp(null);
            setAppClosing(false);
            appCloseTimerRef.current = null;
        }, 250);
    }

    async function readSSEStream(res: Response, onChunk: (text: string) => void) {
        const reader = res.body?.getReader();
        const decoder = new TextDecoder();
        let aiText = "";

        if (!reader)
            return aiText;

        while (true) {
            const {
                done,
                value
            } = await reader.read();

            if (done)
                break;

            const chunk = decoder.decode(value, {
                stream: true
            });

            const lines = chunk.split("\n");

            for (const line of lines) {
                if (line.startsWith("data: ")) {
                    const data = line.slice(6);

                    if (data === "[DONE]")
                        break;

                    try {
                        const parsed = JSON.parse(data);

                        if (parsed.content) {
                            aiText += parsed.content;
                            onChunk(aiText);
                        }
                    } catch {}
                }
            }
        }

        return aiText;
    }

    async function sendChat(character: "dad" | "mom" | "family") {
        if (!chatInput.trim() || isSending)
            return;

        const userMsg = chatInput.trim();
        setChatInput("");
        setIsSending(true);
        lastUserMsgTimeRef.current = Date.now();

        setChatHistory(prev => ({
            ...prev,

            [character]: [...prev[character], {
                from: "me",
                text: userMsg,
                id: nextId()
            }]
        }));

        try {
            const history = chatHistory[character].filter(m => m.from !== "system").slice(-20).map(m => ({
                role: m.from === "me" ? "user" : "assistant" as "user" | "assistant",
                content: m.from === "me" ? m.text : `${m.from === "dad" ? "田雷" : "梓渝"}：${m.text}`
            }));

            const isBusy = (who: "dad" | "mom") => {
                const s = who === "dad" ? parentStatus.dadStatus : parentStatus.momStatus;
                return s.includes("忙碌") || s.includes("🔴");
            };

            const isOut = (who: "dad" | "mom") => {
                const s = who === "dad" ? parentStatus.dadStatus : parentStatus.momStatus;
                return s.includes("出门") || s.includes("🟡");
            };

            const isLateNight = () => {
                const h = new Date().getHours();
                return h >= 23 || h < 7;
            };

            const getDelay = (who: "dad" | "mom", isFirst: boolean) => {
                if (isLateNight())
                    return 3000 + Math.random() * 4000;

                if (isBusy(who))
                    return 4000 + Math.random() * 4000;

                if (isOut(who))
                    return 3000 + Math.random() * 4000;

                return isFirst ? 1500 + Math.random() * 2000 : 3000 + Math.random() * 3000;
            };

            const identityCtx = buildIdentityContext(unlockState);

            if (character === "family") {
                const rand = Math.random();
                const replyOrder: Array<"dad" | "mom"> = [];
                const dadReplies = rand < 0.6;
                const momReplies = rand > 0.4;
                const dadFirst = Math.random() < 0.5;

                if (dadReplies && momReplies) {
                    replyOrder.push(dadFirst ? "dad" : "mom", dadFirst ? "mom" : "dad");
                } else if (dadReplies) {
                    replyOrder.push("dad");
                } else if (momReplies) {
                    replyOrder.push("mom");
                }

                let lastSpeakerText = "";
                let updatedHistory = [...history];

                for (let i = 0; i < replyOrder.length; i++) {
                    const speaker = replyOrder[i];
                    const baseDelay = getDelay(speaker, i === 0);
                    setTypingWho(speaker);
                    await new Promise(r => setTimeout(r, baseDelay));

                    const speakerHistory = lastSpeakerText ? [...updatedHistory, {
                        role: "assistant" as const,
                        content: `${speaker === "dad" ? "梓渝" : "田雷"}：${lastSpeakerText}`
                    }] : updatedHistory;

                    const memoryCtx = buildMemoryContext();

                    const res = await fetch("/api/chat", {
                        method: "POST",

                        headers: {
                            "Content-Type": "application/json"
                        },

                        body: JSON.stringify({
                            message: userMsg,
                            character: "family",
                            speaker,
                            history: speakerHistory,
                            identityContext: identityCtx,
                            memoryContext: memoryCtx,
                            scene: "chat"
                        })
                    });

                    setTypingWho(null);

                    if (!res.ok)
                        continue;

                    const streamMsgId = nextId();

                    setChatHistory(prev => ({
                        ...prev,

                        family: [...prev.family, {
                            from: speaker,
                            text: "",
                            id: streamMsgId
                        }]
                    }));

                    const fullText = await readSSEStream(res, text => {
                        setChatHistory(prev => {
                            const msgs = [...prev.family];
                            const idx = msgs.findIndex(m => m.id === streamMsgId);

                            if (idx !== -1) msgs[idx] = {
                                from: speaker,
                                text,
                                id: streamMsgId
                            };

                            return {
                                ...prev,
                                family: msgs
                            };
                        });
                    });

                    setChatHistory(prev => {
                        const msgs = prev.family.filter(m => m.id !== streamMsgId);

                        return {
                            ...prev,
                            family: msgs
                        };
                    });

                    setTypingWho(speaker);
                    addSplitMessages("family", speaker, fullText);
                    lastSpeakerText = fullText;

                    updatedHistory = [...updatedHistory, {
                        role: "assistant" as const,
                        content: `${speaker === "dad" ? "田雷" : "梓渝"}：${fullText}`
                    }];
                }
            } else {
                const baseDelay = getDelay(character as "dad" | "mom", true);
                setTypingWho(character);
                await new Promise(r => setTimeout(r, baseDelay));
                const memoryCtx = buildMemoryContext();

                const res = await fetch("/api/chat", {
                    method: "POST",

                    headers: {
                        "Content-Type": "application/json"
                    },

                    body: JSON.stringify({
                        message: userMsg,
                        character,
                        history,
                        identityContext: identityCtx,
                        memoryContext: memoryCtx,
                        scene: "chat"
                    })
                });

                if (!res.ok)
                    throw new Error("请求失败");

                setTypingWho(null);
                const privStreamId = nextId();

                setChatHistory(prev => ({
                    ...prev,

                    [character]: [...prev[character], {
                        from: character,
                        text: "",
                        id: privStreamId
                    }]
                }));

                const privFullText = await readSSEStream(res, text => {
                    setChatHistory(prev => {
                        const msgs = [...prev[character]];
                        const idx = msgs.findIndex(m => m.id === privStreamId);

                        if (idx !== -1) msgs[idx] = {
                            from: character,
                            text,
                            id: privStreamId
                        };

                        return {
                            ...prev,
                            [character]: msgs
                        };
                    });
                });

                setChatHistory(prev => ({
                    ...prev,
                    [character]: prev[character].filter(m => m.id !== privStreamId)
                }));

                setTypingWho(character);
                await addSplitMessages(character === "dad" ? "dad" : "mom", character, privFullText);
                setTypingWho(null);
            }
        } catch {
            setTypingWho(null);

            const fallbacks: Record<string, string> = {
                dad: "嗯，爸在呢。",
                mom: "宝贝，妈咪在呢~"
            };

            setChatHistory(prev => ({
                ...prev,

                [character]: [...prev[character], {
                    from: character === "family" ? "dad" : character,
                    text: fallbacks[character] || "...",
                    id: nextId()
                }]
            }));
        } finally {
            setIsSending(false);

            if (loginUsername && userMsg) {
                const aiReplies = chatHistory[character].filter(m => m.from !== "me" && m.from !== "system").slice(-5).map(m => m.text).join("\n");

                fetch("/api/memory", {
                    method: "POST",

                    headers: {
                        "Content-Type": "application/json"
                    },

                    body: JSON.stringify({
                        userId: loginUsername,
                        userMessage: userMsg,
                        aiReplies,
                        character
                    })
                }).then(async res => {
                    if (res.ok) {
                        const data = await res.json();

                        if (data.memories?.length > 0) {
                            addMemoryBatch(loginUsername, data.memories);
                        }
                    }
                }).catch(() => {});
            }
        }
    }

    function renderAppIcon(
        app: {
            id: string;
            emoji: string;
            label?: string;
            color: string;
        },
        isDock = false,
        index?: number
    ) {
        const displayLabel = getAppLabel(app.id, unlockState.unlocked);
        const isSelected = selectedAppId === app.id && isEditing && !isDock;

        return (
            <div
                key={app.id}
                className={`app-icon ${isSelected ? "selected-app" : ""} ${!isDock ? "app-item" : ""}`}
                style={{ "--app-color": app.color } as React.CSSProperties}
                data-app-id={!isDock ? app.id : undefined}
                onClick={() => {
                    if (isDock) {
                        openApp(app.id);
                        return;
                    }
                    handleAppItemClick(app.id);
                }}>
                <div
                    className={isDock ? "" : "app-emoji-box"}
                    style={isDock ? {
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: 48,
                        height: 48,
                        fontSize: 24,
                        background: "rgba(255,255,255,0.25)",
                        backdropFilter: "blur(28px)",
                        WebkitBackdropFilter: "blur(28px)",
                        borderRadius: 13,
                        position: "relative",
                        border: "1px solid rgba(255,255,255,0.35)",
                        boxShadow: "0 2px 8px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.3)"
                    } : {}}>
                    {app.emoji}
                </div>
                {!isDock && <span className="app-label">{displayLabel}</span>}
            </div>
        );
    }

    function renderChatDetail(character: "dad" | "mom" | "family") {
        const msgs = chatHistory[character];
        const charName = character === "dad" ? dadLabel : character === "mom" ? momLabel : "家庭群";

        return (
            <div className="chat-detail">
                <div className="chat-messages">
                    {msgs.map((m, idx) => <div
                        key={`${character}-${m.id}-${idx}`}
                        className={`msg-row ${m.from === "me" ? "me" : m.from === "system" ? "system" : "other"}`}>
                        {m.from === "system" ? <div className="msg-system">{m.text}</div> : <>
                            {m.from !== "me" && <div
                                className="msg-avatar"
                                style={{
                                    background: m.from === "dad" ? "#f59e0b" : "#ec4899"
                                }}>
                                {m.from === "dad" ? "👨" : "👩"}
                            </div>}
                            <div className="msg-content">
                                {m.from !== "me" && character === "family" && <div
                                    className="msg-name"
                                    style={{
                                        color: m.from === "dad" ? "#f59e0b" : "#ec4899"
                                    }}>
                                    {m.from === "dad" ? dadLabel : momLabel}
                                </div>}
                                <div className="msg-bubble">{m.text}</div>
                            </div>
                            {m.from === "me" && <div className="msg-avatar me-avatar">👧</div>}
                        </>}
                    </div>)}
                    {typingWho && <div className="msg-row other">
                        <div
                            className="msg-avatar"
                            style={{
                                background: typingWho === "dad" ? "#f59e0b" : "#ec4899"
                            }}>
                            {typingWho === "dad" ? "👨" : "👩"}
                        </div>
                        <div className="msg-content">
                            {character === "family" && <div
                                className="msg-name"
                                style={{
                                    color: typingWho === "dad" ? "#f59e0b" : "#ec4899"
                                }}>
                                {typingWho === "dad" ? dadLabel : momLabel}
                            </div>}
                            <div className="msg-bubble typing">正在输入...</div>
                        </div>
                    </div>}
                    <div ref={messagesEndRef} />
                </div>
                <div className="chat-input-bar">
                    <input
                        className="chat-input"
                        placeholder="输入消息..."
                        value={chatInput}
                        onChange={e => setChatInput(e.target.value)}
                        onKeyDown={e => {
                            if (e.key === "Enter")
                                sendChat(character);
                        }} />
                    <button
                        className="chat-send"
                        disabled={isSending || !chatInput.trim()}
                        onClick={() => sendChat(character)}>↑</button>
                </div>
            </div>
        );
    }

    interface MomentComment {
        from: string;
        replyTo?: string;
        text: string;
    }

    interface MomentItem {
        id: number;
        avatar: string;
        name: string;
        time: string;
        text: string;
        color: string;
        isMine?: boolean;
        likes: string[];
        comments: MomentComment[];
    }

    const [momentsData, setMomentsData] = useState<MomentItem[]>([{
        id: 1,
        avatar: "👩",
        name: "妈咪",
        time: "2小时前",
        text: "今天的夕阳好美呀 🌅",
        color: "#ec4899",
        likes: ["爸爸", "辛巴🐕", "米米"],

        comments: [{
            from: "爸爸",
            text: "我拍的更好看 😤"
        }, {
            from: "妈咪",
            text: "回复 爸爸：你就嘴硬吧，明明是我找的角度 🙄",
            replyTo: "爸爸"
        }, {
            from: "爸爸",
            text: "回复 妈咪：好好好你拍的最好看 ❤️",
            replyTo: "妈咪"
        }, {
            from: "辛巴🐕",
            text: "汪汪！🌅"
        }]
    }, {
        id: 2,
        avatar: "👨",
        name: "爸爸",
        time: "5小时前",
        text: "做了宝贝爱吃的红烧排骨，一口就吃光了 😎",
        color: "#f59e0b",
        likes: ["妈咪", "米米", "大鱼🐱"],

        comments: [{
            from: "妈咪",
            text: "明明是我做的"
        }, {
            from: "爸爸",
            text: "回复 妈咪：你就负责了切了个葱好吧 😂",
            replyTo: "妈咪"
        }, {
            from: "妈咪",
            text: "回复 爸爸：切葱也很重要的好不好！哼！",
            replyTo: "爸爸"
        }, {
            from: "大鱼🐱",
            text: "喵~我想吃鱼不是排骨🐟"
        }]
    }, {
        id: 3,
        avatar: "👩",
        name: "妈咪",
        time: "昨天",
        text: "和某人逛了一下午街，脚都酸了~",
        color: "#ec4899",
        likes: ["爸爸", "小十一🐱", "大鱼🐱"],

        comments: [{
            from: "爸爸",
            text: "下次我背你"
        }, {
            from: "妈咪",
            text: "回复 爸爸：说话算话哦",
            replyTo: "爸爸"
        }, {
            from: "爸爸",
            text: "回复 妈咪：什么时候骗过你",
            replyTo: "妈咪"
        }, {
            from: "小十一🐱",
            text: "喵喵~我要坐肩上！"
        }]
    }]);

    const [newMomentText, setNewMomentText] = useState("");
    const [showNewMoment, setShowNewMoment] = useState(false);
    const [commentInput, setCommentInput] = useState("");
    const [activeCommentIdx, setActiveCommentIdx] = useState<number | null>(null);

    const [replyTo, setReplyTo] = useState<{
        momentId: number;
        commentFrom: string;
    } | null>(null);

    const nextMomentId = useRef(4);
    const momentsDataRef = useRef(momentsData);
    momentsDataRef.current = momentsData;

    interface WeiboComment {
        id: number;
        from: string;
        avatar: string;
        text: string;
        time: string;
        likes: number;
        iLiked: boolean;
        replyTo?: string;
    }

    interface WeiboPost {
        id: number;
        avatar: string;
        name: string;
        tag?: string;
        verified?: boolean;
        time: string;
        text: string;
        color: string;
        likes: number;
        iLiked: boolean;
        comments: WeiboComment[];
        reposts: number;
        images?: string[];
        topic?: string;
        expandedComments: boolean;
        commentsLoaded: boolean;
        visibility?: "public" | "cp_only";
    }

    interface HotSearchItem {
        id: number;
        title: string;
        heat: number;
        tag?: string;
        tagColor?: string;
        type: "entertainment" | "social" | "general";
        detail?: string;
        detailImage?: string;
        posts?: WeiboPost[];
    }

    const INITIAL_HOT_SEARCH: HotSearchItem[] = [{
        id: 1,
        title: "北海8岁男童银滩走失",
        heat: 8762000,
        tag: "沸",
        tagColor: "#ef4444",
        type: "social",
        detail: "【真实事件】2025年8月16日下午6时35分许，8岁男孩梁某彬在广西北海银滩景区人群中走失。走失时身穿深蓝色泳裤、灰色哪吒拖鞋。家属称男孩在进入沙滩前跑进人群中后便不见了。当地警方、蓝天救援队及亲友持续搜寻。如有线索请拨打银滩东区派出所电话。来源：潇湘晨报",
        detailImage: "",
        posts: []
    }, {
        id: 2,
        title: "山东救援队长公益寻人牺牲",
        heat: 5431000,
        tag: "爆",
        tagColor: "#ef4444",
        type: "social",
        detail: "【真实事件】2026年6月11日晚，山东寿光市龙坤救灾公益服务中心队长李世龙（37岁）在参与公益寻人任务时，站在路沿石处突遭车祸，被一辆轿车撞飞十余米，经抢救71分钟后宣告不治。家中留有年近七旬父母和三个未成年孩子——大儿子8岁、一对龙凤胎仅2岁半。妻子称：看到丈夫离去的那一刻天都塌了。来源：澎湃新闻",
        detailImage: "",
        posts: []
    }, {
        id: 3,
        title: "抖音寻人累计助2.37万家庭团圆",
        heat: 2035000,
        tag: "新",
        tagColor: "#22c55e",
        type: "social",
        detail: "【真实数据】截至2025年6月，抖音寻人公益项目（原头条寻人）已累计发布20万条寻人启事，成功帮助2.37万个家庭团圆。最久失散85年，最快60秒被找回；年纪最大的101岁，最小的仅3个月。通过地理位置精准弹窗技术做寻人资讯分发，已与全国近800个救助管理机构合作。来源：上游新闻",
        detailImage: "",
        posts: []
    }, {
        id: 4,
        title: "益禾堂五城流浪动物饱喂计划",
        heat: 1568000,
        type: "social",
        detail: "【真实公益行动】2026年春，益禾堂联合它基金发起\"流浪动物饱喂计划\"，走进成都启明小动物保护中心（收容3000+只狗、400+只猫）、武汉白玉山基地（297只狗）、长沙星星小院等地。成都启明基地每天需1700多斤粮食，负责人每天凌晨6点起床煮饭到深夜。益禾堂承诺\"不做一次性公益\"，建立长期回访机制。来源：中国经济新闻网",
        detailImage: "",
        posts: []
    }, {
        id: 5,
        title: "四川2岁男童家中走失近90天",
        heat: 987000,
        tag: "急",
        tagColor: "#f97316",
        type: "social",
        detail: "【持续关注·真实事件】2025年9月18日14时15分许，不满2岁的罗锦程在四川省叙永县枧槽苗族乡九龙五社家中走失。事发时外婆出门砍竹子，外公上楼换灯泡，孩子独自留在一楼仅十几分钟便失踪。身穿白色短袖、黑白格子长裤，右手腕有脚印胎记。截至2025年12月已走失近90天，单亲妈妈罗女士仍在焦急等待警方调查结果。来源：极目新闻",
        detailImage: "",
        posts: []
    }, {
        id: 6,
        title: "你CP今晚官宣了",
        heat: 5431000,
        tag: "热",
        tagColor: "#f97316",
        type: "entertainment",
        detail: "【重磅】网传田栩宁和梓渝即将官宣！知情人士透露两人将于今晚8点在微博同步发博确认关系。CP粉集体沸腾，#你CP今晚官宣了# 话题阅读量已破5亿。是真是假，今晚见分晓！",
        posts: []
    }, {
        id: 7,
        title: "AI小手机发布会",
        heat: 1873000,
        type: "entertainment",
        detail: "AI小手机2.0版本发布会在即！新增家园系统、外卖平台、世界观切换等重磅功能。CP粉表示：终于可以在手机里给田栩宁和梓渝点外卖了！",
        posts: []
    }, {
        id: 8,
        title: "某明星新歌上线",
        heat: 1452000,
        type: "entertainment",
        detail: "梓渝新歌《逆光》今日0点全网上线！MV由田栩宁友情出演，两人在MV中的对视镜头让粉丝尖叫不止。网易云/QQ音乐/酷狗同步上线，快去支持！",
        posts: []
    }, {
        id: 9,
        title: "考研国家线预测",
        heat: 873000,
        type: "general",
        detail: "2026考研国家线最新预测出炉！教育学、法学预计上涨5-8分，工学预计持平或微降。各位考研人稳住心态，最后一公里加油！",
        posts: []
    }, {
        id: 10,
        title: "新开火锅店排队5小时",
        heat: 654000,
        type: "general",
        detail: "网红火锅品牌\"辣到飞起\"在城南开出第8家分店，开业首日排队超5小时。据说他家毛肚是空运过来的，锅底配方是三代祖传。有人已经去打卡了吗？",
        posts: []
    }];

    const [weiboData, setWeiboData] = useState<WeiboPost[]>([{
        id: 1,
        avatar: "👨",
        name: "田栩宁_",
        tag: "演员",
        verified: true,
        time: "3小时前",
        text: "今天收工早，回家做了顿饭。某人吃了三碗还嫌不够 😏",
        color: "#f59e0b",
        likes: 128340,
        iLiked: false,
        comments: [],
        reposts: 8932,
        expandedComments: false,
        commentsLoaded: false
    }, {
        id: 2,
        avatar: "👩",
        name: "我是梓渝_",
        tag: "歌手",
        verified: true,
        time: "5小时前",
        text: "新歌demo录完啦！这次尝试了不一样的风格，期待吗～ 🎵",
        color: "#ec4899",
        likes: 95670,
        iLiked: false,
        comments: [],
        reposts: 6210,
        expandedComments: false,
        commentsLoaded: false
    }, {
        id: 3,
        avatar: "🔥",
        name: "CP超话",
        time: "刚刚",
        text: "【路透】今天又有人拍到他们一起逛超市了！提着同款购物袋！甜玉米尖叫！！！",
        color: "#ef4444",
        likes: 28340,
        iLiked: false,
        comments: [],
        reposts: 5932,
        expandedComments: false,
        commentsLoaded: false
    }, {
        id: 4,
        avatar: "👨",
        name: "田栩宁_",
        tag: "演员",
        verified: true,
        time: "昨天",
        text: "谢谢大家喜欢《逆爱》，每个角色都值得被认真对待。",
        color: "#f59e0b",
        likes: 256700,
        iLiked: false,
        comments: [],
        reposts: 18500,
        expandedComments: false,
        commentsLoaded: false
    }, {
        id: 5,
        avatar: "👩",
        name: "我是梓渝_",
        tag: "歌手",
        verified: true,
        time: "昨天",
        text: "练习室待了一整天，腿都要断了… 但很充实！💪",
        color: "#ec4899",
        likes: 78900,
        iLiked: false,
        comments: [],
        reposts: 4320,
        expandedComments: false,
        commentsLoaded: false
    }, {
        id: 6,
        avatar: "📢",
        name: "娱乐热搜",
        time: "2小时前",
        text: "#他们是不是在一起了# 阅读量突破3亿，网友：这不是情侣我倒立洗头",
        color: "#ef4444",
        likes: 45600,
        iLiked: false,
        comments: [],
        reposts: 12300,
        topic: "他们是不是在一起了",
        expandedComments: false,
        commentsLoaded: false
    }, {
        id: 7,
        avatar: "🔥",
        name: "CP超话",
        time: "1小时前",
        text: "【分析帖】田栩宁今天微博发的\"某人\"是谁我不说🤏 翻译：梓渝吃了三碗饭",
        color: "#ef4444",
        likes: 19800,
        iLiked: false,
        comments: [],
        reposts: 3670,
        topic: "某人是谁",
        expandedComments: false,
        commentsLoaded: false
    }]);

    const [weiboHotSearch, setWeiboHotSearch] = useState<HotSearchItem[]>(INITIAL_HOT_SEARCH);

    const [weiboTab, setWeiboTab] = useState<"home" | "discover" | "messages" | "me">("home");
    const [weiboCommentInput, setWeiboCommentInput] = useState("");
    const [activeWeiboComment, setActiveWeiboComment] = useState<number | null>(null);
    const [showWeiboPost, setShowWeiboPost] = useState(false);
    const [weiboPostText, setWeiboPostText] = useState("");
    const [weiboPostImages, setWeiboPostImages] = useState<string[]>([]);
    const [weiboPostTopic, setWeiboPostTopic] = useState("");
    const [weiboFollowing, setWeiboFollowing] = useState<string[]>([]);
    const [showWeiboProfileEdit, setShowWeiboProfileEdit] = useState(false);
    const [weiboProfileNick, setWeiboProfileNick] = useState("");
    const [weiboProfileBio, setWeiboProfileBio] = useState("");
    const [weiboProfileAvatar, setWeiboProfileAvatar] = useState("😎");
    const [hotSearchTab, setHotSearchTab] = useState<"all" | "entertainment" | "social">("all");
    const [expandedHotItem, setExpandedHotItem] = useState<number | null>(null);
    const [topicPage, setTopicPage] = useState<string | null>(null);
    const [topicPosts, setTopicPosts] = useState<WeiboPost[]>([]);
    const weiboNextId = useRef(100);
    const [shopProducts, setShopProducts] = useState<ShopProduct[]>(INITIAL_PRODUCTS);
    const [shopCart, setShopCart] = useState<CartItem[]>([]);
    const [shopMembers, setShopMembers] = useState<ShopMember[]>(INITIAL_MEMBERS);
    const [shopOrders, setShopOrders] = useState<ShopOrder[]>(INITIAL_ORDERS);
    const [shopBrowseComments, setShopBrowseComments] = useState<BrowseComment[]>([]);
    const [shopCategory, setShopCategory] = useState<ProductCategory | "全部">("全部");
    const [shopShowCart, setShopShowCart] = useState(false);
    const [shopTogetherMode, setShopTogetherMode] = useState(false);
    const [shopCpMessage, setShopCpMessage] = useState<string | null>(null);
    const [shopNotification, setShopNotification] = useState<string | null>(null);
    const [shopBuyInput, setShopBuyInput] = useState("");
    const [mixinTab, setMixinTab] = useState<"chats" | "contacts" | "discover" | "me">("chats");
    const totalPages = 2;
    const [mixinChatTarget, setMixinChatTarget] = useState<"family" | "dad" | "mom" | null>(null);
    const [draggingApp, setDraggingApp] = useState<string | null>(null);
    const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
    const [dragOverPage, setDragOverPage] = useState<number | null>(null);


    const handleShopAddToCart = (product: ShopProduct) => {
        if (product.stock <= 0) {
            setShopNotification("该商品已售罄");
            setTimeout(() => setShopNotification(null), 2000);
            return;
        }

        setShopCart(prev => addToCart(prev, product));

        setShopProducts(prev => prev.map(p => p.id === product.id ? {
            ...p,
            stock: p.stock - 1
        } : p));

        setShopNotification(`已添加「${product.name}」到购物车`);
        setTimeout(() => setShopNotification(null), 2000);
    };

    const handleShopCheckout = (recipientName?: string) => {
        if (shopCart.length === 0)
            return;

        const total = getCartTotal(shopCart);
        const user = shopMembers.find(m => m.id === "user");

        if (!user || user.balance < total) {
            setShopNotification("米米币不足！");
            setTimeout(() => setShopNotification(null), 2000);
            return;
        }

        setShopMembers(prev => prev.map(m => m.id === "user" ? {
            ...m,
            balance: m.balance - total
        } : m));

        const now = new Date();
        const timeStr = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;

        const newOrders: ShopOrder[] = shopCart.map((item, i) => ({
            id: `o${Date.now()}_${i}`,
            timestamp: timeStr,
            buyerId: "user",
            buyerName: "甜玉米",
            recipientName: recipientName || "自用",
            productName: item.productName,
            price: item.price,
            quantity: item.quantity
        }));

        setShopOrders(prev => [...newOrders, ...prev]);

        setShopProducts(prev => prev.map(p => {
            const cartItem = shopCart.find(ci => ci.productId === p.id);

            return cartItem ? {
                ...p,
                soldCount: p.soldCount + cartItem.quantity
            } : p;
        }));

        setShopCart([]);
        setShopShowCart(false);
        setShopNotification(`结算成功！共 ${total} 米米币`);
        setTimeout(() => setShopNotification(null), 3000);
    };

    const handleTogetherBrowse = () => {
        const updatedMembers = getRandomOnlineMembers(shopMembers);
        setShopMembers(updatedMembers);
        const comments = generateBrowseComments(updatedMembers, shopProducts);
        setShopBrowseComments(comments);
        setShopTogetherMode(true);
    };

    useEffect(() => {
        if (currentApp === "shopping") {
            const result = triggerCPAutoShop(shopProducts, shopOrders);

            if (result) {
                setShopCpMessage(result.message);

                if (result.newOrder) {
                    const newOrder: ShopOrder = {
                        ...result.newOrder,
                        id: `o${Date.now()}`,
                        timestamp: "刚刚"
                    };

                    setShopOrders(prev => [newOrder, ...prev]);

                    setShopProducts(prev => prev.map(p => p.name === result.newOrder!.productName ? {
                        ...p,
                        stock: Math.max(0, p.stock - result.newOrder!.quantity),
                        soldCount: p.soldCount + result.newOrder!.quantity
                    } : p));
                }

                setTimeout(() => setShopCpMessage(null), 5000);
            }
        }
    }, [currentApp]);

    const bumpHotSearch = (topicKeyword: string) => {
        setWeiboHotSearch(prev => {
            const updated = prev.map(item => {
                if (item.title.includes(topicKeyword) || topicKeyword.includes(item.title)) {
                    return {
                        ...item,
                        heat: item.heat + Math.floor(Math.random() * 30000 + 10000)
                    };
                }

                return item;
            });

            updated.sort((a, b) => b.heat - a.heat);

            return updated.map((item, i) => ({
                ...item,
                id: i + 1
            }));
        });
    };

    const generateWeiboComments = async (post: WeiboPost) => {
        if (post.commentsLoaded)
            return;

        const commentPool = [{
            from: "甜玉米1号",
            avatar: "🌽",
            text: "某人是谁我不说🤏"
        }, {
            from: "路人大白",
            avatar: "🤍",
            text: "这也太甜了吧"
        }, {
            from: "音粉小圆",
            avatar: "🎵",
            text: "期待期待！！"
        }, {
            from: "嗑到了",
            avatar: "💕",
            text: "嗑死我了呜呜"
        }, {
            from: "清醒路人",
            avatar: "🧐",
            text: "可能只是巧合吧"
        }, {
            from: "剧粉",
            avatar: "🎬",
            text: "演技真的绝了"
        }, {
            from: "逆爱铁粉",
            avatar: "❤️",
            text: "永远支持！"
        }, {
            from: "粉丝团",
            avatar: "🪭",
            text: "注意休息呀！"
        }, {
            from: "CP粉头",
            avatar: "🔥",
            text: "3亿阅读量！排面！"
        }, {
            from: "侦探粉",
            avatar: "🔍",
            text: "某人=梓渝 这是数学题"
        }, {
            from: "唯粉抗议",
            avatar: "🙄",
            text: "别乱磕好吗"
        }, {
            from: "吃瓜群众",
            avatar: "🍉",
            text: "坐等官宣"
        }, {
            from: "甜玉米2号",
            avatar: "🌽",
            text: "月月太可爱了"
        }, {
            from: "甜玉米3号",
            avatar: "🌽",
            text: "某人看到该心疼了"
        }, {
            from: "真爱粉",
            avatar: "💗",
            text: "永远相信你们！"
        }, {
            from: "理性分析",
            avatar: "📊",
            text: "从数据来看这对CP是真的"
        }, {
            from: "路人转粉",
            avatar: "✨",
            text: "被安利了，入坑了"
        }, {
            from: "老粉",
            avatar: "👑",
            text: "从出道就追了，越来越甜"
        }, {
            from: "微糖女孩",
            avatar: "🍬",
            text: "今天的糖分超标啦"
        }, {
            from: "圈内人",
            avatar: "🎪",
            text: "只能说你们看到的只是冰山一角"
        }];

        const isDad = post.name === "田栩宁_";
        const isMom = post.name === "我是梓渝_";
        const isCP = post.name === "CP超话" || post.name === "娱乐热搜";
        const count = 15 + Math.floor(Math.random() * 6);
        const selected: WeiboComment[] = [];
        const usedIndices = new Set<number>();

        if (isDad) {
            const dadIndices = [0, 1, 3, 5, 9, 10, 14, 16, 17, 18, 19, 6, 7, 8, 12, 2, 4, 11, 13, 15];

            for (let i = 0; i < count && i < dadIndices.length; i++) {
                const idx = dadIndices[i];

                if (!usedIndices.has(idx)) {
                    usedIndices.add(idx);

                    selected.push({
                        id: weiboNextId.current++,
                        ...commentPool[idx],
                        time: `${Math.floor(Math.random() * 23) + 1}小时前`,
                        likes: Math.floor(Math.random() * 5000 + 100),
                        iLiked: false
                    });
                }
            }
        } else if (isMom) {
            const momIndices = [2, 12, 13, 6, 7, 8, 14, 17, 18, 3, 0, 1, 5, 9, 10, 4, 11, 15, 16, 19];

            for (let i = 0; i < count && i < momIndices.length; i++) {
                const idx = momIndices[i];

                if (!usedIndices.has(idx)) {
                    usedIndices.add(idx);

                    selected.push({
                        id: weiboNextId.current++,
                        ...commentPool[idx],
                        time: `${Math.floor(Math.random() * 23) + 1}小时前`,
                        likes: Math.floor(Math.random() * 5000 + 100),
                        iLiked: false
                    });
                }
            }
        } else {
            const cpIndices = [3, 4, 8, 9, 10, 11, 14, 15, 16, 19, 0, 1, 2, 5, 6, 7, 12, 13, 17, 18];

            for (let i = 0; i < count && i < cpIndices.length; i++) {
                const idx = cpIndices[i];

                if (!usedIndices.has(idx)) {
                    usedIndices.add(idx);

                    selected.push({
                        id: weiboNextId.current++,
                        ...commentPool[idx],
                        time: `${Math.floor(Math.random() * 23) + 1}小时前`,
                        likes: Math.floor(Math.random() * 5000 + 100),
                        iLiked: false
                    });
                }
            }
        }

        setWeiboData(prev => prev.map(p => p.id === post.id ? {
            ...p,
            comments: selected,
            commentsLoaded: true
        } : p));
    };

    const buildMomentsChatHistory = (moment: MomentItem | undefined): Array<{
        role: "user" | "assistant";
        content: string;
    }> => {
        if (!moment)
            return [];

        const result: Array<{
            role: "user" | "assistant";
            content: string;
        }> = [];

        result.push({
            role: "user",
            content: `[朋友圈] ${moment.name}发了：「${moment.text}」`
        });

        if (moment.comments) {
            for (const c of moment.comments) {
                const isUser = c.from === "米米";
                const prefix = c.replyTo ? `回复${c.replyTo}：` : "";

                result.push({
                    role: isUser ? "user" : "assistant",
                    content: `${c.from}${prefix}${c.text}`
                });
            }
        }

        return result;
    };

    const buildMomentsMessage = (task: string): string => {
        const now = new Date();
        const hour = now.getHours();
        const timeStr = `${String(hour).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
        const dadStatus = parentStatus.dadStatus.includes("睡觉") ? "爸爸在睡觉" : parentStatus.dadDesc ? `爸爸在${parentStatus.dadDesc}` : "";
        const momStatus = parentStatus.momStatus.includes("睡觉") ? "妈咪在睡觉" : parentStatus.momDesc ? `妈咪在${parentStatus.momDesc}` : "";
        const statusHint = [dadStatus, momStatus].filter(Boolean).join("，");
        return `【当前时间${timeStr}，${statusHint}】${task}`;
    };

    const autoReplyToComment = async (momentId: number, commentText: string, commentFrom: string | undefined) => {
        const emotionKeywords = [
            "不开心",
            "难过",
            "伤心",
            "生气",
            "烦",
            "累",
            "想",
            "哭",
            "怕",
            "焦虑",
            "压力",
            "委屈",
            "孤独",
            "无聊",
            "寂寞",
            "害怕",
            "讨厌",
            "郁闷",
            "崩溃",
            "受不了",
            "好烦",
            "好累",
            "好怕",
            "好想",
            "心痛",
            "心碎",
            "分手",
            "吵架",
            "对不起",
            "抱歉",
            "不舒服",
            "生病",
            "难受",
            "头痛",
            "肚子疼",
            "发烧",
            "感冒",
            "失眠",
            "噩梦",
            "考试",
            "面试",
            "好难",
            "困难",
            "撑不住",
            "不想",
            "失望"
        ];

        const hasEmotion = emotionKeywords.some(kw => commentText.includes(kw));
        const currentMoment = momentsDataRef.current.find(m => m.id === momentId);
        const momentAuthor = currentMoment?.name || "";
        const reactors = ["老爸", "妈咪", "辛巴🐕", "大鱼🐱", "小十一🐱"];
        const possibleRepliers = reactors.filter(r => r !== commentFrom);
        let repliers: string[] = [];

        if (hasEmotion) {
            repliers = possibleRepliers.filter(r => r === "老爸" || r === "妈咪");

            if (Math.random() < 0.4) {
                const petReplier = possibleRepliers.find(r => r !== "老爸" && r !== "妈咪");

                if (petReplier)
                    repliers.push(petReplier);
            }
        } else {
            const isMimiCommenting = commentFrom === "米米";
            const isMomentsByParents = momentAuthor === "爸爸" || momentAuthor === "妈咪" || momentAuthor === "老爸" || momentAuthor === "妈咪";
            const replyProb = isMimiCommenting ? isMomentsByParents ? 0.9 : 0.8 : 0.5;

            if (Math.random() > replyProb)
                return;

            let preferReplier: string | null = null;

            if (momentAuthor === "爸爸" || momentAuthor === "老爸")
                preferReplier = "老爸";

            if (momentAuthor === "妈咪")
                preferReplier = "妈咪";

            const replyCount = Math.random() < 0.5 ? 1 : 2;

            if (preferReplier && possibleRepliers.includes(preferReplier)) {
                repliers = [preferReplier];

                if (replyCount >= 2) {
                    const other = possibleRepliers.filter(r => r !== preferReplier && (r === "老爸" || r === "妈咪"));

                    if (other.length > 0)
                        repliers.push(other[0]);
                }
            } else {
                repliers = possibleRepliers.filter(r => r === "老爸" || r === "妈咪").sort(() => Math.random() - 0.5).slice(0, replyCount);
            }
        }

        for (const replier of repliers) {
            await new Promise(r => setTimeout(r, 1500 + Math.random() * 3000));
            const latestMoment = momentsDataRef.current.find(m => m.id === momentId);
            const latestAuthor = latestMoment?.name || momentAuthor;
            const replyToName = commentFrom || "米米";
            const emotionHint = hasEmotion ? " 注意：对方的话带有情绪，请温柔关心地回复。" : "";
            const commentHistory = buildMomentsChatHistory(latestMoment);

            const roleMap: Record<string, string> = {
                "老爸": "田雷（爸爸）",
                "妈咪": "梓渝（妈咪）",
                "辛巴🐕": "辛巴（家里的狗）",
                "大鱼🐱": "大鱼（家里的猫）",
                "小十一🐱": "小十一（家里的猫）"
            };

            const myRole = roleMap[replier] || replier;
            const task = `你是${myRole}。在${latestAuthor}的朋友圈评论区，${replyToName}说了：「${commentText}」。请你作为${myRole}回复${replyToName}的这条评论。${emotionHint}`;
            const aiMessage = buildMomentsMessage(task);
            let aiText = "";

            try {
                const character = replier === "老爸" ? "dad" : replier === "妈咪" ? "mom" : "pet";

                const res = await fetch("/api/chat", {
                    method: "POST",

                    headers: {
                        "Content-Type": "application/json"
                    },

                    body: JSON.stringify({
                        message: `${aiMessage}\n请用一句话简短回复（20字以内），语气要符合你的角色和当前状态，直接说回复内容不要加引号和前缀`,
                        character,
                        speaker: character === "mom" ? "mom" : "dad",
                        history: commentHistory,
                        scene: "moments"
                    })
                });

                if (res.ok && res.body) {
                    const reader = res.body.getReader();

                    while (true) {
                        const {
                            done,
                            value
                        } = await reader.read();

                        if (done)
                            break;

                        const chunk = new TextDecoder().decode(value);

                        for (const line of chunk.split("\n")) {
                            if (line.startsWith("data: ") && line !== "data: [DONE]") {
                                try {
                                    const data = JSON.parse(line.slice(6));
                                    aiText += data.content || "";
                                } catch {}
                            }
                        }
                    }
                }
            } catch {}

            if (!aiText) {
                const defaults = hasEmotion ? ["怎么了？跟爸说", "没事吧宝贝？妈在呢", "抱抱~", "别怕，有我们在", "谁欺负你了？"] : ["哈哈", "说的对！", "嗯嗯", "好呀~", "可不是嘛"];
                aiText = defaults[Math.floor(Math.random() * defaults.length)];
            }

            const finalReplier = replier;
            const finalReplyToName = replyToName;

            setMomentsData(prev => prev.map(m => {
                if (m.id !== momentId)
                    return m;

                return {
                    ...m,

                    comments: [...(m.comments || []), {
                        from: finalReplier,
                        text: aiText,
                        replyTo: finalReplyToName
                    }]
                };
            }));
        }

        const crossReplyProb = hasEmotion ? 0.8 : 0.6;

        if (Math.random() < crossReplyProb && repliers.length >= 2 && repliers.includes("老爸") && repliers.includes("妈咪")) {
            await new Promise(r => setTimeout(r, 2000 + Math.random() * 3000));
            const lastReplier = repliers[repliers.length - 1];
            const crossReplier = lastReplier === "老爸" ? "妈咪" : "老爸";
            const crossCharacter = crossReplier === "妈咪" ? "mom" : "dad";
            const latestMoment = momentsDataRef.current.find(m => m.id === momentId);
            const crossHistory = buildMomentsChatHistory(latestMoment);

            const roleMap2: Record<string, string> = {
                "老爸": "田雷（爸爸）",
                "妈咪": "梓渝（妈咪）"
            };

            const crossRole = roleMap2[crossReplier] || crossReplier;
            const crossTask = `你是${crossRole}。${lastReplier}刚在评论区说了话，请你用一句话简短回复${lastReplier}（20字以内），要像老夫老妻互怼/撒娇的语气`;
            const crossMessage = buildMomentsMessage(crossTask);
            let crossText = "";

            try {
                const crossRes = await fetch("/api/chat", {
                    method: "POST",

                    headers: {
                        "Content-Type": "application/json"
                    },

                    body: JSON.stringify({
                        message: `${crossMessage}\n直接说回复内容不要加引号和前缀`,
                        character: crossCharacter,
                        speaker: crossCharacter,
                        history: crossHistory,
                        scene: "moments"
                    })
                });

                if (crossRes.ok && crossRes.body) {
                    const reader = crossRes.body.getReader();

                    while (true) {
                        const {
                            done,
                            value
                        } = await reader.read();

                        if (done)
                            break;

                        const chunk = new TextDecoder().decode(value);

                        for (const line of chunk.split("\n")) {
                            if (line.startsWith("data: ") && line !== "data: [DONE]") {
                                try {
                                    const data = JSON.parse(line.slice(6));
                                    crossText += data.content || "";
                                } catch {}
                            }
                        }
                    }
                }
            } catch {}

            if (!crossText) {
                const banterDefaults = ["你说得对", "就是就是", "又来了又来了", "你闭嘴啦", "哼，谁让你说的", "听他的吧"];
                crossText = banterDefaults[Math.floor(Math.random() * banterDefaults.length)];
            }

            const finalCrossReplier = crossReplier;
            const finalLastReplier = lastReplier;
            const finalCrossText = crossText;

            setMomentsData(prev => prev.map(m => {
                if (m.id !== momentId)
                    return m;

                return {
                    ...m,

                    comments: [...(m.comments || []), {
                        from: finalCrossReplier,
                        text: finalCrossText,
                        replyTo: finalLastReplier
                    }]
                };
            }));
        }
    };

    function renderMoments() {
        const handlePostMoment = () => {
            if (!newMomentText.trim())
                return;

            const newMoment: MomentItem = {
                id: nextMomentId.current++,
                avatar: "👧",
                name: "米米",
                time: "刚刚",
                text: newMomentText.trim(),
                color: "#06b6d4",
                isMine: true,
                likes: [],
                comments: []
            };

            setMomentsData(prev => [newMoment, ...prev]);
            const postContent = newMomentText.trim();
            setNewMomentText("");
            setShowNewMoment(false);
            const momentId = newMoment.id;

            setTimeout(() => {
                setMomentsData(prev => prev.map(m => m.id === momentId ? {
                    ...m,
                    likes: [...m.likes, "爸爸"]
                } : m));
            }, 2000 + Math.random() * 2000);

            setTimeout(() => {
                setMomentsData(prev => prev.map(m => m.id === momentId ? {
                    ...m,
                    likes: [...m.likes, "妈咪"]
                } : m));
            }, 4000 + Math.random() * 3000);

            const baseHistory: Array<{
                role: "user" | "assistant";
                content: string;
            }> = [{
                role: "user",
                content: `[朋友圈] 米米发了：「${postContent}」`
            }];

            setTimeout(async () => {
                const dadTask = buildMomentsMessage(`你是田雷（爸爸）。米米在朋友圈发了：「${postContent}」。请你作为爸爸直接评论这条朋友圈。`);
                let dadComment = "";

                try {
                    const res = await fetch("/api/chat", {
                        method: "POST",

                        headers: {
                            "Content-Type": "application/json"
                        },

                        body: JSON.stringify({
                            message: `${dadTask}\n请直接说评论内容（20字以内），不要加引号和前缀`,
                            character: "dad",
                            speaker: "dad",
                            history: baseHistory,
                            scene: "moments"
                        })
                    });

                    if (res.ok && res.body) {
                        const reader = res.body.getReader();

                        while (true) {
                            const {
                                done,
                                value
                            } = await reader.read();

                            if (done)
                                break;

                            const chunk = new TextDecoder().decode(value);

                            for (const line of chunk.split("\n")) {
                                if (line.startsWith("data: ") && line !== "data: [DONE]") {
                                    try {
                                        dadComment += JSON.parse(line.slice(6)).content || "";
                                    } catch {}
                                }
                            }
                        }
                    }
                } catch {}

                dadComment = dadComment.replace(/\n/g, "").trim().slice(0, 80);

                if (!dadComment)
                    dadComment = "不错嘛";

                const finalDadComment = dadComment;

                setMomentsData(prev => prev.map(m => m.id === momentId ? {
                    ...m,

                    comments: [...m.comments, {
                        from: "爸爸",
                        text: finalDadComment
                    }]
                } : m));

                if (Math.random() > 0.4) {
                    setTimeout(async () => {
                        const momHistory = [...baseHistory, {
                            role: "assistant",
                            content: `爸爸：${finalDadComment}`
                        }];

                        const momTask = buildMomentsMessage(
                            `你是梓渝（妈咪）。米米发了朋友圈「${postContent}」，爸爸评论了「${finalDadComment}」。请你作为妈咪回复爸爸的评论。`
                        );

                        let momReply = "";

                        try {
                            const res2 = await fetch("/api/chat", {
                                method: "POST",

                                headers: {
                                    "Content-Type": "application/json"
                                },

                                body: JSON.stringify({
                                    message: `${momTask}\n请直接说回复内容（20字以内），不要加引号和前缀`,
                                    character: "mom",
                                    speaker: "mom",
                                    history: momHistory,
                                    scene: "moments"
                                })
                            });

                            if (res2.ok && res2.body) {
                                const reader2 = res2.body.getReader();

                                while (true) {
                                    const {
                                        done,
                                        value
                                    } = await reader2.read();

                                    if (done)
                                        break;

                                    const chunk2 = new TextDecoder().decode(value);

                                    for (const line2 of chunk2.split("\n")) {
                                        if (line2.startsWith("data: ") && line2 !== "data: [DONE]") {
                                            try {
                                                momReply += JSON.parse(line2.slice(6)).content || "";
                                            } catch {}
                                        }
                                    }
                                }
                            }
                        } catch {}

                        momReply = momReply.replace(/\n/g, "").trim().slice(0, 80);

                        if (!momReply)
                            momReply = "哼~";

                        const finalMomReply = momReply;

                        setMomentsData(prev => prev.map(m => m.id === momentId ? {
                            ...m,

                            comments: [...m.comments, {
                                from: "妈咪",
                                text: finalMomReply,
                                replyTo: "爸爸"
                            }]
                        } : m));
                    }, 2000 + Math.random() * 2000);
                }
            }, 3000 + Math.random() * 2000);

            setTimeout(async () => {
                const currentMoment = momentsDataRef.current.find(m => m.id === momentId);
                const momHistory = buildMomentsChatHistory(currentMoment);
                const momTask = buildMomentsMessage(`你是梓渝（妈咪）。米米在朋友圈发了：「${postContent}」。请你作为妈咪直接评论这条朋友圈。`);
                let momComment = "";

                try {
                    const res = await fetch("/api/chat", {
                        method: "POST",

                        headers: {
                            "Content-Type": "application/json"
                        },

                        body: JSON.stringify({
                            message: `${momTask}\n请直接说评论内容（20字以内），不要加引号和前缀`,
                            character: "mom",
                            speaker: "mom",
                            history: momHistory,
                            scene: "moments"
                        })
                    });

                    if (res.ok && res.body) {
                        const reader = res.body.getReader();

                        while (true) {
                            const {
                                done,
                                value
                            } = await reader.read();

                            if (done)
                                break;

                            const chunk = new TextDecoder().decode(value);

                            for (const line of chunk.split("\n")) {
                                if (line.startsWith("data: ") && line !== "data: [DONE]") {
                                    try {
                                        momComment += JSON.parse(line.slice(6)).content || "";
                                    } catch {}
                                }
                            }
                        }
                    }
                } catch {}

                momComment = momComment.replace(/\n/g, "").trim().slice(0, 80);

                if (!momComment)
                    momComment = "好看~";

                const finalMomComment = momComment;

                setMomentsData(prev => prev.map(m => m.id === momentId ? {
                    ...m,

                    comments: [...m.comments, {
                        from: "妈咪",
                        text: finalMomComment
                    }]
                } : m));

                if (Math.random() > 0.4) {
                    setTimeout(async () => {
                        const dadHistory2 = [
                            ...buildMomentsChatHistory(momentsDataRef.current.find(m => m.id === momentId)),
                            {
                                role: "assistant",
                                content: `妈咪：${finalMomComment}`
                            }
                        ];

                        const dadTask2 = buildMomentsMessage(`你是田雷（爸爸）。妈咪评论了「${finalMomComment}」。请你作为爸爸回复妈咪。`);
                        let dadReply = "";

                        try {
                            const res2 = await fetch("/api/chat", {
                                method: "POST",

                                headers: {
                                    "Content-Type": "application/json"
                                },

                                body: JSON.stringify({
                                    message: `${dadTask2}\n请直接说回复内容（20字以内），不要加引号和前缀`,
                                    character: "dad",
                                    speaker: "dad",
                                    history: dadHistory2,
                                    scene: "moments"
                                })
                            });

                            if (res2.ok && res2.body) {
                                const reader2 = res2.body.getReader();

                                while (true) {
                                    const {
                                        done,
                                        value
                                    } = await reader2.read();

                                    if (done)
                                        break;

                                    const chunk2 = new TextDecoder().decode(value);

                                    for (const line2 of chunk2.split("\n")) {
                                        if (line2.startsWith("data: ") && line2 !== "data: [DONE]") {
                                            try {
                                                dadReply += JSON.parse(line2.slice(6)).content || "";
                                            } catch {}
                                        }
                                    }
                                }
                            }
                        } catch {}

                        dadReply = dadReply.replace(/\n/g, "").trim().slice(0, 80);

                        if (!dadReply)
                            dadReply = "哈哈";

                        const finalDadReply = dadReply;

                        setMomentsData(prev => prev.map(m => m.id === momentId ? {
                            ...m,

                            comments: [...m.comments, {
                                from: "爸爸",
                                text: finalDadReply,
                                replyTo: "妈咪"
                            }]
                        } : m));
                    }, 2000 + Math.random() * 2000);
                }
            }, 5500 + Math.random() * 2000);

            if (Math.random() > 0.4) {
                setTimeout(() => {
                    setMomentsData(prev => prev.map(m => m.id === momentId ? {
                        ...m,
                        likes: [...m.likes, "辛巴🐕"]
                    } : m));
                }, 6000 + Math.random() * 2000);
            }

            if (Math.random() > 0.5) {
                setTimeout(() => {
                    setMomentsData(prev => prev.map(m => m.id === momentId ? {
                        ...m,
                        likes: [...m.likes, "小十一🐱"]
                    } : m));
                }, 7000 + Math.random() * 3000);
            }
        };

        return (
            <div className="feed-list">
                <div
                    style={{
                        padding: "12px 16px 8px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        position: "relative",
                        borderBottom: "1px solid rgba(0,0,0,0.04)"
                    }}>
                    <button
                        onClick={() => setCurrentApp(null)}
                        style={{
                            position: "absolute",
                            left: "16px",
                            top: "50%",
                            transform: "translateY(-50%)",
                            background: "none",
                            border: "none",
                            fontSize: "20px",
                            color: "#3d5c45",
                            cursor: "pointer",
                            padding: "8px"
                        }}>←
                              </button>
                    <span
                        style={{
                            fontSize: 17,
                            fontWeight: 700,
                            color: "#3d5c45"
                        }}>朋友圈</span>
                </div>
                <div
                    style={{
                        padding: "12px 16px"
                    }}>
                    <div
                        className="glass-btn"
                        style={{
                            width: "100%",
                            padding: "10px",
                            textAlign: "center",
                            fontSize: "13px",
                            fontWeight: 500
                        }}
                        onClick={() => setShowNewMoment(!showNewMoment)}>✏️ 发朋友圈
                                  </div>
                    {showNewMoment && <div
                        style={{
                            marginTop: 10,
                            display: "flex",
                            gap: 8
                        }}>
                        <input
                            value={newMomentText}
                            onChange={e => setNewMomentText(e.target.value)}
                            onKeyDown={e => {
                                if (e.key === "Enter")
                                    handlePostMoment();
                            }}
                            placeholder="分享你的心情..."
                            autoFocus
                            style={{
                                flex: 1,
                                padding: "8px 12px",
                                borderRadius: 10,
                                border: "none",
                                background: "rgba(255,255,255,0.5)",
                                fontSize: 13,
                                outline: "none"
                            }} />
                        <button
                            onClick={handlePostMoment}
                            style={{
                                padding: "8px 14px",
                                borderRadius: 10,
                                border: "none",
                                background: "#06b6d4",
                                color: "white",
                                fontSize: 13,
                                fontWeight: 500,
                                cursor: "pointer"
                            }}>发布</button>
                    </div>}
                </div>
                {momentsData.map(item => {
                    const iLiked = item.likes.includes("米米");

                    return (
                        <div key={item.id} className="feed-card">
                            <div className="feed-header">
                                <div
                                    className="feed-avatar"
                                    style={{
                                        background: item.color + "20"
                                    }}>{item.avatar}</div>
                                <div><div
                                        className="feed-name"
                                        style={{
                                            color: item.color
                                        }}>{item.name}</div><div className="feed-time">{item.time}</div></div>
                            </div>
                            <div className="feed-text">{item.text}</div>
                            {item.likes.length > 0 && <div className="feed-likes">❤️ {item.likes.join("、")}</div>}
                            {item.comments.length > 0 && <div className="feed-comments">
                                {item.comments.map((c, ci) => <div
                                    key={ci}
                                    className="feed-comment"
                                    style={{
                                        display: "flex",
                                        justifyContent: "space-between",
                                        alignItems: "flex-start"
                                    }}>
                                    <span>
                                        <b
                                            style={{
                                                color: c.from === "米米" ? "#06b6d4" : c.from === "爸爸" ? "#f59e0b" : c.from === "妈咪" ? "#ec4899" : "#666"
                                            }}>{c.from}</b>
                                        {c.replyTo && <span
                                            style={{
                                                color: "#999"
                                            }}>回复 </span>}
                                        {c.replyTo && <b
                                            style={{
                                                color: c.replyTo === "米米" ? "#06b6d4" : c.replyTo === "爸爸" ? "#f59e0b" : c.replyTo === "妈咪" ? "#ec4899" : "#666"
                                            }}>{c.replyTo}</b>}：{c.text}
                                    </span>
                                    <span
                                        style={{
                                            display: "flex",
                                            gap: 8,
                                            flexShrink: 0
                                        }}>
                                        <span
                                            style={{
                                                color: "#999",
                                                fontSize: "10px",
                                                cursor: "pointer"
                                            }}
                                            onClick={() => {
                                                setActiveCommentIdx(item.id);

                                                setReplyTo({
                                                    momentId: item.id,
                                                    commentFrom: c.from
                                                });

                                                setCommentInput("");
                                            }}>回复</span>
                                        {c.from === "米米" && <span
                                            style={{
                                                color: "#ef4444",
                                                fontSize: "10px",
                                                cursor: "pointer"
                                            }}
                                            onClick={() => setMomentsData(prev => prev.map(m => m.id === item.id ? {
                                                ...m,
                                                comments: m.comments.filter((_, idx) => idx !== ci)
                                            } : m))}>删除</span>}
                                    </span>
                                </div>)}
                            </div>}
                            <div className="feed-actions">
                                <span
                                    className={`feed-action ${iLiked ? "feed-action-liked" : ""}`}
                                    onClick={() => setMomentsData(prev => prev.map(m => m.id === item.id ? {
                                        ...m,
                                        likes: iLiked ? m.likes.filter(n => n !== "米米") : [...m.likes, "米米"]
                                    } : m))}>
                                    {iLiked ? "❤️ 已赞" : "🤍 赞"} {item.likes.length > 0 ? item.likes.length : ""}
                                </span>
                                <span
                                    className="feed-action"
                                    onClick={() => {
                                        setActiveCommentIdx(activeCommentIdx === item.id ? null : item.id);
                                        setCommentInput("");
                                    }}>💬 评论
                                                    </span>
                                {item.isMine && <span
                                    className="feed-action"
                                    style={{
                                        color: "#ef4444"
                                    }}
                                    onClick={() => setMomentsData(prev => prev.filter(m => m.id !== item.id))}>🗑️ 删除
                                                      </span>}
                            </div>
                            {activeCommentIdx === item.id && <div className="feed-comment-input">
                                <input
                                    value={commentInput}
                                    onChange={e => setCommentInput(e.target.value)}
                                    onKeyDown={e => {
                                        if (e.key === "Enter" && commentInput.trim()) {
                                            const txt = commentInput.trim();
                                            const rp = replyTo?.momentId === item.id ? replyTo.commentFrom : undefined;

                                            setMomentsData(prev => prev.map(m => m.id === item.id ? {
                                                ...m,

                                                comments: [...m.comments, {
                                                    from: "米米",
                                                    replyTo: rp,
                                                    text: txt
                                                }]
                                            } : m));

                                            setCommentInput("");
                                            setReplyTo(null);
                                            setTimeout(() => autoReplyToComment(item.id, txt, "米米"), 2000 + Math.random() * 4000);
                                        }
                                    }}
                                    placeholder={replyTo?.momentId === item.id ? `回复 ${replyTo.commentFrom}...` : "写评论..."}
                                    autoFocus />
                                <button
                                    onClick={() => {
                                        if (commentInput.trim()) {
                                            const txt = commentInput.trim();
                                            const rp = replyTo?.momentId === item.id ? replyTo.commentFrom : undefined;

                                            setMomentsData(prev => prev.map(m => m.id === item.id ? {
                                                ...m,

                                                comments: [...m.comments, {
                                                    from: "米米",
                                                    replyTo: rp,
                                                    text: txt
                                                }]
                                            } : m));

                                            setCommentInput("");
                                            setReplyTo(null);
                                            setTimeout(() => autoReplyToComment(item.id, txt, "米米"), 2000 + Math.random() * 4000);
                                        }
                                    }}>发送</button>
                            </div>}
                        </div>
                    );
                })}
            </div>
        );
    }

    const getSocialComments = (itemId: number): {
        avatar: string;
        role: string;
        text: string;
        time: string;
    }[] => {
        const socialComments: Record<number, {
            avatar: string;
            role: string;
            text: string;
            time: string;
        }[]> = {
            1: [{
                avatar: "🙏",
                role: "北海本地人",
                text: "已经转发到所有北海的群了，希望孩子平安回家！有线索的请尽快联系警方。",
                time: "12分钟前"
            }, {
                avatar: "👮",
                role: "蓝天救援队志愿者",
                text: "我们队已经出发支援了，请大家帮忙扩散信息，不要占用救援资源。孩子穿深蓝泳裤灰拖鞋，大家留意一下。",
                time: "8分钟前"
            }, {
                avatar: "❤️",
                role: "热心网友",
                text: "看到这个消息好心疼，孩子才8岁啊。已经帮忙转发了，希望奇迹发生，一家人能团圆。",
                time: "5分钟前"
            }],

            2: [{
                avatar: "🕯️",
                role: "寿光市民",
                text: "李队长是我们当地的英雄，这些年帮了太多家庭了。愿天堂没有车祸，一路走好。",
                time: "1小时前"
            }, {
                avatar: "😢",
                role: "公益同行者",
                text: "做公益寻人这么多年，深知其中的艰辛和危险。李队长用生命诠释了什么是大爱，向英雄致敬。",
                time: "45分钟前"
            }, {
                avatar: "🌹",
                role: "被帮助过的家属",
                text: "我儿子就是李队长帮忙找回来的，他从来不要回报。好人一生平安，愿您的家人得到妥善照顾。",
                time: "30分钟前"
            }],

            3: [{
                avatar: "👍",
                role: "科技向善关注者",
                text: "科技向善不是口号，是实实在在帮到了2万多个家庭。为这个公益项目点赞！",
                time: "2小时前"
            }, {
                avatar: "🎉",
                role: "曾被帮助的家庭",
                text: "我们就是这2.37万分之一，感谢抖音寻人让我们一家团圆。这份恩情永远记在心里。",
                time: "1小时前"
            }, {
                avatar: "📱",
                role: "互联网从业者",
                text: "用技术做公益是最有效的，地理位置精准弹窗这个思路太棒了。希望更多平台加入。",
                time: "50分钟前"
            }],

            4: [{
                avatar: "🐱",
                role: "动物保护志愿者",
                text: "成都启明基地我去过，每天1700斤粮食真的不够。益禾堂这个长期帮扶太及时了！",
                time: "3小时前"
            }, {
                avatar: "🐶",
                role: "基地负责人",
                text: "感谢益禾堂的长期支持，不是做一次性的秀，而是真正持续帮扶。毛孩子们有救了。",
                time: "2小时前"
            }, {
                avatar: "❤️",
                role: "爱心网友",
                text: "不做一次性公益，建立长期回访机制——这才是真正的公益态度。已领养两只，继续支持。",
                time: "1小时前"
            }],

            5: [{
                avatar: "🔍",
                role: "寻人志愿者",
                text: "已经90天了，孩子右手腕有脚印胎记是重要特征。请大家帮忙扩散，不要放弃希望。",
                time: "4小时前"
            }, {
                avatar: "💪",
                role: "四川当地人",
                text: "叙永县的朋友帮忙留意一下，孩子才2岁啊，太可怜了。已经转发到所有当地群。",
                time: "3小时前"
            }, {
                avatar: "🙏",
                role: "宝妈",
                text: "同为母亲，看到这个消息心都碎了。单亲妈妈太不容易了，愿孩子平安，早日回家。",
                time: "2小时前"
            }]
        };

        return socialComments[itemId] || [{
            avatar: "❤️",
            role: "热心网友",
            text: "希望事情能有好结果，大家一起加油。",
            time: "刚刚"
        }, {
            avatar: "🙏",
            role: "普通市民",
            text: "已转发，希望能帮到更多人。",
            time: "5分钟前"
        }, {
            avatar: "👍",
            role: "正能量博主",
            text: "社会需要更多这样的正能量，为所有付出的人点赞。",
            time: "10分钟前"
        }];
    };

    const getGeneralComments = (itemId: number, title: string): {
        avatar: string;
        role: string;
        text: string;
        time: string;
    }[] => {
        if (title.includes("考研") || title.includes("考试") || title.includes("教育")) {
            return [{
                avatar: "📚",
                role: "考研人",
                text: "看到预测了，教育学真的要涨吗？好慌，最后冲刺阶段了稳住心态！",
                time: "15分钟前"
            }, {
                avatar: "💪",
                role: "上岸学长",
                text: "去年也是这个时候焦虑，现在回头看其实没那么可怕。大家加油，坚持就是胜利！",
                time: "10分钟前"
            }, {
                avatar: "🎓",
                role: "在读研究生",
                text: "给学弟学妹们打气，考研只是人生的一条路，不管结果如何都值得骄傲。",
                time: "5分钟前"
            }];
        }

        if (title.includes("火锅") || title.includes("美食") || title.includes("排队")) {
            return [{
                avatar: "🍲",
                role: "吃货博主",
                text: "排队5小时也太夸张了吧！有没有去过的说说到底值不值？",
                time: "20分钟前"
            }, {
                avatar: "🌶️",
                role: "本地食客",
                text: "他家锅底确实不错，但5小时排队真的没必要。建议错峰去，工作日中午人少很多。",
                time: "12分钟前"
            }, {
                avatar: "😋",
                role: "美食爱好者",
                text: "空运毛肚+三代祖传锅底，这配置听着就香。已经加入打卡清单了！",
                time: "8分钟前"
            }];
        }

        return [{
            avatar: "💬",
            role: "热心网友",
            text: "这个话题很有意思，大家怎么看？欢迎理性讨论。",
            time: "15分钟前"
        }, {
            avatar: "👀",
            role: "吃瓜群众",
            text: "刚看到这个消息，了解一下情况。希望能有后续报道。",
            time: "10分钟前"
        }, {
            avatar: "🤔",
            role: "理性思考者",
            text: "事情没那么简单，建议大家多关注官方信息，不信谣不传谣。",
            time: "5分钟前"
        }];
    };

    function renderWeibo() {
        const formatCount = (n: number) => n >= 10000 ? (n / 10000).toFixed(1) + "万" : n >= 1000 ? (n / 1000).toFixed(1) + "千" : String(n);
        const formatHeat = (n: number) => n >= 100000000 ? (n / 100000000).toFixed(1) + "亿" : n >= 10000 ? (n / 10000).toFixed(0) + "万" : String(n);

        const toggleWeiboLike = (id: number) => {
            setWeiboData(prev => prev.map(p => p.id === id ? {
                ...p,
                iLiked: !p.iLiked,
                likes: p.iLiked ? p.likes - 1 : p.likes + 1
            } : p));

            const post = weiboData.find(p => p.id === id);

            if (post?.topic)
                bumpHotSearch(post.topic);
        };

        const addWeiboComment = (id: number) => {
            if (!weiboCommentInput.trim())
                return;

            const newComment: WeiboComment = {
                id: weiboNextId.current++,
                from: weiboAccount.nickname,
                avatar: weiboAccount.avatar,
                text: weiboCommentInput.trim(),
                time: "刚刚",
                likes: 0,
                iLiked: false
            };

            setWeiboData(prev => prev.map(p => p.id === id ? {
                ...p,
                comments: [...p.comments, newComment]
            } : p));

            setWeiboCommentInput("");
            const post = weiboData.find(p => p.id === id);

            if (post?.topic)
                bumpHotSearch(post.topic);
        };

        const handlePostWeibo = () => {
            if (!weiboPostText.trim())
                return;

            if (weiboPostImages.length > 0) {
                const cost = weiboPostImages.length * tokenPricing.postImage;

                if (!consumeToken(cost, `发${weiboPostImages.length}张图片`))
                    return;
            }

            if (weiboPostTopic) {
                const boost = Math.floor(Math.random() * 50000 + 30000);

                setWeiboHotSearch(prev => {
                    const updated = prev.map(item => {
                        if (item.title.includes(weiboPostTopic) || weiboPostTopic.includes(item.title)) {
                            return {
                                ...item,
                                heat: item.heat + boost
                            };
                        }

                        return item;
                    });

                    updated.sort((a, b) => b.heat - a.heat);

                    return updated.map((item, i) => ({
                        ...item,
                        id: i + 1
                    }));
                });
            }

            const newPost: WeiboPost = {
                id: weiboNextId.current++,
                avatar: weiboAccount.avatar,
                name: weiboAccount.nickname,
                time: "刚刚",
                text: weiboPostText.trim() + (weiboPostTopic ? ` #${weiboPostTopic}#` : ""),
                color: "#06b6d4",
                likes: 0,
                iLiked: false,
                comments: [],
                reposts: 0,
                images: weiboPostImages.length > 0 ? [...weiboPostImages] : undefined,
                topic: weiboPostTopic || undefined,
                expandedComments: false,
                commentsLoaded: true,
                visibility: "cp_only"
            };

            setWeiboData(prev => [newPost, ...prev]);
            setWeiboPostText("");
            setWeiboPostImages([]);
            setWeiboPostTopic("");
            setShowWeiboPost(false);
        };

        const toggleFollow = (name: string) => {
            setWeiboFollowing(
                prev => prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]
            );
        };

        const toggleCommentLike = (postId: number, commentId: number) => {
            setWeiboData(prev => prev.map(p => p.id === postId ? {
                ...p,

                comments: p.comments.map(c => c.id === commentId ? {
                    ...c,
                    iLiked: !c.iLiked,
                    likes: c.iLiked ? c.likes - 1 : c.likes + 1
                } : c)
            } : p));
        };

        const expandComments = (post: WeiboPost) => {
            if (!post.expandedComments) {
                setWeiboData(prev => prev.map(p => p.id === post.id ? {
                    ...p,
                    expandedComments: true
                } : p));

                if (!post.commentsLoaded)
                    generateWeiboComments(post);
            } else {
                setWeiboData(prev => prev.map(p => p.id === post.id ? {
                    ...p,
                    expandedComments: false
                } : p));
            }
        };

        const saveWeiboProfile = () => {
            if (!weiboProfileNick.trim())
                return;

            setWeiboAccount({
                nickname: weiboProfileNick.trim(),
                avatar: weiboProfileAvatar,
                bio: weiboProfileBio.trim(),
                isSet: true
            });

            setShowWeiboProfileEdit(false);
        };

        const availableAvatars = ["😎", "🦊", "🐱", "🐶", "🐰", "🦋", "🌸", "⭐", "🎨", "🎭", "🦄", "🐧"];

        const weiboNavBar = <div
            style={{
                position: "sticky",
                top: 0,
                zIndex: 20,
                background: "rgba(255,255,255,0.85)",
                backdropFilter: "blur(20px)",
                borderBottom: "1px solid rgba(0,0,0,0.06)"
            }}>
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "8px 16px",
                    position: "relative"
                }}>
                <button
                    onClick={() => setCurrentApp(null)}
                    style={{
                        background: "none",
                        border: "none",
                        fontSize: "20px",
                        color: "#333",
                        cursor: "pointer",
                        padding: "8px",
                        marginLeft: "-8px"
                    }}>←
                              </button>
                <span
                    style={{
                        fontSize: 16,
                        fontWeight: 700,
                        color: "#333",
                        position: "absolute",
                        left: "50%",
                        transform: "translateX(-50%)"
                    }}>微博</span>
                <div
                    style={{
                        display: "flex",
                        gap: 12
                    }}>
                    <span
                        style={{
                            cursor: "pointer",
                            fontSize: 18
                        }}
                        onClick={() => setShowWeiboPost(true)}>✏️</span>
                    <span
                        style={{
                            cursor: "pointer",
                            fontSize: 18
                        }}>🔍</span>
                </div>
            </div>
            <div
                style={{
                    display: "flex",
                    borderBottom: "1px solid rgba(0,0,0,0.04)"
                }}>
                {(["home", "discover", "messages", "me"] as const).map(tab => {
                    const labels = {
                        home: "首页",
                        discover: "发现",
                        messages: "消息",
                        me: "我的"
                    };

                    const icons = {
                        home: "🏠",
                        discover: "🔍",
                        messages: "💬",
                        me: "👤"
                    };

                    return (
                        <div
                            key={tab}
                            onClick={() => setWeiboTab(tab)}
                            style={{
                                flex: 1,
                                textAlign: "center",
                                padding: "6px 0",
                                cursor: "pointer",
                                fontSize: 12,
                                fontWeight: weiboTab === tab ? 600 : 400,
                                color: weiboTab === tab ? "#f59e0b" : "#999",
                                borderBottom: weiboTab === tab ? "2px solid #f59e0b" : "2px solid transparent",
                                transition: "all 0.2s"
                            }}>
                            <div
                                style={{
                                    fontSize: 16
                                }}>{icons[tab]}</div>
                            <div>{labels[tab]}</div>
                        </div>
                    );
                })}
                {}
                {weiboSim && weiboSim.superTopic && <div
                    style={{
                        marginTop: 8,
                        padding: "8px 12px",
                        background: "rgba(255,255,255,0.55)",
                        borderRadius: 10,
                        border: "1px solid rgba(0,0,0,0.04)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between"
                    }}>
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6
                        }}>
                        <span
                            style={{
                                fontSize: 14
                            }}>💫</span>
                        <div>
                            <div
                                style={{
                                    fontSize: 10,
                                    fontWeight: 600,
                                    color: "#666"
                                }}>{weiboSim.superTopic.name}</div>
                            <div
                                style={{
                                    fontSize: 9,
                                    color: "#999"
                                }}>📝 {formatHeat(weiboSim.superTopic.postCount)}帖子 · 👥 {formatHeat(weiboSim.superTopic.checkInCount)}签到
                                                  </div>
                        </div>
                    </div>
                    <button
                        onClick={() => {
                            setTopicPage(weiboSim.superTopic!.name);
                        }}
                        style={{
                            fontSize: 9,
                            padding: "3px 10px",
                            borderRadius: 10,
                            background: "rgba(245,158,11,0.1)",
                            color: "#b45309",
                            border: "none",
                            fontWeight: 600,
                            cursor: "pointer"
                        }}>进入超话 →
                                      </button>
                </div>}
                {lastNewsUpdate && <div
                    style={{
                        marginTop: 6,
                        padding: "4px 8px",
                        fontSize: 9,
                        color: "#aaa",
                        textAlign: "right"
                    }}>📰 社会榜更新于 {lastNewsUpdate}
                </div>}
            </div>
        </div>;

        const renderHotSearch = () => {
            const filtered = weiboHotSearch.filter(item => {
                if (hotSearchTab === "all")
                    return true;

                if (hotSearchTab === "entertainment")
                    return item.type === "entertainment";

                if (hotSearchTab === "social")
                    return item.type === "social" || item.type === "general";

                return true;
            });

            const tabLabel = hotSearchTab === "all" ? "总榜" : hotSearchTab === "entertainment" ? "文娱榜" : "社会榜";
            const tabIcon = hotSearchTab === "all" ? "🏆" : hotSearchTab === "entertainment" ? "🎬" : "🤝";
            const simData = weiboSim;

            return (
                <div
                    style={{
                        padding: "0 12px 12px"
                    }}>
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            marginBottom: 6
                        }}>
                        <div
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8
                            }}>
                            <span
                                style={{
                                    fontSize: 14,
                                    fontWeight: 700,
                                    color: "#333"
                                }}>{tabIcon}微博{tabLabel}</span>
                            {simData && <span
                                style={{
                                    fontSize: 9,
                                    padding: "1px 6px",
                                    borderRadius: 8,
                                    background: "#fef3c7",
                                    color: "#b45309",
                                    fontWeight: 600
                                }}>🔥 {formatHeat(simData.heat)}
                            </span>}
                        </div>
                        <button
                            onClick={() => refreshWeiboData()}
                            style={{
                                fontSize: 10,
                                padding: "3px 10px",
                                borderRadius: 10,
                                background: weiboRefreshing ? "rgba(245,158,11,0.15)" : "rgba(255,255,255,0.7)",
                                color: weiboRefreshing ? "#b45309" : "#999",
                                border: "1px solid rgba(0,0,0,0.08)",
                                cursor: "pointer",
                                transition: "all 0.3s",
                                fontWeight: 500
                            }}>
                            {weiboRefreshing ? "⏳ 刷新中" : "🔄 刷新"}
                        </button>
                    </div>
                    {}
                    <div
                        style={{
                            display: "flex",
                            gap: 6,
                            marginBottom: 8
                        }}>
                        {(["all", "entertainment", "social"] as const).map(tab => {
                            const labels = {
                                all: "🏆 总榜",
                                entertainment: "🎬 文娱榜",
                                social: "🤝 社会榜"
                            };

                            const active = hotSearchTab === tab;

                            return (
                                <button
                                    key={tab}
                                    onClick={() => {
                                        setHotSearchTab(tab);
                                        setExpandedHotItem(null);
                                    }}
                                    style={{
                                        padding: "5px 12px",
                                        borderRadius: 16,
                                        fontSize: 10,
                                        fontWeight: active ? 700 : 500,
                                        cursor: "pointer",
                                        border: active ? "1.5px solid #f59e0b" : "1px solid rgba(0,0,0,0.08)",
                                        background: active ? "rgba(254,243,199,0.8)" : "rgba(255,255,255,0.6)",
                                        color: active ? "#92400e" : "#888",
                                        transition: "all 0.2s"
                                    }}>{labels[tab]}</button>
                            );
                        })}
                    </div>
                    {filtered.map((item, idx) => {
                        const isExpanded = expandedHotItem === item.id;

                        return (
                            <div key={item.id}>
                                <div
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        padding: "8px 4px",
                                        borderBottom: isExpanded ? "none" : "1px solid rgba(0,0,0,0.04)",
                                        cursor: "pointer"
                                    }}
                                    onClick={() => {
                                        setExpandedHotItem(isExpanded ? null : item.id);
                                        bumpHotSearch(item.title);
                                    }}>
                                    <span
                                        style={{
                                            width: 20,
                                            fontSize: 13,
                                            fontWeight: 700,
                                            color: idx < 3 ? "#ef4444" : "#999",
                                            flexShrink: 0
                                        }}>{idx + 1}</span>
                                    <div
                                        style={{
                                            flex: 1,
                                            minWidth: 0
                                        }}>
                                        <div
                                            style={{
                                                fontSize: 12,
                                                fontWeight: 500,
                                                color: "#333",
                                                overflow: "hidden",
                                                textOverflow: "ellipsis",
                                                whiteSpace: "nowrap"
                                            }}>
                                            {item.title}
                                            {item.tag && <span
                                                style={{
                                                    marginLeft: 4,
                                                    fontSize: 9,
                                                    background: item.tagColor || "#f97316",
                                                    color: "#fff",
                                                    padding: "0 4px",
                                                    borderRadius: 3,
                                                    verticalAlign: "middle"
                                                }}>{item.tag}</span>}
                                        </div>
                                        <div
                                            style={{
                                                fontSize: 10,
                                                color: "#999",
                                                marginTop: 1
                                            }}>{formatHeat(item.heat)}</div>
                                    </div>
                                    <span
                                        style={{
                                            fontSize: 14,
                                            color: "#ccc",
                                            transition: "transform 0.2s",
                                            transform: isExpanded ? "rotate(180deg)" : "rotate(0)"
                                        }}>▾</span>
                                </div>
                                {}
                                {isExpanded && <div
                                    style={{
                                        marginLeft: 24,
                                        padding: "10px 14px",
                                        marginBottom: 8,
                                        background: "rgba(255,255,255,0.75)",
                                        borderRadius: 12,
                                        border: "1px solid rgba(253,230,138,0.4)",
                                        boxShadow: "0 2px 8px rgba(146,64,0,0.04)"
                                    }}>
                                    {}
                                    <div
                                        style={{
                                            marginBottom: 6
                                        }}>
                                        <span
                                            style={{
                                                fontSize: 9,
                                                padding: "2px 8px",
                                                borderRadius: 10,
                                                background: item.type === "social" ? "#dcfce7" : item.type === "entertainment" ? "#fef3c7" : "#f3f4f6",
                                                color: item.type === "social" ? "#166534" : item.type === "entertainment" ? "#92400e" : "#666",
                                                fontWeight: 600
                                            }}>
                                            {item.type === "social" ? "🤝 社会榜" : item.type === "entertainment" ? "🎬 文娱榜" : "🏆 总榜"}
                                        </span>
                                    </div>
                                    {}
                                    <div
                                        style={{
                                            fontSize: 12,
                                            lineHeight: 1.7,
                                            color: "#444",
                                            marginBottom: 8
                                        }}>{item.detail || "暂无详细内容"}</div>
                                    {}
                                    {item.detailImage && <div
                                        style={{
                                            marginBottom: 8,
                                            borderRadius: 10,
                                            overflow: "hidden"
                                        }}>
                                        <img
                                            src={item.detailImage}
                                            alt={item.title}
                                            style={{
                                                width: "100%",
                                                maxHeight: 200,
                                                objectFit: "cover",
                                                borderRadius: 10
                                            }} />
                                    </div>}
                                    {}
                                    {item.type === "social" ? <div
                                        style={{
                                            marginBottom: 10,
                                            padding: "8px 10px",
                                            background: "rgba(255,255,255,0.5)",
                                            borderRadius: 10,
                                            border: "1px solid rgba(34,197,94,0.15)"
                                        }}>
                                        <div
                                            style={{
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "space-between",
                                                marginBottom: 6
                                            }}>
                                            <span
                                                style={{
                                                    fontSize: 10,
                                                    fontWeight: 700,
                                                    color: "#166534"
                                                }}>💬 网友留言</span>
                                            <span
                                                style={{
                                                    fontSize: 9,
                                                    color: "#aaa"
                                                }}>❤️ {formatHeat(item.heat * 0.3)}· 💬 {formatHeat(item.heat * 0.12)}</span>
                                        </div>
                                        {getSocialComments(item.id).map((
                                            c: {
                                                avatar: string;
                                                role: string;
                                                text: string;
                                                time: string;
                                            },
                                            ci: number
                                        ) => <div
                                            key={ci}
                                            style={{
                                                display: "flex",
                                                gap: 6,
                                                padding: "4px 0",
                                                borderBottom: ci < 2 ? "1px solid rgba(0,0,0,0.03)" : "none"
                                            }}>
                                            <span
                                                style={{
                                                    fontSize: 12,
                                                    flexShrink: 0
                                                }}>{c.avatar}</span>
                                            <div
                                                style={{
                                                    flex: 1,
                                                    minWidth: 0
                                                }}>
                                                <div
                                                    style={{
                                                        display: "flex",
                                                        alignItems: "center",
                                                        gap: 4,
                                                        marginBottom: 1
                                                    }}>
                                                    <span
                                                        style={{
                                                            fontSize: 10,
                                                            fontWeight: 600,
                                                            color: "#166534"
                                                        }}>{c.role}</span>
                                                </div>
                                                <div
                                                    style={{
                                                        fontSize: 11,
                                                        color: "#555",
                                                        lineHeight: 1.5
                                                    }}>{c.text}</div>
                                                <div
                                                    style={{
                                                        fontSize: 9,
                                                        color: "#bbb",
                                                        marginTop: 2
                                                    }}>{c.time}</div>
                                            </div>
                                        </div>)}
                                    </div> : item.type === "general" ? <div
                                        style={{
                                            marginBottom: 10,
                                            padding: "8px 10px",
                                            background: "rgba(255,255,255,0.5)",
                                            borderRadius: 10,
                                            border: "1px solid rgba(0,0,0,0.05)"
                                        }}>
                                        <div
                                            style={{
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "space-between",
                                                marginBottom: 6
                                            }}>
                                            <span
                                                style={{
                                                    fontSize: 10,
                                                    fontWeight: 700,
                                                    color: "#666"
                                                }}>💬 网友讨论</span>
                                            <span
                                                style={{
                                                    fontSize: 9,
                                                    color: "#aaa"
                                                }}>❤️ {formatHeat(item.heat * 0.2)}· 💬 {formatHeat(item.heat * 0.08)}</span>
                                        </div>
                                        {getGeneralComments(item.id, item.title).map((c, ci) => <div
                                            key={ci}
                                            style={{
                                                display: "flex",
                                                gap: 6,
                                                padding: "4px 0",
                                                borderBottom: ci < 2 ? "1px solid rgba(0,0,0,0.03)" : "none"
                                            }}>
                                            <span
                                                style={{
                                                    fontSize: 12,
                                                    flexShrink: 0
                                                }}>{c.avatar}</span>
                                            <div
                                                style={{
                                                    flex: 1,
                                                    minWidth: 0
                                                }}>
                                                <div
                                                    style={{
                                                        display: "flex",
                                                        alignItems: "center",
                                                        gap: 4,
                                                        marginBottom: 1
                                                    }}>
                                                    <span
                                                        style={{
                                                            fontSize: 10,
                                                            fontWeight: 600,
                                                            color: "#555"
                                                        }}>{c.role}</span>
                                                </div>
                                                <div
                                                    style={{
                                                        fontSize: 11,
                                                        color: "#555",
                                                        lineHeight: 1.5
                                                    }}>{c.text}</div>
                                                <div
                                                    style={{
                                                        fontSize: 9,
                                                        color: "#bbb",
                                                        marginTop: 2
                                                    }}>{c.time}</div>
                                            </div>
                                        </div>)}
                                    </div> : simData ? <div
                                        style={{
                                            marginBottom: 10,
                                            padding: "8px 10px",
                                            background: "rgba(255,255,255,0.5)",
                                            borderRadius: 10,
                                            border: "1px solid rgba(0,0,0,0.05)"
                                        }}>
                                        <div
                                            style={{
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "space-between",
                                                marginBottom: 6
                                            }}>
                                            <span
                                                style={{
                                                    fontSize: 10,
                                                    fontWeight: 700,
                                                    color: "#888"
                                                }}>💬 精选评论</span>
                                            <span
                                                style={{
                                                    fontSize: 9,
                                                    color: "#aaa"
                                                }}>❤️ {formatHeat(simData.likes)}· 💬 {formatHeat(simData.comments)}· 🔄 {formatHeat(simData.reposts)}
                                            </span>
                                        </div>
                                        {simData.simComments.slice(0, 3).map((
                                            c: {
                                                avatar: string;
                                                persona: string;
                                                text: string;
                                                time: string;
                                            },
                                            ci: number
                                        ) => <div
                                            key={ci}
                                            style={{
                                                display: "flex",
                                                gap: 6,
                                                padding: "4px 0",
                                                borderBottom: ci < 2 ? "1px solid rgba(0,0,0,0.03)" : "none"
                                            }}>
                                            <span
                                                style={{
                                                    fontSize: 12,
                                                    flexShrink: 0
                                                }}>{c.avatar}</span>
                                            <div
                                                style={{
                                                    flex: 1,
                                                    minWidth: 0
                                                }}>
                                                <div
                                                    style={{
                                                        display: "flex",
                                                        alignItems: "center",
                                                        gap: 4,
                                                        marginBottom: 1
                                                    }}>
                                                    <span
                                                        style={{
                                                            fontSize: 10,
                                                            fontWeight: 600,
                                                            color: c.persona === "CP粉" ? "#dc2626" : c.persona === "毒唯" ? "#6b7280" : c.persona === "乐子人" ? "#b45309" : "#0284c7"
                                                        }}>{c.persona}</span>
                                                    <span
                                                        style={{
                                                            fontSize: 8,
                                                            padding: "0 4px",
                                                            borderRadius: 4,
                                                            background: c.persona === "CP粉" ? "#fee2e2" : c.persona === "毒唯" ? "#f3f4f6" : c.persona === "乐子人" ? "#fef3c7" : "#e0f2fe",
                                                            color: c.persona === "CP粉" ? "#dc2626" : c.persona === "毒唯" ? "#6b7280" : c.persona === "乐子人" ? "#b45309" : "#0284c7",
                                                            fontWeight: 500
                                                        }}>
                                                        {c.persona}
                                                    </span>
                                                </div>
                                                <div
                                                    style={{
                                                        fontSize: 11,
                                                        color: "#555",
                                                        lineHeight: 1.5
                                                    }}>{c.text}</div>
                                                <div
                                                    style={{
                                                        fontSize: 9,
                                                        color: "#bbb",
                                                        marginTop: 2
                                                    }}>{c.time}</div>
                                            </div>
                                        </div>)}
                                    </div> : null}
                                    {}
                                    <div
                                        style={{
                                            display: "flex",
                                            gap: 6
                                        }}>
                                        <button
                                            onClick={() => {
                                                setTopicPage(item.title);
                                            }}
                                            style={{
                                                flex: 1,
                                                padding: "7px 12px",
                                                borderRadius: 8,
                                                background: "linear-gradient(135deg, #f59e0b, #d97706)",
                                                color: "#fff",
                                                border: "none",
                                                fontWeight: 600,
                                                fontSize: 10,
                                                cursor: "pointer",
                                                boxShadow: "0 2px 6px rgba(245,158,11,0.2)"
                                            }}>📖 查看词条帖子
                                                                  </button>
                                        <button
                                            onClick={() => {
                                                setWeiboPostTopic(item.title);
                                                setShowWeiboPost(true);
                                            }}
                                            style={{
                                                flex: 1,
                                                padding: "7px 12px",
                                                borderRadius: 8,
                                                background: "rgba(255,255,255,0.8)",
                                                color: "#92400e",
                                                border: "1px solid rgba(245,158,11,0.3)",
                                                fontWeight: 600,
                                                fontSize: 10,
                                                cursor: "pointer"
                                            }}>✍️ 发帖参与
                                                                  </button>
                                    </div>
                                </div>}
                            </div>
                        );
                    })}
                </div>
            );
        };

        const renderTopicPage = () => {
            if (!topicPage)
                return null;

            const relatedPosts = weiboData.filter(
                p => p.topic === topicPage || p.text.includes(topicPage) || p.text.includes("#") && topicPage.includes(p.text.split("#")[1]?.split("#")[0] || "")
            );

            const allPosts = relatedPosts.length > 0 ? relatedPosts : topicPosts;

            const aiGeneratedPosts: WeiboPost[] = topicPosts.length === 0 && relatedPosts.length === 0 ? [{
                id: 9001,
                avatar: "🌽",
                name: "甜玉米1号",
                time: "刚刚",
                text: `#${topicPage}# 这个话题太有讨论价值了！大家怎么看？`,
                color: "#22c55e",
                likes: 234,
                iLiked: false,

                comments: [{
                    id: 99001,
                    avatar: "🍯",
                    from: "蜜糖CP粉",
                    text: "我觉得这波必须支持！",
                    time: "1分钟前",
                    likes: 45,
                    iLiked: false
                }, {
                    id: 99002,
                    avatar: "💕",
                    from: "宇宙第一甜",
                    text: "同意+1 真的好有爱",
                    time: "刚刚",
                    likes: 23,
                    iLiked: false
                }],

                reposts: 89,
                expandedComments: false,
                commentsLoaded: true
            }, {
                id: 9002,
                avatar: "🔥",
                name: "CP前线记者",
                time: "5分钟前",
                text: `刚看到#${topicPage}# 这个话题冲上热搜了！作为前线记者我来报道一下`,
                color: "#ef4444",
                likes: 567,
                iLiked: false,

                comments: [{
                    id: 99003,
                    avatar: "🎀",
                    from: "甜甜的小粉丝",
                    text: "记者大大辛苦了！",
                    time: "3分钟前",
                    likes: 12,
                    iLiked: false
                }],

                reposts: 156,
                expandedComments: false,
                commentsLoaded: true
            }] : [];

            const displayPosts = allPosts.length > 0 ? allPosts : aiGeneratedPosts;

            return (
                <div
                    style={{
                        position: "absolute",
                        inset: 0,
                        zIndex: 55,
                        background: "#fef9ee",
                        display: "flex",
                        flexDirection: "column",
                        overflow: "hidden"
                    }}>
                    {}
                    <div
                        className="status-bar"
                        style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "14px 20px 10px",
                            background: "rgba(255,255,255,0.5)",
                            backdropFilter: "blur(12px)",
                            borderBottom: "1px solid rgba(0,0,0,0.05)"
                        }}>
                        <button
                            onClick={() => {
                                setTopicPage(null);
                                setTopicPosts([]);
                            }}
                            style={{
                                fontSize: 20,
                                background: "none",
                                border: "none",
                                cursor: "pointer",
                                padding: 0,
                                lineHeight: 1
                            }}>←</button>
                        <span
                            style={{
                                fontSize: 15,
                                fontWeight: 700,
                                color: "#78350f",
                                flex: 1,
                                textAlign: "center",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap"
                            }}>#{topicPage}#</span>
                        <button
                            onClick={() => {
                                setWeiboPostTopic(topicPage);
                                setShowWeiboPost(true);
                            }}
                            style={{
                                fontSize: 20,
                                background: "none",
                                border: "none",
                                cursor: "pointer",
                                padding: 0,
                                lineHeight: 1
                            }}>✍️</button>
                    </div>
                    {}
                    <div
                        style={{
                            flex: 1,
                            overflowY: "auto",
                            paddingBottom: 80
                        }}>
                        {displayPosts.map(post => <div
                            key={post.id}
                            style={{
                                padding: "12px 16px",
                                borderBottom: "4px solid #f5f5f5",
                                background: "#fff"
                            }}>
                            <div
                                style={{
                                    display: "flex",
                                    gap: 8
                                }}>
                                <div
                                    style={{
                                        width: 36,
                                        height: 36,
                                        borderRadius: "50%",
                                        background: post.color + "20",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        fontSize: 18,
                                        flexShrink: 0
                                    }}>{post.avatar}</div>
                                <div
                                    style={{
                                        flex: 1,
                                        minWidth: 0
                                    }}>
                                    <div
                                        style={{
                                            display: "flex",
                                            alignItems: "center",
                                            gap: 4
                                        }}>
                                        <span
                                            style={{
                                                fontSize: 13,
                                                fontWeight: 600,
                                                color: post.color
                                            }}>{post.name}</span>
                                        {post.verified && <span
                                            style={{
                                                fontSize: 9,
                                                background: post.color,
                                                color: "#fff",
                                                padding: "0 4px",
                                                borderRadius: 3
                                            }}>V</span>}
                                    </div>
                                    <div
                                        style={{
                                            fontSize: 10,
                                            color: "#999",
                                            marginTop: 1
                                        }}>{post.time}</div>
                                </div>
                            </div>
                            <div
                                style={{
                                    fontSize: 13,
                                    lineHeight: 1.6,
                                    color: "#333",
                                    marginTop: 8,
                                    wordBreak: "break-word"
                                }}>
                                {post.text.split("#").map((part, i) => i % 2 === 1 ? <span
                                    key={i}
                                    style={{
                                        color: "#f59e0b",
                                        fontWeight: 500,
                                        cursor: "pointer"
                                    }}
                                    onClick={() => {
                                        setTopicPage(part);
                                    }}>#{part}#</span> : part)}
                            </div>
                            {}
                            {post.comments.length > 0 && <div
                                style={{
                                    marginTop: 8,
                                    padding: "8px 10px",
                                    background: "rgba(254,243,199,0.2)",
                                    borderRadius: 10,
                                    border: "1px solid rgba(253,230,138,0.2)"
                                }}>
                                {post.comments.map(c => <div
                                    key={c.id}
                                    style={{
                                        padding: "4px 0",
                                        borderBottom: "1px solid rgba(0,0,0,0.03)"
                                    }}>
                                    <span
                                        style={{
                                            fontSize: 11,
                                            fontWeight: 600,
                                            color: "#f59e0b"
                                        }}>{c.avatar} {c.from}</span>
                                    <span
                                        style={{
                                            fontSize: 10,
                                            color: "#999",
                                            marginLeft: 4
                                        }}>{c.time}</span>
                                    <div
                                        style={{
                                            fontSize: 12,
                                            color: "#555",
                                            marginTop: 1
                                        }}>{c.text}</div>
                                </div>)}
                            </div>}
                        </div>)}
                    </div>
                </div>
            );
        };

        const renderWeiboCard = (item: WeiboPost) => {
            const isOwn = item.name === weiboAccount.nickname;
            const isFollowed = weiboFollowing.includes(item.name);

            return (
                <div
                    key={item.id}
                    style={{
                        padding: "12px 16px",
                        borderBottom: "4px solid #f5f5f5",
                        background: "#fff"
                    }}>
                    <div
                        style={{
                            display: "flex",
                            gap: 8
                        }}>
                        <div
                            style={{
                                width: 36,
                                height: 36,
                                borderRadius: "50%",
                                background: item.color + "20",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: 18,
                                flexShrink: 0
                            }}>{item.avatar}</div>
                        <div
                            style={{
                                flex: 1,
                                minWidth: 0
                            }}>
                            <div
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 4
                                }}>
                                <span
                                    style={{
                                        fontSize: 13,
                                        fontWeight: 600,
                                        color: item.color
                                    }}>{item.name}</span>
                                {item.verified && <span
                                    style={{
                                        fontSize: 9,
                                        background: item.color,
                                        color: "#fff",
                                        padding: "0 4px",
                                        borderRadius: 3
                                    }}>V</span>}
                                {item.tag && <span
                                    style={{
                                        fontSize: 9,
                                        color: "#999",
                                        background: "#f3f4f6",
                                        padding: "0 4px",
                                        borderRadius: 3
                                    }}>{item.tag}</span>}
                            </div>
                            <div
                                style={{
                                    fontSize: 10,
                                    color: "#999",
                                    marginTop: 1
                                }}>{item.time}</div>
                        </div>
                        {!isOwn && <button
                            onClick={() => toggleFollow(item.name)}
                            style={{
                                fontSize: 10,
                                padding: "4px 10px",
                                borderRadius: 14,
                                fontWeight: 600,
                                cursor: "pointer",
                                flexShrink: 0,
                                transition: "all 0.2s",

                                ...(isFollowed ? {
                                    background: "#f3f4f6",
                                    color: "#999",
                                    border: "1px solid #e5e7eb"
                                } : {
                                    background: "#fef3c7",
                                    color: "#f59e0b",
                                    border: "1px solid #f59e0b"
                                })
                            }}>{isFollowed ? "已关注" : "+ 关注"}</button>}
                    </div>
                    <div
                        style={{
                            fontSize: 13,
                            lineHeight: 1.6,
                            color: "#333",
                            marginTop: 8,
                            wordBreak: "break-word"
                        }}>{item.text}</div>
                    {}
                    {item.images && item.images.length > 0 && <div
                        style={{
                            display: "grid",
                            gridTemplateColumns: item.images.length === 1 ? "1fr" : "repeat(3, 1fr)",
                            gap: 4,
                            marginTop: 8
                        }}>
                        {item.images.map((img, i) => <div
                            key={i}
                            style={{
                                aspectRatio: "1",
                                borderRadius: 8,
                                background: "linear-gradient(135deg, #fef3c7, #fde68a)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: 24
                            }}>🖼️</div>)}
                    </div>}
                    {}
                    {item.expandedComments && item.comments.length > 0 && <div
                        style={{
                            marginTop: 10,
                            background: "#f8f8f8",
                            borderRadius: 8,
                            padding: "8px 10px"
                        }}>
                        {item.comments.slice(0, 20).map(c => <div
                            key={c.id}
                            style={{
                                fontSize: 11,
                                lineHeight: 1.7,
                                padding: "3px 0",
                                display: "flex",
                                alignItems: "flex-start",
                                gap: 4
                            }}>
                            <span
                                style={{
                                    fontSize: 13,
                                    flexShrink: 0
                                }}>{c.avatar}</span>
                            <div
                                style={{
                                    flex: 1
                                }}>
                                <span
                                    style={{
                                        color: item.color,
                                        fontWeight: 600,
                                        fontSize: 11
                                    }}>{c.from}</span>
                                {c.replyTo && <span
                                    style={{
                                        color: "#999",
                                        fontSize: 10
                                    }}>回复 @{c.replyTo}</span>}
                                <span
                                    style={{
                                        color: "#333"
                                    }}>：{c.text}</span>
                                <div
                                    style={{
                                        display: "flex",
                                        gap: 8,
                                        marginTop: 2
                                    }}>
                                    <span
                                        style={{
                                            fontSize: 9,
                                            color: "#999"
                                        }}>{c.time}</span>
                                    <span
                                        style={{
                                            fontSize: 9,
                                            color: "#999",
                                            cursor: "pointer"
                                        }}
                                        onClick={() => toggleCommentLike(item.id, c.id)}>
                                        {c.iLiked ? "❤️" : "🤍"} {c.likes > 0 ? c.likes : ""}
                                    </span>
                                </div>
                            </div>
                        </div>)}
                        {item.comments.length > 20 && <div
                            style={{
                                fontSize: 10,
                                color: "#999",
                                textAlign: "center",
                                padding: 4
                            }}>还有更多评论...</div>}
                    </div>}
                    {}
                    {activeWeiboComment === item.id && <div
                        style={{
                            display: "flex",
                            gap: 6,
                            marginTop: 8
                        }}>
                        <input
                            value={weiboCommentInput}
                            onChange={e => setWeiboCommentInput(e.target.value)}
                            onKeyDown={e => e.key === "Enter" && addWeiboComment(item.id)}
                            placeholder="写评论..."
                            style={{
                                flex: 1,
                                fontSize: 11,
                                padding: "6px 10px",
                                borderRadius: 16,
                                border: "1px solid #e5e7eb",
                                outline: "none",
                                background: "#f8f8f8"
                            }} />
                        <button
                            onClick={() => addWeiboComment(item.id)}
                            style={{
                                fontSize: 11,
                                padding: "6px 12px",
                                borderRadius: 16,
                                background: "#f59e0b",
                                color: "#fff",
                                border: "none",
                                fontWeight: 600
                            }}>发送</button>
                    </div>}
                    {}
                    <div
                        style={{
                            display: "flex",
                            justifyContent: "space-around",
                            marginTop: 10,
                            paddingTop: 8,
                            borderTop: "1px solid #f0f0f0"
                        }}>
                        <span
                            style={{
                                cursor: "pointer",
                                fontSize: 12,
                                color: "#999",
                                display: "flex",
                                alignItems: "center",
                                gap: 3,
                                padding: "4px 8px",
                                borderRadius: 20,
                                transition: "background 0.2s"
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = "#f5f5f5"}
                            onMouseLeave={e => e.currentTarget.style.background = "transparent"}>🔁 {formatCount(item.reposts)}
                        </span>
                        <span
                            style={{
                                cursor: "pointer",
                                fontSize: 12,
                                color: "#999",
                                display: "flex",
                                alignItems: "center",
                                gap: 3,
                                padding: "4px 8px",
                                borderRadius: 20,
                                transition: "background 0.2s"
                            }}
                            onClick={() => {
                                expandComments(item);
                                setActiveWeiboComment(activeWeiboComment === item.id ? null : item.id);
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = "#f5f5f5"}
                            onMouseLeave={e => e.currentTarget.style.background = "transparent"}>💬 {item.comments.length > 0 ? formatCount(item.comments.length) : "评论"}
                        </span>
                        <span
                            style={{
                                cursor: "pointer",
                                fontSize: 12,
                                color: item.iLiked ? "#ef4444" : "#999",
                                display: "flex",
                                alignItems: "center",
                                gap: 3,
                                padding: "4px 8px",
                                borderRadius: 20,
                                transition: "background 0.2s"
                            }}
                            onClick={() => toggleWeiboLike(item.id)}
                            onMouseEnter={e => e.currentTarget.style.background = "#fef2f2"}
                            onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                            {item.iLiked ? "❤️" : "🤍"} {formatCount(item.likes)}
                        </span>
                    </div>
                </div>
            );
        };

        const renderPostModal = () => showWeiboPost && <div
            style={{
                position: "absolute",
                inset: 0,
                zIndex: 50,
                background: "rgba(0,0,0,0.4)",
                display: "flex",
                flexDirection: "column",
                justifyContent: "flex-end"
            }}
            onClick={() => setShowWeiboPost(false)}>
            <div
                style={{
                    background: "#fff",
                    borderRadius: "16px 16px 0 0",
                    padding: 16,
                    maxHeight: "70%",
                    overflow: "auto"
                }}
                onClick={e => e.stopPropagation()}>
                <div
                    style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: 12
                    }}>
                    <span
                        style={{
                            fontSize: 14,
                            fontWeight: 700
                        }}>发微博</span>
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8
                        }}>
                        {weiboPostImages.length > 0 && <span
                            style={{
                                fontSize: 10,
                                color: "#8b5cf6"
                            }}>💎 -{weiboPostImages.length * tokenPricing.postImage}</span>}
                        <button
                            onClick={handlePostWeibo}
                            style={{
                                fontSize: 12,
                                padding: "6px 16px",
                                borderRadius: 16,
                                background: "#f59e0b",
                                color: "#fff",
                                border: "none",
                                fontWeight: 600
                            }}>发布</button>
                    </div>
                </div>
                <textarea
                    value={weiboPostText}
                    onChange={e => setWeiboPostText(e.target.value)}
                    placeholder="分享新鲜事..."
                    rows={4}
                    style={{
                        width: "100%",
                        fontSize: 14,
                        border: "none",
                        outline: "none",
                        resize: "none",
                        lineHeight: 1.6,
                        background: "#f8f8f8",
                        borderRadius: 12,
                        padding: 12
                    }} />
                {}
                <div
                    style={{
                        marginTop: 8
                    }}>
                    <div
                        style={{
                            fontSize: 11,
                            color: "#999",
                            marginBottom: 4
                        }}>关联热搜话题：</div>
                    <div
                        style={{
                            display: "flex",
                            flexWrap: "wrap",
                            gap: 4
                        }}>
                        {weiboHotSearch.slice(0, 5).map(h => <span
                            key={h.id}
                            style={{
                                fontSize: 10,
                                padding: "3px 8px",
                                borderRadius: 12,
                                background: weiboPostTopic === h.title ? "#fef3c7" : "#f3f4f6",
                                color: weiboPostTopic === h.title ? "#f59e0b" : "#666",
                                cursor: "pointer",
                                fontWeight: weiboPostTopic === h.title ? 600 : 400,
                                border: weiboPostTopic === h.title ? "1px solid #f59e0b" : "1px solid transparent"
                            }}
                            onClick={() => setWeiboPostTopic(weiboPostTopic === h.title ? "" : h.title)}>#{h.title}
                        </span>)}
                    </div>
                </div>
                {}
                <div
                    style={{
                        marginTop: 8
                    }}>
                    <div
                        style={{
                            display: "flex",
                            gap: 6,
                            flexWrap: "wrap"
                        }}>
                        {weiboPostImages.map((img, i) => <div
                            key={i}
                            style={{
                                width: 56,
                                height: 56,
                                borderRadius: 8,
                                background: "linear-gradient(135deg, #fef3c7, #fde68a)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: 20,
                                position: "relative"
                            }}>🖼️
                                              <span
                                style={{
                                    position: "absolute",
                                    top: -4,
                                    right: -4,
                                    width: 16,
                                    height: 16,
                                    borderRadius: "50%",
                                    background: "#ef4444",
                                    color: "#fff",
                                    fontSize: 10,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    cursor: "pointer"
                                }}
                                onClick={() => setWeiboPostImages(prev => prev.filter((_, idx) => idx !== i))}>×</span>
                        </div>)}
                        {weiboPostImages.length < 9 && <div
                            style={{
                                width: 56,
                                height: 56,
                                borderRadius: 8,
                                border: "2px dashed #d1d5db",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: 20,
                                color: "#999",
                                cursor: "pointer"
                            }}
                            onClick={() => setWeiboPostImages(prev => [...prev, `img-${Date.now()}`])}>+</div>}
                    </div>
                </div>
            </div>
        </div>;

        const renderProfileEdit = () => showWeiboProfileEdit && <div
            style={{
                position: "absolute",
                inset: 0,
                zIndex: 50,
                background: "rgba(0,0,0,0.4)",
                display: "flex",
                flexDirection: "column",
                justifyContent: "flex-end"
            }}
            onClick={() => setShowWeiboProfileEdit(false)}>
            <div
                style={{
                    background: "#fff",
                    borderRadius: "16px 16px 0 0",
                    padding: 16,
                    maxHeight: "70%"
                }}
                onClick={e => e.stopPropagation()}>
                <div
                    style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: 12
                    }}>
                    <span
                        style={{
                            fontSize: 14,
                            fontWeight: 700
                        }}>编辑资料</span>
                    <button
                        onClick={saveWeiboProfile}
                        style={{
                            fontSize: 12,
                            padding: "6px 16px",
                            borderRadius: 16,
                            background: "#f59e0b",
                            color: "#fff",
                            border: "none",
                            fontWeight: 600
                        }}>保存</button>
                </div>
                {}
                <div
                    style={{
                        marginBottom: 12
                    }}>
                    <div
                        style={{
                            fontSize: 11,
                            color: "#999",
                            marginBottom: 6
                        }}>选择头像</div>
                    <div
                        style={{
                            display: "flex",
                            flexWrap: "wrap",
                            gap: 6
                        }}>
                        {availableAvatars.map(a => <span
                            key={a}
                            style={{
                                width: 36,
                                height: 36,
                                borderRadius: "50%",
                                background: weiboProfileAvatar === a ? "#fef3c7" : "#f3f4f6",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: 20,
                                cursor: "pointer",
                                border: weiboProfileAvatar === a ? "2px solid #f59e0b" : "2px solid transparent",
                                transition: "all 0.2s"
                            }}
                            onClick={() => setWeiboProfileAvatar(a)}>{a}</span>)}
                    </div>
                </div>
                {}
                <div
                    style={{
                        marginBottom: 12
                    }}>
                    <div
                        style={{
                            fontSize: 11,
                            color: "#999",
                            marginBottom: 4
                        }}>昵称</div>
                    <input
                        value={weiboProfileNick}
                        onChange={e => setWeiboProfileNick(e.target.value)}
                        placeholder="给自己取个名字吧"
                        maxLength={12}
                        style={{
                            width: "100%",
                            fontSize: 13,
                            padding: "8px 12px",
                            borderRadius: 10,
                            border: "1px solid #e5e7eb",
                            outline: "none",
                            background: "#f8f8f8"
                        }} />
                </div>
                {}
                <div
                    style={{
                        marginBottom: 12
                    }}>
                    <div
                        style={{
                            fontSize: 11,
                            color: "#999",
                            marginBottom: 4
                        }}>简介</div>
                    <input
                        value={weiboProfileBio}
                        onChange={e => setWeiboProfileBio(e.target.value)}
                        placeholder="一句话介绍自己"
                        maxLength={30}
                        style={{
                            width: "100%",
                            fontSize: 13,
                            padding: "8px 12px",
                            borderRadius: 10,
                            border: "1px solid #e5e7eb",
                            outline: "none",
                            background: "#f8f8f8"
                        }} />
                </div>
            </div>
        </div>;

        const renderWeiboHome = () => <div>
            {}
            <div
                style={{
                    padding: "8px 16px",
                    display: "flex",
                    gap: 8,
                    overflowX: "auto",
                    background: "#fff",
                    borderBottom: "1px solid #f0f0f0"
                }}>
                {[{
                    emoji: "👨",
                    name: "田栩宁_",
                    color: "#f59e0b"
                }, {
                    emoji: "👩",
                    name: "我是梓渝_",
                    color: "#ec4899"
                }, {
                    emoji: "🔥",
                    name: "CP超话",
                    color: "#ef4444"
                }].map(u => {
                    const followed = weiboFollowing.includes(u.name);

                    return (
                        <div
                            key={u.name}
                            onClick={() => toggleFollow(u.name)}
                            style={{
                                flexShrink: 0,
                                padding: "6px 12px",
                                borderRadius: 20,
                                background: followed ? "rgba(34,197,94,0.12)" : `${u.color}18`,
                                fontSize: 11,
                                fontWeight: 600,
                                color: followed ? "#22c55e" : u.color,
                                display: "flex",
                                alignItems: "center",
                                gap: 4,
                                cursor: "pointer",
                                transition: "all 0.2s"
                            }}>
                            {u.emoji} {u.name} {u.name !== "CP超话" && <span
                                style={{
                                    fontSize: 9,
                                    background: u.color,
                                    color: "#fff",
                                    padding: "0 3px",
                                    borderRadius: 3
                                }}>V</span>}
                            {followed && <span
                                style={{
                                    fontSize: 9
                                }}>✓</span>}
                        </div>
                    );
                })}
            </div>
            {}
            {topicPage && renderTopicPage()}
            {}
            {weiboData.filter(item => {
                if (item.visibility !== "cp_only")
                    return true;

                return item.name === weiboAccount.nickname;
            }).map(item => renderWeiboCard(item))}
        </div>;

        const renderWeiboDiscover = () => <div>
            {renderHotSearch()}
            {}
            <div
                style={{
                    padding: "12px 16px",
                    borderTop: "4px solid #f5f5f5"
                }}>
                <div
                    style={{
                        fontSize: 14,
                        fontWeight: 700,
                        color: "#333",
                        marginBottom: 10
                    }}>推荐关注</div>
                {[{
                    avatar: "👨",
                    name: "田栩宁_",
                    tag: "演员",
                    color: "#f59e0b",
                    fans: "386万"
                }, {
                    avatar: "👩",
                    name: "我是梓渝_",
                    tag: "歌手",
                    color: "#ec4899",
                    fans: "295万"
                }, {
                    avatar: "🔥",
                    name: "CP超话",
                    tag: "超话",
                    color: "#ef4444",
                    fans: "128万"
                }, {
                    avatar: "📢",
                    name: "娱乐热搜",
                    tag: "媒体",
                    color: "#f97316",
                    fans: "89万"
                }].map(u => {
                    const isFollowed = weiboFollowing.includes(u.name);

                    return (
                        <div
                            key={u.name}
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 10,
                                padding: "8px 0",
                                borderBottom: "1px solid #f5f5f5"
                            }}>
                            <div
                                style={{
                                    width: 40,
                                    height: 40,
                                    borderRadius: "50%",
                                    background: u.color + "20",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    fontSize: 20
                                }}>{u.avatar}</div>
                            <div
                                style={{
                                    flex: 1
                                }}>
                                <div
                                    style={{
                                        fontSize: 13,
                                        fontWeight: 600,
                                        color: u.color
                                    }}>{u.name} <span
                                        style={{
                                            fontSize: 9,
                                            background: u.color,
                                            color: "#fff",
                                            padding: "0 3px",
                                            borderRadius: 3
                                        }}>V</span></div>
                                <div
                                    style={{
                                        fontSize: 10,
                                        color: "#999"
                                    }}>{u.tag}· {u.fans}粉丝</div>
                            </div>
                            <button
                                onClick={() => toggleFollow(u.name)}
                                style={{
                                    fontSize: 10,
                                    padding: "4px 12px",
                                    borderRadius: 14,
                                    fontWeight: 600,
                                    cursor: "pointer",
                                    transition: "all 0.2s",

                                    ...(isFollowed ? {
                                        background: "#f3f4f6",
                                        color: "#999",
                                        border: "1px solid #e5e7eb"
                                    } : {
                                        background: "#fef3c7",
                                        color: "#f59e0b",
                                        border: "1px solid #f59e0b"
                                    })
                                }}>{isFollowed ? "已关注" : "+ 关注"}</button>
                        </div>
                    );
                })}
            </div>
        </div>;

        const renderWeiboMessages = () => <div
            style={{
                padding: 16
            }}>
            {}
            <div
                style={{
                    background: "linear-gradient(135deg, rgba(245,158,11,0.1), rgba(236,72,153,0.1))",
                    borderRadius: 14,
                    padding: 16,
                    marginBottom: 12,
                    cursor: "pointer"
                }}
                onClick={() => {
                    if (cpChatRevealed)
                        return;

                    if (consumeToken(tokenPricing.viewPrivateChat, "查看CP私聊")) {
                        setCpChatRevealed(true);
                    } else {
                        setShowCpChatPaywall(true);
                    }
                }}>
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10
                    }}>
                    <div
                        style={{
                            display: "flex"
                        }}>
                        <div
                            style={{
                                width: 36,
                                height: 36,
                                borderRadius: "50%",
                                background: "rgba(245,158,11,0.2)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: 18,
                                marginRight: -8,
                                zIndex: 1
                            }}>👨</div>
                        <div
                            style={{
                                width: 36,
                                height: 36,
                                borderRadius: "50%",
                                background: "rgba(236,72,153,0.2)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: 18
                            }}>👩</div>
                    </div>
                    <div
                        style={{
                            flex: 1
                        }}>
                        <div
                            style={{
                                fontSize: 13,
                                fontWeight: 600,
                                color: "#333"
                            }}>💖 CP私聊</div>
                        <div
                            style={{
                                fontSize: 10,
                                color: "#999"
                            }}>田栩宁 & 梓渝的甜蜜对话</div>
                    </div>
                    <div
                        style={{
                            fontSize: 10,
                            color: "#f59e0b",
                            fontWeight: 600
                        }}>
                        {cpChatRevealed ? "🔓 已解锁" : `🔒 ${tokenPricing.viewPrivateChat} Token`}
                    </div>
                </div>
            </div>
            {}
            {cpChatRevealed && <div
                style={{
                    background: "#fff",
                    borderRadius: 14,
                    padding: 12,
                    boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
                    marginBottom: 12
                }}>
                <div
                    style={{
                        fontSize: 11,
                        color: "#999",
                        marginBottom: 8,
                        textAlign: "center"
                    }}>💕 今日CP私聊记录 💕</div>
                {cpChatMessages.map(msg => <div
                    key={msg.id}
                    style={{
                        display: "flex",
                        gap: 6,
                        marginBottom: 8
                    }}>
                    <div
                        style={{
                            width: 28,
                            height: 28,
                            borderRadius: "50%",
                            background: msg.from === "A" ? "rgba(245,158,11,0.15)" : "rgba(236,72,153,0.15)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 14,
                            flexShrink: 0
                        }}>
                        {msg.from === "A" ? "👨" : "👩"}
                    </div>
                    <div>
                        <div
                            style={{
                                fontSize: 10,
                                color: msg.from === "A" ? "#f59e0b" : "#ec4899",
                                fontWeight: 600
                            }}>{msg.from === "A" ? "田栩宁" : "梓渝"} <span
                                style={{
                                    color: "#ccc",
                                    fontWeight: 400
                                }}>{msg.time}</span></div>
                        <div
                            style={{
                                fontSize: 13,
                                color: "#333",
                                lineHeight: 1.5,
                                background: msg.from === "A" ? "rgba(245,158,11,0.06)" : "rgba(236,72,153,0.06)",
                                padding: "6px 10px",
                                borderRadius: 10,
                                marginTop: 2
                            }}>{msg.text}</div>
                    </div>
                </div>)}
            </div>}
            {}
            {showCpChatPaywall && <div
                style={{
                    background: "#fff",
                    borderRadius: 14,
                    padding: 16,
                    textAlign: "center",
                    boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
                    marginBottom: 12
                }}>
                <div
                    style={{
                        fontSize: 32,
                        marginBottom: 8
                    }}>💎</div>
                <div
                    style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: "#333"
                    }}>Token 不足</div>
                <div
                    style={{
                        fontSize: 11,
                        color: "#999",
                        marginTop: 4
                    }}>查看CP私聊需要 {tokenPricing.viewPrivateChat}Token</div>
                <div
                    style={{
                        fontSize: 11,
                        color: "#999",
                        marginTop: 2
                    }}>当前余额：{tokenBalance}Token</div>
                <button
                    onClick={() => setShowCpChatPaywall(false)}
                    style={{
                        marginTop: 10,
                        padding: "6px 20px",
                        borderRadius: 10,
                        background: "#8b5cf6",
                        color: "#fff",
                        border: "none",
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: "pointer"
                    }}>知道了</button>
            </div>}
            {}
            <div
                style={{
                    textAlign: "center",
                    color: "#ccc",
                    fontSize: 11,
                    marginTop: 20
                }}>暂无其他消息
                        </div>
        </div>;

        const renderWeiboMe = () => <div>
            <div
                style={{
                    padding: "20px 16px",
                    background: "linear-gradient(180deg, #fef3c7 0%, #fff 100%)",
                    textAlign: "center"
                }}>
                <div
                    style={{
                        width: 60,
                        height: 60,
                        borderRadius: "50%",
                        background: "#fff",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 30,
                        margin: "0 auto",
                        boxShadow: "0 2px 8px rgba(0,0,0,0.1)"
                    }}>{weiboAccount.avatar}</div>
                <div
                    style={{
                        fontSize: 15,
                        fontWeight: 700,
                        color: "#333",
                        marginTop: 8
                    }}>{weiboAccount.nickname}</div>
                {weiboAccount.bio && <div
                    style={{
                        fontSize: 11,
                        color: "#666",
                        marginTop: 2
                    }}>{weiboAccount.bio}</div>}
                <div
                    style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        marginTop: 6,
                        padding: "2px 10px",
                        borderRadius: 10,
                        background: "rgba(139,92,246,0.1)",
                        fontSize: 10,
                        color: "#8b5cf6",
                        fontWeight: 600
                    }}>Lv.{userLevel}· 💎 {tokenBalance}Token
                              </div>
                {!weiboAccount.isSet && <div
                    style={{
                        fontSize: 10,
                        color: "#f59e0b",
                        marginTop: 4
                    }}>✨ 点击编辑资料设置昵称</div>}
                <div
                    style={{
                        display: "flex",
                        justifyContent: "center",
                        gap: 20,
                        marginTop: 12
                    }}>
                    <div><div
                            style={{
                                fontSize: 14,
                                fontWeight: 700,
                                color: "#333"
                            }}>{weiboData.filter(p => p.name === weiboAccount.nickname).length}</div><div
                            style={{
                                fontSize: 10,
                                color: "#999"
                            }}>微博</div></div>
                    <div><div
                            style={{
                                fontSize: 14,
                                fontWeight: 700,
                                color: "#333"
                            }}>{weiboFollowing.length}</div><div
                            style={{
                                fontSize: 10,
                                color: "#999"
                            }}>关注</div></div>
                    <div><div
                            style={{
                                fontSize: 14,
                                fontWeight: 700,
                                color: "#333"
                            }}>0</div><div
                            style={{
                                fontSize: 10,
                                color: "#999"
                            }}>粉丝</div></div>
                </div>
                <button
                    onClick={() => {
                        setWeiboProfileNick(weiboAccount.nickname === "游客用户" ? "" : weiboAccount.nickname);
                        setWeiboProfileAvatar(weiboAccount.avatar);
                        setWeiboProfileBio(weiboAccount.bio);
                        setShowWeiboProfileEdit(true);
                    }}
                    style={{
                        marginTop: 10,
                        fontSize: 11,
                        padding: "5px 20px",
                        borderRadius: 16,
                        background: "#fff",
                        color: "#f59e0b",
                        border: "1px solid #f59e0b",
                        fontWeight: 600,
                        cursor: "pointer"
                    }}>编辑资料
                              </button>
            </div>
            {}
            <div
                style={{
                    margin: "0 16px",
                    padding: 12,
                    borderRadius: 12,
                    background: "rgba(139,92,246,0.06)",
                    marginBottom: 12
                }}>
                <div
                    style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: "#8b5cf6",
                        marginBottom: 4
                    }}>💎 Token 明细</div>
                <div
                    style={{
                        fontSize: 10,
                        color: "#999",
                        lineHeight: 1.6
                    }}>余额：{tokenBalance}Token<br />发图消耗：{tokenPricing.postImage}Token/张<br />查看私聊：{tokenPricing.viewPrivateChat}Token/次<br />AI对话：{tokenPricing.aiChat}Token/次
                              </div>
            </div>
            {}
            <div>
                {weiboData.filter(p => p.name === weiboAccount.nickname).length === 0 ? <div
                    style={{
                        padding: 30,
                        textAlign: "center",
                        color: "#999",
                        fontSize: 12
                    }}>还没有发过微博，去首页发一条吧！</div> : weiboData.filter(p => p.name === weiboAccount.nickname).map(item => renderWeiboCard(item))}
            </div>
        </div>;

        return (
            <div
                style={{
                    position: "relative",
                    height: "100%",
                    display: "flex",
                    flexDirection: "column",
                    background: "#fff"
                }}>
                {weiboNavBar}
                <div
                    style={{
                        flex: 1,
                        overflowY: "auto",
                        overflowX: "hidden"
                    }}>
                    {weiboTab === "home" && renderWeiboHome()}
                    {weiboTab === "discover" && renderWeiboDiscover()}
                    {weiboTab === "messages" && renderWeiboMessages()}
                    {weiboTab === "me" && renderWeiboMe()}
                </div>
                {renderPostModal()}
                {renderProfileEdit()}
            </div>
        );
    }

    function renderHome() {
        const rooms = [{
            icon: "🛋️",
            name: "客厅",
            status: "小十一在沙发上打盹"
        }, {
            icon: "🛏️",
            name: "卧室",
            status: "辛巴守在门口"
        }, {
            icon: "🍳",
            name: "厨房",
            status: "空无一人"
        }, {
            icon: "🌿",
            name: "阳台",
            status: "大鱼在晒太阳"
        }, {
            icon: "📚",
            name: "书房",
            status: "爸爸在工作"
        }, {
            icon: "🚿",
            name: "浴室",
            status: "空闲"
        }];

        return (
            <div className="scene-page">
                <div
                    style={{
                        padding: "12px 16px 8px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        position: "relative"
                    }}>
                    <button
                        onClick={() => setCurrentApp(null)}
                        style={{
                            position: "absolute",
                            left: "16px",
                            top: "50%",
                            transform: "translateY(-50%)",
                            background: "none",
                            border: "none",
                            fontSize: "20px",
                            color: "#3d5c45",
                            cursor: "pointer",
                            padding: "8px"
                        }}>←
                              </button>
                    <span
                        style={{
                            fontSize: 17,
                            fontWeight: 700,
                            color: "#3d5c45"
                        }}>家里</span>
                </div>
                <div className="scene-room-grid">
                    {rooms.map((r, i) => <div key={i} className="scene-room">
                        <div className="scene-room-icon">{r.icon}</div>
                        <div className="scene-room-name">{r.name}</div>
                        <div className="scene-room-status">{r.status}</div>
                    </div>)}
                </div>
            </div>
        );
    }

    function renderPet() {
        const pets = [{
            emoji: "🐕",
            name: "辛巴",
            type: "中华田园犬",
            hunger: 90,
            mood: 85,
            energy: 70
        }, {
            emoji: "🐱",
            name: "大鱼",
            type: "豹猫",
            hunger: 85,
            mood: 70,
            energy: 55
        }, {
            emoji: "🐱",
            name: "小十一",
            type: "阿比西尼亚猫",
            hunger: 65,
            mood: 80,
            energy: 40
        }];

        return (
            <div className="pet-page">
                <div
                    style={{
                        padding: "12px 16px 8px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        position: "relative"
                    }}>
                    <button
                        onClick={() => setCurrentApp(null)}
                        style={{
                            position: "absolute",
                            left: "16px",
                            top: "50%",
                            transform: "translateY(-50%)",
                            background: "none",
                            border: "none",
                            fontSize: "20px",
                            color: "#3d5c45",
                            cursor: "pointer",
                            padding: "8px"
                        }}>←
                              </button>
                    <span
                        style={{
                            fontSize: 17,
                            fontWeight: 700,
                            color: "#3d5c45"
                        }}>宠物</span>
                </div>
                {pets.map((p, i) => <div key={i} className="pet-card">
                    <div className="pet-avatar">{p.emoji}</div>
                    <div className="pet-info">
                        <div className="pet-name">{p.name}· {p.type}</div>
                        <div className="pet-stat"><span className="pet-stat-label">饱腹</span><div className="pet-stat-bar"><div
                                    className="pet-stat-fill"
                                    style={{
                                        width: p.hunger + "%",
                                        background: "#22c55e"
                                    }}></div></div><span className="pet-stat-val">{p.hunger}</span></div>
                        <div className="pet-stat"><span className="pet-stat-label">心情</span><div className="pet-stat-bar"><div
                                    className="pet-stat-fill"
                                    style={{
                                        width: p.mood + "%",
                                        background: "#f59e0b"
                                    }}></div></div><span className="pet-stat-val">{p.mood}</span></div>
                        <div className="pet-stat"><span className="pet-stat-label">能量</span><div className="pet-stat-bar"><div
                                    className="pet-stat-fill"
                                    style={{
                                        width: p.energy + "%",
                                        background: "#3b82f6"
                                    }}></div></div><span className="pet-stat-val">{p.energy}</span></div>
                    </div>
                </div>)}
                <div className="pet-actions">
                    <button className="pet-btn">🦴 喂食</button>
                    <button className="pet-btn">🎾 玩耍</button>
                    <button className="pet-btn">💤 休息</button>
                </div>
            </div>
        );
    }

    function renderDressUp() {
        const items = ["👗", "👘", "👚", "👔", "🎩", "🎀", "💍", "👟"];

        return (
            <div className="dress-page">
                <div
                    style={{
                        padding: "12px 16px 8px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        position: "relative"
                    }}>
                    <button
                        onClick={() => setCurrentApp(null)}
                        style={{
                            position: "absolute",
                            left: "16px",
                            top: "50%",
                            transform: "translateY(-50%)",
                            background: "none",
                            border: "none",
                            fontSize: "20px",
                            color: "#3d5c45",
                            cursor: "pointer",
                            padding: "8px"
                        }}>←
                              </button>
                    <span
                        style={{
                            fontSize: 17,
                            fontWeight: 700,
                            color: "#3d5c45"
                        }}>换装</span>
                </div>
                <div className="dress-preview">🧍‍♀️</div>
                <div className="dress-tabs">
                    <button className="dress-tab active">衣服</button>
                    <button className="dress-tab">头饰</button>
                    <button className="dress-tab">配饰</button>
                    <button className="dress-tab">道具</button>
                </div>
                <div className="dress-grid">
                    {items.map(
                        (item, i) => <div key={i} className={`dress-item${i === 0 ? " equipped" : ""}`}>{item}</div>
                    )}
                </div>
            </div>
        );
    }

    function renderMe() {
        if (unlockAnimActive) {
            return (
                <div className="unlock-animation">
                    <div className="unlock-crack"></div>
                    <div className="unlock-rainbow"></div>
                    <div className="unlock-heartbeat">💗</div>
                    <div className="unlock-text">身份已解锁</div>
                    <div className="unlock-subtext">欢迎回家</div>
                </div>
            );
        }

        if (meSubPage === "identity") {
            const totalSteps = IDENTITY_QUESTIONS.length;
            const q = IDENTITY_QUESTIONS[identityStep];

            if (identityStep >= totalSteps) {
                return (
                    <div className="identity-page">
                        <div
                            style={{
                                textAlign: "center",
                                padding: "30px 16px"
                            }}>
                            <div
                                style={{
                                    fontSize: 48,
                                    marginBottom: 12
                                }}>🎉</div>
                            <div
                                style={{
                                    fontSize: 16,
                                    fontWeight: 700,
                                    color: "#92400e",
                                    marginBottom: 6
                                }}>自传完成！</div>
                            <div
                                style={{
                                    fontSize: 12,
                                    color: "#78350f",
                                    marginBottom: 20
                                }}>他们会更懂你了</div>
                            <button
                                className="identity-btn"
                                onClick={() => {
                                    setMeSubPage("main");
                                    setIdentityStep(0);
                                }}
                                style={{
                                    background: "linear-gradient(135deg, #f59e0b, #ec4899)",
                                    border: "none",
                                    color: "#fff",
                                    borderRadius: 20,
                                    padding: "10px 32px",
                                    fontSize: 14,
                                    fontWeight: 600,
                                    cursor: "pointer"
                                }}>完成
                                              </button>
                        </div>
                    </div>
                );
            }

            return (
                <div className="identity-page">
                    <div
                        style={{
                            padding: "20px 16px 0"
                        }}>
                        <div
                            style={{
                                fontSize: 11,
                                color: "#a16207",
                                marginBottom: 4
                            }}>{identityStep + 1}/ {totalSteps}</div>
                        <div
                            style={{
                                height: 4,
                                borderRadius: 2,
                                background: "#fde68a",
                                marginBottom: 16
                            }}>
                            <div
                                style={{
                                    height: "100%",
                                    borderRadius: 2,
                                    background: "linear-gradient(90deg, #f59e0b, #ec4899)",
                                    width: `${(identityStep + 1) / totalSteps * 100}%`,
                                    transition: "width 0.3s"
                                }}></div>
                        </div>
                    </div>
                    <div
                        style={{
                            padding: "16px",
                            flex: 1,
                            display: "flex",
                            flexDirection: "column",
                            justifyContent: "center"
                        }}>
                        <div
                            style={{
                                fontSize: 18,
                                fontWeight: 700,
                                color: "#92400e",
                                marginBottom: 4,
                                textAlign: "center"
                            }}>{q.question}</div>
                        <div
                            style={{
                                fontSize: 11,
                                color: "#a16207",
                                marginBottom: 16,
                                textAlign: "center"
                            }}>💡 {q.aiUsage}</div>
                        <input
                            className="identity-input"
                            placeholder={q.placeholder}
                            maxLength={20}
                            value={identityInput || unlockState.userIdentity[q.key]}
                            onChange={e => setIdentityInput(e.target.value)}
                            onKeyDown={e => {
                                if (e.key === "Enter") {
                                    const val = identityInput.trim();

                                    setUnlockState(prev => ({
                                        ...prev,

                                        userIdentity: {
                                            ...prev.userIdentity,
                                            [q.key]: val
                                        }
                                    }));

                                    setIdentityInput("");
                                    setIdentityStep(prev => prev + 1);
                                }
                            }}
                            autoFocus />
                        <div
                            style={{
                                display: "flex",
                                gap: 8,
                                marginTop: 16
                            }}>
                            <button
                                className="identity-btn"
                                onClick={() => {
                                    const val = identityInput.trim();

                                    setUnlockState(prev => ({
                                        ...prev,

                                        userIdentity: {
                                            ...prev.userIdentity,
                                            [q.key]: val
                                        }
                                    }));

                                    setIdentityInput("");
                                    setIdentityStep(prev => prev + 1);
                                }}
                                style={{
                                    flex: 1
                                }}>
                                {identityInput.trim() ? "下一题 →" : "跳过"}
                            </button>
                        </div>
                    </div>
                </div>
            );
        }

        if (meSubPage === "unlock") {
            return (
                <div className="unlock-page">
                    <div
                        style={{
                            padding: 20
                        }}>
                        <div
                            style={{
                                fontSize: 20,
                                fontWeight: 700,
                                color: "#92400e",
                                marginBottom: 4,
                                textAlign: "center"
                            }}>🔓 暗号解锁</div>
                        <div
                            style={{
                                fontSize: 12,
                                color: "#a16207",
                                marginBottom: 20,
                                textAlign: "center"
                            }}>叫出真名，解锁全部功能</div>
                        <div
                            style={{
                                marginBottom: 16
                            }}>
                            <label
                                style={{
                                    fontSize: 12,
                                    color: "#78350f",
                                    display: "block",
                                    marginBottom: 4
                                }}>👨 {unlockState.unlocked ? "爸爸1的真名" : "大A的真名"}</label>
                            <input
                                className="unlock-input"
                                placeholder="输入名字..."
                                maxLength={20}
                                value={unlockState.unlocked ? "田雷" : unlockInput1}
                                onChange={e => setUnlockInput1(e.target.value)}
                                disabled={unlockState.unlocked} />
                        </div>
                        <div
                            style={{
                                marginBottom: 16
                            }}>
                            <label
                                style={{
                                    fontSize: 12,
                                    color: "#78350f",
                                    display: "block",
                                    marginBottom: 4
                                }}>👩 {unlockState.unlocked ? "爸爸2的真名" : "小B的真名"}</label>
                            <input
                                className="unlock-input"
                                placeholder="输入名字..."
                                maxLength={20}
                                value={unlockState.unlocked ? "郑朋" : unlockInput2}
                                onChange={e => setUnlockInput2(e.target.value)}
                                disabled={unlockState.unlocked} />
                        </div>
                        {!unlockState.unlocked && <button
                            className="unlock-btn"
                            onClick={() => {
                                if (checkUnlock(unlockInput1, unlockInput2)) {
                                    setUnlockAnimActive(true);

                                    setTimeout(() => {
                                        setUnlockState(prev => ({
                                            ...prev,
                                            unlocked: true,
                                            dad1Name: "田雷",
                                            dad2Name: "郑朋"
                                        }));

                                        setUnlockAnimActive(false);
                                        setMeSubPage("main");
                                    }, 2500);
                                }
                            }}
                            style={{
                                width: "100%",
                                marginTop: 8
                            }}>✨ 解锁
                                          </button>}
                        {}
                        {!unlockState.unlocked && <div
                            style={{
                                marginTop: 20,
                                paddingTop: 16,
                                borderTop: "1px dashed #d6d3d1"
                            }}>
                            <div
                                style={{
                                    fontSize: 11,
                                    color: "#a8a29e",
                                    textAlign: "center",
                                    marginBottom: 8
                                }}>管理员入口</div>
                            <div
                                style={{
                                    display: "flex",
                                    gap: 8
                                }}>
                                <input
                                    className="unlock-input"
                                    placeholder="管理员密码"
                                    maxLength={20}
                                    value={adminInput}
                                    onChange={e => setAdminInput(e.target.value)}
                                    style={{
                                        flex: 1
                                    }}
                                    type="password" />
                                <button
                                    className="unlock-btn"
                                    onClick={() => {
                                        if (isAdminPassword(adminInput)) {
                                            setUnlockAnimActive(true);

                                            setTimeout(() => {
                                                setUnlockState(prev => ({
                                                    ...prev,
                                                    unlocked: true,
                                                    dad1Name: "田雷",
                                                    dad2Name: "郑朋",

                                                    identityAnswers: {
                                                        name: "米米",
                                                        age: "15",
                                                        school: "高中",
                                                        personality: "活泼开朗",
                                                        hobbies: "画画、追星",
                                                        relationship: "被宠爱的小公主",
                                                        secret: "偷偷嗑爸妈CP",
                                                        callMe: "宝贝"
                                                    }
                                                }));

                                                setUnlockAnimActive(false);
                                                setMeSubPage("main");
                                            }, 2500);
                                        } else {
                                            alert("密码错误");
                                            setAdminInput("");
                                        }
                                    }}
                                    style={{
                                        width: "auto",
                                        padding: "8px 16px",
                                        fontSize: 12
                                    }}>🔑
                                                      </button>
                            </div>
                        </div>}
                        {unlockState.unlocked && <div
                            style={{
                                marginTop: 12,
                                padding: 12,
                                borderRadius: 12,
                                background: "#ecfdf5",
                                textAlign: "center"
                            }}>
                            <div
                                style={{
                                    fontSize: 24,
                                    marginBottom: 4
                                }}>🔓</div>
                            <div
                                style={{
                                    fontSize: 13,
                                    fontWeight: 600,
                                    color: "#065f46"
                                }}>已解锁</div>
                        </div>}
                        {unlockState.unlocked && <>
                            <div
                                style={{
                                    marginTop: 16,
                                    marginBottom: 8,
                                    fontSize: 13,
                                    fontWeight: 600,
                                    color: "#92400e"
                                }}>📝 备注/昵称</div>
                            <div
                                style={{
                                    marginBottom: 12
                                }}>
                                <label
                                    style={{
                                        fontSize: 11,
                                        color: "#78350f"
                                    }}>👨 田雷的备注</label>
                                <input
                                    className="unlock-input"
                                    placeholder="如：大黑牛"
                                    maxLength={20}
                                    value={nicknameInput1 || unlockState.dad1Nickname}
                                    onChange={e => setNicknameInput1(e.target.value)}
                                    onBlur={() => {
                                        if (nicknameInput1.trim()) {
                                            setUnlockState(prev => ({
                                                ...prev,
                                                dad1Nickname: nicknameInput1.trim()
                                            }));
                                        }
                                    }} />
                            </div>
                            <div
                                style={{
                                    marginBottom: 12
                                }}>
                                <label
                                    style={{
                                        fontSize: 11,
                                        color: "#78350f"
                                    }}>👩 郑朋的备注</label>
                                <input
                                    className="unlock-input"
                                    placeholder="如：炸毛小猫"
                                    maxLength={20}
                                    value={nicknameInput2 || unlockState.dad2Nickname}
                                    onChange={e => setNicknameInput2(e.target.value)}
                                    onBlur={() => {
                                        if (nicknameInput2.trim()) {
                                            setUnlockState(prev => ({
                                                ...prev,
                                                dad2Nickname: nicknameInput2.trim()
                                            }));
                                        }
                                    }} />
                            </div>
                        </>}
                        <button
                            className="identity-btn"
                            onClick={() => setMeSubPage("main")}
                            style={{
                                marginTop: 12,
                                width: "100%",
                                background: "#e5e7eb",
                                color: "#78350f"
                            }}>← 返回
                                        </button>
                    </div>
                </div>
            );
        }

        if (meSubPage === "about") {
            return (
                <div
                    style={{
                        padding: 16
                    }}>
                    <div
                        style={{
                            fontSize: 16,
                            fontWeight: 700,
                            color: "#92400e",
                            marginBottom: 16
                        }}>ℹ️ 关于</div>
                    <div
                        style={{
                            padding: 16,
                            borderRadius: 14,
                            background: "rgba(255,255,255,0.8)",
                            backdropFilter: "blur(16px)",
                            textAlign: "center"
                        }}>
                        <div
                            style={{
                                fontSize: 36,
                                marginBottom: 8
                            }}>📱</div>
                        <div
                            style={{
                                fontSize: 16,
                                fontWeight: 700,
                                color: "#92400e"
                            }}>AI小手机</div>
                        <div
                            style={{
                                fontSize: 12,
                                color: "#a16207",
                                marginTop: 4
                            }}>CP女儿模拟器 v1.0</div>
                        <div
                            style={{
                                fontSize: 11,
                                color: "#d97706",
                                marginTop: 12,
                                lineHeight: 1.6
                            }}>这是一款虚拟家庭模拟器<br />和你的"家人们"一起生活吧<br />💛 灵感来自 dylan-heartbeat
                                        </div>
                    </div>
                    <button
                        className="identity-btn"
                        onClick={() => setMeSubPage("main")}
                        style={{
                            marginTop: 16,
                            width: "100%",
                            background: "#e5e7eb",
                            color: "#78350f"
                        }}>← 返回
                                  </button>
                </div>
            );
        }

        if (meSubPage === "settings") {
            return (
                <div
                    style={{
                        padding: 16
                    }}>
                    <div
                        style={{
                            fontSize: 16,
                            fontWeight: 700,
                            color: "#92400e",
                            marginBottom: 16
                        }}>⚙️ 设置</div>
                    <div className="me-menu-item" onClick={() => setMeSubPage("account")}>
                        <span className="me-menu-icon">👤</span>
                        <span className="me-menu-label">账户设置</span>
                        <span className="me-menu-arrow">›</span>
                    </div>
                    <div className="me-menu-item" onClick={() => setMeSubPage("change-password")}>
                        <span className="me-menu-icon">🔑</span>
                        <span className="me-menu-label">修改密码</span>
                        <span className="me-menu-arrow">›</span>
                    </div>
                    <div className="me-menu-item" onClick={() => setMeSubPage("knob-style")}>
                        <span className="me-menu-icon">🎛️</span>
                        <span className="me-menu-label">悬浮按钮样式</span>
                        <span className="me-menu-arrow">›</span>
                    </div>
                    {isAdmin && (
                        <>
                            <div className="me-menu-item" onClick={() => setCurrentApp("admin-review")}>
                                <span className="me-menu-icon">✅</span>
                                <span className="me-menu-label">用户审核</span>
                                <span className="me-menu-arrow">›</span>
                            </div>
                            <div className="me-menu-item" onClick={() => setShowNewAdmin(true)}>
                                <span className="me-menu-icon">🛠️</span>
                                <span className="me-menu-label">新版管理后台</span>
                                <span className="me-menu-arrow">›</span>
                            </div>
                        </>
                    )}
                    <div className="me-menu-item" onClick={() => setMeSubPage("wallpaper")}>
                        <span className="me-menu-icon">🖼️</span>
                        <span className="me-menu-label">壁纸</span>
                        <span className="me-menu-arrow">›</span>
                    </div>
                    <div className="me-menu-item" onClick={() => setMeSubPage("theme")}>
                        <span className="me-menu-icon">🎨</span>
                        <span className="me-menu-label">主题</span>
                        <span className="me-menu-arrow">›</span>
                    </div>
                    <div className="me-menu-item" onClick={() => setMeSubPage("unlock")}>
                        <span className="me-menu-icon">{unlockState.unlocked ? "🔓" : "🔒"}</span>
                        <span className="me-menu-label">{unlockState.unlocked ? "身份已解锁" : "暗号解锁"}</span>
                        <span className="me-menu-arrow">›</span>
                    </div>
                    <div
                        className="me-menu-item"
                        onClick={() => {
                            setIdentityStep(0);
                            setIdentityInput("");
                            setMeSubPage("identity");
                        }}>
                        <span className="me-menu-icon">📝</span>
                        <span className="me-menu-label">编辑自传</span>
                        <span className="me-menu-arrow">›</span>
                    </div>
                    <div
                        className="me-menu-item"
                        onClick={() => {
                            if (confirm("确定要重置所有数据吗？")) {
                                localStorage.clear();
                                window.location.reload();
                            }
                        }}>
                        <span className="me-menu-icon">🗑️</span>
                        <span className="me-menu-label">重置数据</span>
                        <span className="me-menu-arrow">›</span>
                    </div>
                    <button
                        className="identity-btn"
                        onClick={() => setMeSubPage("main")}
                        style={{
                            marginTop: 16,
                            width: "100%",
                            background: "#e5e7eb",
                            color: "#78350f"
                        }}>← 返回
                                  </button>
                </div>
            );
        }

        if (meSubPage === "invite") {
            return <InviteApp isAdmin={isAdmin} loginUsername={loginUsername} onClose={() => setMeSubPage("main")} />;
        }

        if (meSubPage === "account") {
            const handleUpdateAccount = async () => {
                setAccountLoading(true);
                setAccountMessage("");
                const token = localStorage.getItem("auth_token");
                try {
                    const res = await fetch("/api/auth", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            action: "change_password",
                            token,
                            currentPassword: accountCurrentPassword,
                            newPassword: accountNewPassword,
                            newDisplayName: accountDisplayName
                        })
                    });
                    const json = await res.json();
                    if (json.success) {
                        setAccountMessage("修改成功，请重新登录");
                        setTimeout(() => {
                            localStorage.removeItem("auth_token");
                            setIsLoggedIn(false);
                            setIsAdmin(false);
                            setCurrentApp(null);
                            setMeSubPage("main");
                        }, 1500);
                    } else {
                        setAccountMessage(json.error || "修改失败");
                    }
                } catch (e) {
                    setAccountMessage("网络错误");
                } finally {
                    setAccountLoading(false);
                }
            };

            return (
                <div style={{ padding: 16 }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: "#3d5c45", marginBottom: 16 }}>🔑 账户设置</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                        <div>
                            <div style={{ fontSize: 12, color: "#4a7c50", marginBottom: 4 }}>显示昵称</div>
                            <input
                                type="text"
                                value={accountDisplayName}
                                onChange={(e) => setAccountDisplayName(e.target.value)}
                                style={{
                                    width: "100%",
                                    padding: "10px 12px",
                                    borderRadius: 10,
                                    border: "1px solid #b8dcc4",
                                    background: "rgba(255,255,255,0.8)",
                                    fontSize: 14,
                                    color: "#2e5c33"
                                }}
                            />
                        </div>
                        <div>
                            <div style={{ fontSize: 12, color: "#4a7c50", marginBottom: 4 }}>当前密码</div>
                            <input
                                type="password"
                                value={accountCurrentPassword}
                                onChange={(e) => setAccountCurrentPassword(e.target.value)}
                                placeholder="输入当前密码"
                                style={{
                                    width: "100%",
                                    padding: "10px 12px",
                                    borderRadius: 10,
                                    border: "1px solid #b8dcc4",
                                    background: "rgba(255,255,255,0.8)",
                                    fontSize: 14,
                                    color: "#2e5c33"
                                }}
                            />
                        </div>
                        <div>
                            <div style={{ fontSize: 12, color: "#4a7c50", marginBottom: 4 }}>新密码</div>
                            <input
                                type="password"
                                value={accountNewPassword}
                                onChange={(e) => setAccountNewPassword(e.target.value)}
                                placeholder="输入新密码（至少6位）"
                                style={{
                                    width: "100%",
                                    padding: "10px 12px",
                                    borderRadius: 10,
                                    border: "1px solid #b8dcc4",
                                    background: "rgba(255,255,255,0.8)",
                                    fontSize: 14,
                                    color: "#2e5c33"
                                }}
                            />
                        </div>
                        {accountMessage && (
                            <div style={{ fontSize: 12, color: accountMessage.includes("成功") ? "#2e7d32" : "#ef4444", textAlign: "center" }}>
                                {accountMessage}
                            </div>
                        )}
                        <button
                            onClick={handleUpdateAccount}
                            disabled={accountLoading || !accountCurrentPassword || accountNewPassword.length < 6}
                            className="identity-btn"
                            style={{
                                marginTop: 8,
                                width: "100%",
                                background: accountLoading || !accountCurrentPassword || accountNewPassword.length < 6 ? "#b8dcc4" : "#2e7d32",
                                color: "#fff"
                            }}>
                            {accountLoading ? "保存中..." : "保存修改"}
                        </button>
                        <button
                            className="identity-btn"
                            onClick={() => setMeSubPage("main")}
                            style={{ width: "100%", background: "#e5e7eb", color: "#3d5c45" }}>← 返回
                        </button>
                    </div>
                </div>
            );
        }

        if (meSubPage === "change-password") {
            const hasUpper = /[A-Z]/.test(changePasswordNew);
            const hasLower = /[a-z]/.test(changePasswordNew);
            const hasNumber = /\d/.test(changePasswordNew);
            const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(changePasswordNew);
            const isStrong = changePasswordNew.length >= 8 && hasUpper && hasLower && hasNumber && hasSpecial;
            const isMatch = changePasswordNew && changePasswordNew === changePasswordConfirm;

            return (
                <div style={{ padding: 16, display: "flex", flexDirection: "column", height: "100%" }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: "#3d5c45", marginBottom: 16, textAlign: "center" }}>🔐 修改密码</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 12, flex: 1 }}>
                        <div>
                            <div style={{ fontSize: 12, color: "#4a7c50", marginBottom: 4 }}>当前密码</div>
                            <input
                                type="password"
                                value={changePasswordCurrent}
                                onChange={(e) => setChangePasswordCurrent(e.target.value)}
                                placeholder="请输入当前密码"
                                style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #b8dcc4", background: "rgba(255,255,255,0.8)", fontSize: 14, color: "#2e5c33" }}
                            />
                        </div>
                        <div>
                            <div style={{ fontSize: 12, color: "#4a7c50", marginBottom: 4 }}>新密码</div>
                            <input
                                type="password"
                                value={changePasswordNew}
                                onChange={(e) => setChangePasswordNew(e.target.value)}
                                placeholder="至少8位，包含大小写字母、数字和特殊字符"
                                style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #b8dcc4", background: "rgba(255,255,255,0.8)", fontSize: 14, color: "#2e5c33" }}
                            />
                            <div style={{ fontSize: 11, color: isStrong ? "#2e7d32" : "#ef4444", marginTop: 4 }}>
                                {changePasswordNew ? (isStrong ? "✅ 密码强度符合要求" : "⚠️ 至少8位且同时包含大写、小写、数字和特殊字符") : "密码至少8位且包含大写、小写、数字和特殊字符"}
                            </div>
                        </div>
                        <div>
                            <div style={{ fontSize: 12, color: "#4a7c50", marginBottom: 4 }}>确认新密码</div>
                            <input
                                type="password"
                                value={changePasswordConfirm}
                                onChange={(e) => setChangePasswordConfirm(e.target.value)}
                                placeholder="请再次输入新密码"
                                style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #b8dcc4", background: "rgba(255,255,255,0.8)", fontSize: 14, color: "#2e5c33" }}
                            />
                            {changePasswordConfirm && (
                                <div style={{ fontSize: 11, color: isMatch ? "#2e7d32" : "#ef4444", marginTop: 4 }}>
                                    {isMatch ? "✅ 两次输入一致" : "⚠️ 两次输入不一致"}
                                </div>
                            )}
                        </div>
                        {changePasswordMessage && (
                            <div style={{ fontSize: 13, color: changePasswordMessage.includes("成功") ? "#2e7d32" : "#ef4444", textAlign: "center", padding: 8, background: changePasswordMessage.includes("成功") ? "rgba(46,125,50,0.1)" : "rgba(239,68,68,0.1)", borderRadius: 8 }}>
                                {changePasswordMessage}
                            </div>
                        )}
                        <button
                            onClick={handleChangePassword}
                            disabled={changePasswordLoading || !changePasswordCurrent.trim() || !isStrong || !isMatch}
                            className="identity-btn"
                            style={{ width: "100%", background: changePasswordLoading || !changePasswordCurrent.trim() || !isStrong || !isMatch ? "#b8dcc4" : "#2e7d32", color: "#fff", marginTop: "auto" }}
                        >
                            {changePasswordLoading ? "保存中..." : "确认修改"}
                        </button>
                        <button
                            className="identity-btn"
                            onClick={() => setMeSubPage("main")}
                            style={{ width: "100%", background: "#e5e7eb", color: "#3d5c45" }}>← 返回
                        </button>
                    </div>
                </div>
            );
        }

        if (meSubPage === "knob-style") {
            return (
                <div style={{ padding: 16, display: "flex", flexDirection: "column", height: "100%" }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: "#3d5c45", marginBottom: 16, textAlign: "center" }}>🎨 悬浮按钮样式</div>
                    <div style={{ flex: 1, overflowY: "auto" }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                            {KNOB_STYLES.map((style) => (
                                <button
                                    key={style.id}
                                    onClick={() => {
                                        setKnobStyle(style.id);
                                        localStorage.setItem("mimi_knob_style_v1", style.id);
                                    }}
                                    style={{
                                        padding: 16,
                                        borderRadius: 16,
                                        border: "2px solid",
                                        borderColor: knobStyle === style.id ? "#2e7d32" : "rgba(255,255,255,0.5)",
                                        background: knobStyle === style.id ? "rgba(46,125,50,0.15)" : "rgba(255,255,255,0.5)",
                                        display: "flex",
                                        flexDirection: "column",
                                        alignItems: "center",
                                        gap: 8
                                    }}
                                >
                                    <span style={{ fontSize: 32 }}>{style.icon}</span>
                                    <span style={{ fontSize: 13, color: "#2e5c33", fontWeight: 600 }}>{style.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                    <button
                        className="identity-btn"
                        onClick={() => setMeSubPage("main")}
                        style={{ width: "100%", background: "#e5e7eb", color: "#3d5c45", marginTop: 12 }}>← 返回
                    </button>
                </div>
            );
        }

        if (meSubPage === "bio") {
            const handleSaveBio = async () => {
                const trimmed = bioDraft.trim();
                if (trimmed.length > 500) {
                    setBioMessage("自传最多500字");
                    return;
                }
                setBioLoading(true);
                setBioMessage("");
                const token = localStorage.getItem("auth_token");
                try {
                    const res = await fetch("/api/auth", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ action: "update_bio", authToken: token, bio: trimmed })
                    });
                    const json = await res.json();
                    if (json.success) {
                        setUserBio(trimmed);
                        localStorage.setItem("mimi_user_bio", trimmed);
                        setBioMessage("保存成功");
                    } else {
                        setBioMessage(json.error || "保存失败");
                    }
                } catch (e) {
                    setBioMessage("网络错误");
                } finally {
                    setBioLoading(false);
                }
            };

            return (
                <div style={{ padding: 16, display: "flex", flexDirection: "column", height: "100%" }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: "#3d5c45", marginBottom: 16, textAlign: "center" }}>📖 编辑自传</div>
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12 }}>
                        <textarea
                            value={bioDraft}
                            onChange={(e) => setBioDraft(e.target.value)}
                            placeholder="写下你的个人简介，最多500字..."
                            maxLength={500}
                            style={{
                                width: "100%",
                                flex: 1,
                                padding: 12,
                                borderRadius: 12,
                                border: "1px solid #b8dcc4",
                                background: "rgba(255,255,255,0.8)",
                                fontSize: 14,
                                color: "#2e5c33",
                                resize: "none",
                                lineHeight: 1.6
                            }}
                        />
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: bioDraft.length > 500 ? "#ef4444" : "#4a7c50" }}>
                            <span>{bioDraft.length}/500 字</span>
                            {bioDraft.length > 500 && <span>已超出字数限制</span>}
                        </div>
                        {bioMessage && (
                            <div style={{ fontSize: 13, color: bioMessage.includes("成功") ? "#2e7d32" : "#ef4444", textAlign: "center", padding: 8, background: bioMessage.includes("成功") ? "rgba(46,125,50,0.1)" : "rgba(239,68,68,0.1)", borderRadius: 8 }}>
                                {bioMessage}
                            </div>
                        )}
                        <button
                            onClick={handleSaveBio}
                            disabled={bioLoading || bioDraft.trim().length > 500}
                            className="identity-btn"
                            style={{ width: "100%", background: bioLoading || bioDraft.trim().length > 500 ? "#b8dcc4" : "#2e7d32", color: "#fff" }}
                        >
                            {bioLoading ? "保存中..." : "保存自传"}
                        </button>
                        <button
                            className="identity-btn"
                            onClick={() => setMeSubPage("main")}
                            style={{ width: "100%", background: "#e5e7eb", color: "#3d5c45" }}>← 返回
                        </button>
                    </div>
                </div>
            );
        }

        if (meSubPage === "wallpaper") {
            const WALLPAPER_OPTIONS: { key: string; label: string; emoji: string }[] = [
                { key: "default", label: "默认浅绿", emoji: "🌿" },
                { key: "fresh", label: "清新绿意", emoji: "🍃" },
                { key: "mint", label: "薄荷清凉", emoji: "🧊" },
                { key: "sky", label: "天空之蓝", emoji: "☁️" },
                { key: "blush", label: "暖阳橙粉", emoji: "🌅" },
                { key: "dusk", label: "薄暮紫霞", emoji: "🌆" },
                { key: "dots", label: "绿意波点", emoji: "🔘" },
                { key: "lines", label: "斜纹绿意", emoji: "📐" }
            ];

            return (
                <div style={{ padding: 16, display: "flex", flexDirection: "column", height: "100%" }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: "#3d5c45", marginBottom: 16, textAlign: "center" }}>🖼️ 壁纸设置</div>
                    <div style={{ flex: 1, overflowY: "auto" }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                            {WALLPAPER_OPTIONS.map((option) => (
                                <button
                                    key={option.key}
                                    onClick={() => {
                                        setWallpaper(option.key);
                                        try {
                                            localStorage.setItem("phone_wallpaper_v1", option.key);
                                        } catch {}
                                    }}
                                    style={{
                                        padding: 12,
                                        borderRadius: 16,
                                        border: wallpaper === option.key ? "2px solid #2e7d32" : "1px solid rgba(255,255,255,0.5)",
                                        background: "rgba(255,255,255,0.65)",
                                        backdropFilter: "blur(12px)",
                                        display: "flex",
                                        flexDirection: "column",
                                        alignItems: "center",
                                        gap: 8,
                                        cursor: "pointer"
                                    }}
                                >
                                    <div style={{
                                        width: "100%",
                                        aspectRatio: "9/16",
                                        borderRadius: 10,
                                        background: WALLPAPER_PRESETS[option.key],
                                        boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.05)"
                                    }} />
                                    <span style={{ fontSize: 12, fontWeight: 600, color: "#3d5c45" }}>{option.emoji} {option.label}</span>
                                    {wallpaper === option.key && <span style={{ fontSize: 11, color: "#2e7d32" }}>✓ 使用中</span>}
                                </button>
                            ))}
                        </div>
                    </div>
                    <button
                        className="identity-btn"
                        onClick={() => setMeSubPage("main")}
                        style={{ width: "100%", background: "#e5e7eb", color: "#3d5c45", marginTop: 12 }}>← 返回
                    </button>
                </div>
            );
        }

        if (meSubPage === "theme") {
            return (
                <div style={{ padding: 16, display: "flex", flexDirection: "column", height: "100%", alignItems: "center", justifyContent: "center" }}>
                    <div style={{ fontSize: 48, marginBottom: 16 }}>🎨</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: "#3d5c45", marginBottom: 8, textAlign: "center" }}>主题系统</div>
                    <div style={{ fontSize: 13, color: "#4a7c50", textAlign: "center", lineHeight: 1.6, marginBottom: 24 }}>
                        自定义时间字体、APP框外观、图标外观、装饰物品<br />
                        装饰物品可用米米币兑换
                    </div>
                    <div style={{ padding: "12px 24px", borderRadius: 20, background: "rgba(255,255,255,0.7)", backdropFilter: "blur(12px)", fontSize: 14, fontWeight: 600, color: "#5a9e6a" }}>敬请期待</div>
                    <button
                        className="identity-btn"
                        onClick={() => setMeSubPage("main")}
                        style={{ width: "100%", background: "#e5e7eb", color: "#3d5c45", marginTop: 32 }}>← 返回
                    </button>
                </div>
            );
        }

        const displayName = unlockState.userIdentity.name || "小甜玉米";
        const displayNick = unlockState.userIdentity.nickname;

        return (
            <div className="me-page">
                <div
                    style={{
                        padding: "12px 16px 8px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        position: "relative"
                    }}>
                    <button
                        onClick={() => setCurrentApp(null)}
                        style={{
                            position: "absolute",
                            left: "16px",
                            top: "50%",
                            transform: "translateY(-50%)",
                            background: "none",
                            border: "none",
                            fontSize: "20px",
                            color: "#3d5c45",
                            cursor: "pointer",
                            padding: "8px"
                        }}>←
                              </button>
                    <span
                        style={{
                            fontSize: 17,
                            fontWeight: 700,
                            color: "#3d5c45"
                        }}>我的</span>
                </div>
                <div className="me-header">
                    <div className="me-avatar">👧</div>
                    <div className="me-name">{displayName}</div>
                    {displayNick && <div
                        className="me-nickname"
                        style={{
                            fontSize: 11,
                            color: "#a16207"
                        }}>{displayNick}</div>}
                    <div className="me-level">
                        {unlockState.unlocked ? "🔓 已解锁" : "🔒 未解锁"}· Lv.1 · Ch1
                                  </div>
                </div>
                <div className="me-menu">
                    <div className="me-menu-item" onClick={() => setMeSubPage("identity")}>
                        <span className="me-menu-icon">📝</span>
                        <span className="me-menu-label">我的自传{unlockState.identityCompleted ? " ✓" : ""}</span>
                        <span className="me-menu-arrow">›</span>
                    </div>
                    <div className="me-menu-item" onClick={() => setMeSubPage("unlock")}>
                        <span className="me-menu-icon">{unlockState.unlocked ? "🔓" : "🔒"}</span>
                        <span className="me-menu-label">{unlockState.unlocked ? "身份管理" : "暗号解锁"}</span>
                        <span className="me-menu-arrow">›</span>
                    </div>
                    <div className="me-menu-item" onClick={() => setMeSubPage("invite")}>
                        <span className="me-menu-icon">🎟️</span>
                        <span className="me-menu-label">我的邀请码</span>
                        <span className="me-menu-arrow">›</span>
                    </div>
                    <div className="me-menu-item" onClick={() => { setViewingUserProfile(loginUsername); setCurrentApp("user-profile"); }}>
                        <span className="me-menu-icon">👤</span>
                        <span className="me-menu-label">我的主页</span>
                        <span className="me-menu-arrow">›</span>
                    </div>
                    {isAdmin && (
                        <div className="me-menu-item" onClick={() => { setBioDraft(userBio); setBioMessage(""); setMeSubPage("bio"); }}>
                            <span className="me-menu-icon">📖</span>
                            <span className="me-menu-label">编辑自传</span>
                            <span className="me-menu-arrow">›</span>
                        </div>
                    )}
                    <div className="me-menu-item" onClick={() => setMeSubPage("settings")}>
                        <span className="me-menu-icon">⚙️</span>
                        <span className="me-menu-label">设置</span>
                        <span className="me-menu-arrow">›</span>
                    </div>
                    <div className="me-menu-item" onClick={() => setMeSubPage("about")}>
                        <span className="me-menu-icon">ℹ️</span>
                        <span className="me-menu-label">关于</span>
                        <span className="me-menu-arrow">›</span>
                    </div>
                </div>
                {!unlockState.unlocked && <div
                    style={{
                        padding: "0 16px",
                        marginTop: 16
                    }}>
                    <div
                        style={{
                            padding: 12,
                            borderRadius: 12,
                            background: "rgba(254,243,199,0.8)",
                            fontSize: 11,
                            color: "#92400e",
                            textAlign: "center",
                            lineHeight: 1.5
                        }}>💡 在「暗号解锁」中输入特殊名字<br />可以解锁全部隐藏功能 ✨
                                    </div>
                </div>}
            </div>
        );
    }

    function renderWorldBook() {
        return <WorldBookApp onClose={() => setCurrentApp(null)} />;
    }

    function renderCall() {
        return (
            <div className="call-page">
                <button className="app-back-btn" style={{ position: "absolute", top: 12, left: 12, zIndex: 10 }} onClick={() => setCurrentApp(null)}>← 返回</button>
                <div className="call-avatar">👨</div>
                <div className="call-name">爸爸</div>
                <div className="call-status">来电中...</div>
                <div className="call-actions">
                    <button className="call-btn decline">📵</button>
                    <button className="call-btn accept">📞</button>
                </div>
            </div>
        );
    }

    function renderBrowser() {
        return (
            <div className="browser-page">
                <button className="app-back-btn" style={{ position: "absolute", top: 12, left: 12, zIndex: 10 }} onClick={() => setCurrentApp(null)}>← 返回</button>
                <div className="browser-bar"><input className="browser-url" placeholder="输入网址或搜索" /></div>
                <div className="browser-body"><div
                        style={{
                            fontSize: 48,
                            marginBottom: 12
                        }}>🌐</div>输入网址开始浏览</div>
            </div>
        );
    }

    function renderMusic() {
        return (
            <div className="music-page">
                <button className="app-back-btn" style={{ position: "absolute", top: 12, left: 12, zIndex: 10 }} onClick={() => setCurrentApp(null)}>← 返回</button>
                <div className="music-cover">🎵</div>
                <div className="music-title">我们的时光</div>
                <div className="music-artist">爸爸唱的</div>
                <div className="music-progress"><div className="music-progress-fill"></div></div>
                <div className="music-controls">
                    <span className="music-ctrl">⏮</span>
                    <span className="music-ctrl play">▶️</span>
                    <span className="music-ctrl">⏭</span>
                </div>
            </div>
        );
    }

    // 渲染外部应用（iframe 加载）
    function renderExternalApp(id: string, name: string, url: string) {
        // 获取当前用户的 token，通过 URL 参数传递
        const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
        const fullUrl = token ? `${url}${url.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}` : url;
        
        return (
            <div style={{
                height: "100%",
                display: "flex",
                flexDirection: "column",
                background: "#fff"
            }}>
                {/* Header */}
                <div style={{
                    padding: "22px 16px 12px 16px",
                    background: "rgba(255,255,255,0.8)",
                    backdropFilter: "blur(20px)",
                    borderBottom: "1px solid rgba(0,0,0,0.05)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    flexShrink: 0
                }}>
                    <button
                        onClick={() => setCurrentApp(null)}
                        style={{
                            background: "none",
                            border: "none",
                            fontSize: "15px",
                            color: "#5a9e6a",
                            cursor: "pointer",
                            padding: "6px 10px",
                            borderRadius: 10,
                            fontWeight: 500
                        }}>
                        ← 返回
                    </button>
                    <span style={{
                        fontSize: "15px",
                        fontWeight: 600,
                        color: "#1a1a1a",
                        position: "absolute",
                        left: "50%",
                        transform: "translateX(-50%)"
                    }}>{name}</span>
                    <div style={{ width: 50 }} />
                </div>
                {/* iframe */}
                <iframe
                    src={fullUrl}
                    style={{
                        flex: 1,
                        width: "100%",
                        border: "none",
                        background: "#fff"
                    }}
                    title={name}
                    allow="camera; microphone; geolocation"
                />
            </div>
        );
    }

    function renderExternalAppCache() {
        const isMimi = currentApp === "mimicosmo";
        const isWorkshop = currentApp === "miniworkshop";
        const active = isMimi || isWorkshop;
        const title = isMimi ? "米米课程表" : "迷你小作坊";
        const token = typeof window !== "undefined" ? localStorage.getItem("auth_token") || "" : "";
        const role = isAdmin ? "admin" : "user";
        const urlMimi = `/mimi/mimi_university_new1/index.html?hideWorkshop=true&token=${encodeURIComponent(token)}&username=${encodeURIComponent(loginUsername)}&role=${role}`;
        const urlWorkshop = `/mimi/mimi_university_new1/index.html?workshopOnly=true&token=${encodeURIComponent(token)}&username=${encodeURIComponent(loginUsername)}&role=${role}`;
        return (
            <div style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                flexDirection: "column",
                zIndex: 20,
                opacity: active ? 1 : 0,
                pointerEvents: active ? "auto" : "none",
                transition: "opacity 0.2s ease",
                background: active ? "#fbfaf8" : "transparent"
            }}>
                <div style={{
                    padding: "22px 16px 12px 16px",
                    background: "rgba(255,255,255,0.85)",
                    backdropFilter: "blur(20px)",
                    borderBottom: "1px solid rgba(0,0,0,0.05)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    flexShrink: 0,
                    opacity: active ? 1 : 0,
                    transition: "opacity 0.2s ease"
                }}>
                    <button
                        onClick={() => setCurrentApp(null)}
                        style={{
                            background: "none",
                            border: "none",
                            fontSize: "15px",
                            color: "#5a9e6a",
                            cursor: "pointer",
                            padding: "6px 10px",
                            borderRadius: 10,
                            fontWeight: 500
                        }}>
                        ← 返回
                    </button>
                    <span style={{
                        fontSize: "15px",
                        fontWeight: 600,
                        color: "#1a1a1a",
                        position: "absolute",
                        left: "50%",
                        transform: "translateX(-50%)"
                    }}>{title}</span>
                    <div style={{ width: 50 }} />
                </div>
                <div style={{ flex: 1, position: "relative" }}>
                    <iframe
                        className="external-app-cache-iframe"
                        src={urlMimi}
                        title="米米课程表"
                        style={{
                            position: "absolute",
                            inset: 0,
                            width: "100%",
                            height: "100%",
                            border: "none",
                            visibility: isMimi ? "visible" : "hidden",
                            pointerEvents: isMimi ? "auto" : "none"
                        }}
                    />
                    <iframe
                        className="external-app-cache-iframe"
                        src={urlWorkshop}
                        title="迷你小作坊"
                        style={{
                            position: "absolute",
                            inset: 0,
                            width: "100%",
                            height: "100%",
                            border: "none",
                            visibility: isWorkshop ? "visible" : "hidden",
                            pointerEvents: isWorkshop ? "auto" : "none"
                        }}
                    />
                </div>
            </div>
        );
    }

    function renderLpmi() {
        return (
            <div
                style={{
                    height: "100%",
                    display: "flex",
                    flexDirection: "column",
                    background: "#365314"
                }}>
                <div
                    className="app-header"
                    style={{
                        background: "#365314",
                        color: "#fff",
                        flexShrink: 0
                    }}>
                    <button className="app-back-btn" onClick={() => setCurrentApp(null)}>返回</button>
                    <div
                        className="app-title"
                        style={{
                            color: "#fff"
                        }}>LPMI · 纯爱磕CP</div>
                    <div className="app-header-actions" />
                </div>
                <div
                    style={{
                        flex: 1,
                        width: "100%",
                        overflow: "hidden",
                        position: "relative"
                    }}>
                    <iframe
                        src="/lpmi/index.html"
                        style={{
                            position: "absolute",
                            top: 0,
                            left: 0,
                            width: "100%",
                            height: "100%",
                            border: "none"
                        }}
                        title="LPMI 人格测试" />
                </div>
            </div>
        );
    }

    function renderMixin() {
        if (mixinChatTarget) {
            return (
                <div
                    style={{
                        height: "100%",
                        display: "flex",
                        flexDirection: "column",
                        background: "#ededed"
                    }}>
                    <div
                        className="app-header"
                        style={{
                            background: "#ededed",
                            borderBottom: "1px solid #d9d9d9"
                        }}>
                        <button className="app-back-btn" onClick={() => setMixinChatTarget(null)}>返回</button>
                        <div className="app-title">
                            {mixinChatTarget === "family" ? "家庭群" : mixinChatTarget === "dad" ? "爸爸" : "妈咪"}
                        </div>
                        <div className="app-header-actions" />
                    </div>
                    <div
                        style={{
                            flex: 1,
                            overflow: "hidden"
                        }}>
                        {renderChatDetail(mixinChatTarget)}
                    </div>
                </div>
            );
        }

        return (
            <div
                style={{
                    height: "100%",
                    display: "flex",
                    flexDirection: "column",
                    background: "#ededed"
                }}>
                {}
                <div
                    style={{
                        height: "56px",
                        background: "#ededed",
                        borderBottom: "1px solid #d9d9d9",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        position: "relative",
                        flexShrink: 0
                    }}>
                    <span
                        style={{
                            fontSize: "17px",
                            fontWeight: 600,
                            color: "#000"
                        }}>
                        {mixinTab === "chats" ? "米信" : mixinTab === "contacts" ? "通讯录" : mixinTab === "discover" ? "发现" : "我"}
                    </span>
                    <button
                        onClick={() => setCurrentApp(null)}
                        style={{
                            position: "absolute",
                            left: "12px",
                            top: "50%",
                            transform: "translateY(-50%)",
                            background: "none",
                            border: "none",
                            fontSize: "20px",
                            color: "#000",
                            cursor: "pointer",
                            padding: "8px"
                        }}>←
                                  </button>
                </div>
                {}
                <div
                    style={{
                        flex: 1,
                        overflow: "auto"
                    }}>
                    {mixinTab === "chats" && <div
                        style={{
                            background: "#fff"
                        }}>
                        {}
                        {[{
                            id: "family" as const,
                            avatar: "💬",
                            name: "家庭群",
                            msg: "爸爸: 今天早点回家吃饭",
                            time: "下午3:20",
                            unread: 2
                        }, {
                            id: "dad" as const,
                            avatar: "👨",
                            name: "爸爸",
                            msg: "宝贝，周末想吃什么？",
                            time: "下午2:15",
                            unread: 0
                        }, {
                            id: "mom" as const,
                            avatar: "👩",
                            name: "妈咪",
                            msg: "记得多喝水哦~",
                            time: "上午10:30",
                            unread: 1
                        }].map(chat => <div
                            key={chat.id}
                            onClick={() => setMixinChatTarget(chat.id)}
                            style={{
                                display: "flex",
                                alignItems: "center",
                                padding: "12px 16px",
                                borderBottom: "1px solid #f0f0f0",
                                cursor: "pointer",
                                background: "#fff"
                            }}>
                            <div
                                style={{
                                    width: "48px",
                                    height: "48px",
                                    borderRadius: "6px",
                                    background: chat.id === "family" ? "#22c55e" : chat.id === "dad" ? "#f59e0b" : "#ec4899",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    fontSize: "24px",
                                    flexShrink: 0
                                }}>
                                {chat.avatar}
                            </div>
                            <div
                                style={{
                                    flex: 1,
                                    marginLeft: "12px",
                                    minWidth: 0
                                }}>
                                <div
                                    style={{
                                        display: "flex",
                                        justifyContent: "space-between",
                                        alignItems: "center"
                                    }}>
                                    <span
                                        style={{
                                            fontSize: "17px",
                                            fontWeight: 500,
                                            color: "#000"
                                        }}>{chat.name}</span>
                                    <span
                                        style={{
                                            fontSize: "12px",
                                            color: "#999"
                                        }}>{chat.time}</span>
                                </div>
                                <div
                                    style={{
                                        display: "flex",
                                        justifyContent: "space-between",
                                        alignItems: "center",
                                        marginTop: "4px"
                                    }}>
                                    <span
                                        style={{
                                            fontSize: "14px",
                                            color: "#999",
                                            overflow: "hidden",
                                            textOverflow: "ellipsis",
                                            whiteSpace: "nowrap"
                                        }}>{chat.msg}</span>
                                    {chat.unread > 0 && <span
                                        style={{
                                            background: "#f44336",
                                            color: "#fff",
                                            fontSize: "11px",
                                            borderRadius: "10px",
                                            padding: "2px 6px",
                                            minWidth: "18px",
                                            textAlign: "center"
                                        }}>
                                        {chat.unread}
                                    </span>}
                                </div>
                            </div>
                        </div>)}
                    </div>}
                    {mixinTab === "contacts" && <div
                        style={{
                            background: "#fff"
                        }}>
                        {}
                        {[{
                            id: "dad" as const,
                            avatar: "👨",
                            name: "爸爸",
                            desc: "田雷"
                        }, {
                            id: "mom" as const,
                            avatar: "👩",
                            name: "妈咪",
                            desc: "梓渝"
                        }].map(contact => <div
                            key={contact.id}
                            onClick={() => {
                                setMixinTab("chats");
                                setMixinChatTarget(contact.id);
                            }}
                            style={{
                                display: "flex",
                                alignItems: "center",
                                padding: "12px 16px",
                                borderBottom: "1px solid #f0f0f0",
                                cursor: "pointer"
                            }}>
                            <div
                                style={{
                                    width: "40px",
                                    height: "40px",
                                    borderRadius: "6px",
                                    background: contact.id === "dad" ? "#f59e0b" : "#ec4899",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    fontSize: "20px",
                                    flexShrink: 0
                                }}>
                                {contact.avatar}
                            </div>
                            <div
                                style={{
                                    marginLeft: "12px"
                                }}>
                                <div
                                    style={{
                                        fontSize: "17px",
                                        fontWeight: 500,
                                        color: "#000"
                                    }}>{contact.name}</div>
                                <div
                                    style={{
                                        fontSize: "13px",
                                        color: "#999"
                                    }}>{contact.desc}</div>
                            </div>
                        </div>)}
                    </div>}
                    {mixinTab === "discover" && <div
                        style={{
                            background: "#fff"
                        }}>
                        {}
                        <div
                            onClick={() => {
                                setCurrentApp("moments");
                            }}
                            style={{
                                display: "flex",
                                alignItems: "center",
                                padding: "16px",
                                borderBottom: "1px solid #f0f0f0",
                                cursor: "pointer"
                            }}>
                            <div
                                style={{
                                    width: "28px",
                                    height: "28px",
                                    borderRadius: "6px",
                                    background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    fontSize: "16px",
                                    marginRight: "12px"
                                }}>🌅
                                                </div>
                            <span
                                style={{
                                    fontSize: "17px",
                                    color: "#000",
                                    flex: 1
                                }}>朋友圈</span>
                            <span
                                style={{
                                    color: "#999",
                                    fontSize: "14px"
                                }}>›</span>
                        </div>
                    </div>}
                    {mixinTab === "me" && <div
                        style={{
                            background: "#fff"
                        }}>
                        {}
                        <div
                            style={{
                                padding: "24px 16px",
                                display: "flex",
                                alignItems: "center",
                                borderBottom: "8px solid #f5f5f5"
                            }}>
                            <div
                                style={{
                                    width: "64px",
                                    height: "64px",
                                    borderRadius: "8px",
                                    background: "linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    fontSize: "32px",
                                    marginRight: "16px"
                                }}>👤
                                                </div>
                            <div>
                                <div
                                    style={{
                                        fontSize: "20px",
                                        fontWeight: 600,
                                        color: "#000"
                                    }}>米米</div>
                                <div
                                    style={{
                                        fontSize: "14px",
                                        color: "#999",
                                        marginTop: "4px"
                                    }}>ID: mimi_001</div>
                            </div>
                        </div>
                        <div
                            style={{
                                padding: "16px"
                            }}>
                            <div
                                style={{
                                    padding: "12px 0",
                                    borderBottom: "1px solid #f0f0f0",
                                    fontSize: "16px",
                                    color: "#000"
                                }}>💰 我的米米币: {shopMembers.find(m => m.id === "user")?.balance || 0}
                            </div>
                            <div
                                style={{
                                    padding: "12px 0",
                                    borderBottom: "1px solid #f0f0f0",
                                    fontSize: "16px",
                                    color: "#000"
                                }}>📦 我的订单
                                                </div>
                            <div
                                style={{
                                    padding: "12px 0",
                                    fontSize: "16px",
                                    color: "#000"
                                }}>⚙️ 设置
                                                </div>
                        </div>
                    </div>}
                </div>
                {}
                <div
                    style={{
                        height: "56px",
                        background: "#f7f7f7",
                        borderTop: "1px solid #d9d9d9",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-around",
                        flexShrink: 0
                    }}>
                    {[{
                        id: "chats" as const,
                        icon: "💬",
                        label: "聊天"
                    }, {
                        id: "contacts" as const,
                        icon: "👥",
                        label: "通讯录"
                    }, {
                        id: "discover" as const,
                        icon: "🔍",
                        label: "发现"
                    }, {
                        id: "me" as const,
                        icon: "👤",
                        label: "我"
                    }].map(tab => <button
                        key={tab.id}
                        onClick={() => setMixinTab(tab.id)}
                        style={{
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            justifyContent: "center",
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            padding: "4px 12px",
                            color: mixinTab === tab.id ? "#07c160" : "#999"
                        }}>
                        <span
                            style={{
                                fontSize: "22px"
                            }}>{tab.icon}</span>
                        <span
                            style={{
                                fontSize: "11px",
                                marginTop: "2px"
                            }}>{tab.label}</span>
                    </button>)}
                </div>
            </div>
        );
    }

    function renderShopping() {
        const filteredProducts = shopCategory === "全部" ? shopProducts.filter(p => p.isActive) : shopProducts.filter(p => p.isActive && p.category === shopCategory);
        const hotProducts = getHotProducts(shopProducts, 3);
        const user = shopMembers.find(m => m.id === "user");
        const cartTotal = getCartTotal(shopCart);
        const onlineMembers = shopMembers.filter(m => m.isOnline);

        return (
            <div
                className="shopping-page"
                style={{
                    height: "100%",
                    overflow: "hidden",
                    display: "flex",
                    flexDirection: "column"
                }}>
                {}
                <div
                    style={{
                        background: "linear-gradient(135deg, #dc2626, #b91c1c)",
                        padding: "8px 12px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        color: "#fff",
                        flexShrink: 0
                    }}>
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8
                        }}>
                        <span
                            style={{
                                fontSize: 20
                            }}>🛒</span>
                        <span
                            style={{
                                fontSize: 16,
                                fontWeight: 700,
                                letterSpacing: 2
                            }}>啪多多</span>
                    </div>
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10
                        }}>
                        <span
                            style={{
                                fontSize: 11,
                                opacity: 0.9
                            }}>🪙 {user?.balance ?? 0}</span>
                        <button
                            onClick={() => setShopShowCart(!shopShowCart)}
                            style={{
                                background: "rgba(255,255,255,0.2)",
                                border: "none",
                                color: "#fff",
                                borderRadius: 14,
                                padding: "4px 10px",
                                fontSize: 12,
                                fontWeight: 600,
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                gap: 4
                            }}>🛒 {shopCart.length > 0 && <span
                                style={{
                                    background: "#fbbf24",
                                    color: "#7c2d12",
                                    borderRadius: "50%",
                                    width: 18,
                                    height: 18,
                                    display: "inline-flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    fontSize: 10,
                                    fontWeight: 700
                                }}>{shopCart.reduce((s, i) => s + i.quantity, 0)}</span>}
                        </button>
                    </div>
                </div>
                {}
                {shopNotification && <div
                    style={{
                        background: "#fef3c7",
                        color: "#92400e",
                        textAlign: "center",
                        padding: "6px 12px",
                        fontSize: 12,
                        fontWeight: 600,
                        flexShrink: 0,
                        animation: "slideDown 0.3s ease"
                    }}>{shopNotification}</div>}
                {}
                {shopCpMessage && <div
                    style={{
                        background: "linear-gradient(90deg, #fef3c7, #fde68a)",
                        color: "#92400e",
                        textAlign: "center",
                        padding: "8px 12px",
                        fontSize: 12,
                        fontWeight: 600,
                        flexShrink: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 6
                    }}>
                    <span>🏠</span> {shopCpMessage}
                </div>}
                {}
                {shopShowCart && <div
                    style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        background: "rgba(0,0,0,0.4)",
                        zIndex: 50,
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "flex-end"
                    }}
                    onClick={() => setShopShowCart(false)}>
                    <div
                        style={{
                            background: "#fff",
                            borderRadius: "20px 20px 0 0",
                            padding: "16px",
                            maxHeight: "60%",
                            overflow: "auto"
                        }}
                        onClick={e => e.stopPropagation()}>
                        <div
                            style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                marginBottom: 12
                            }}>
                            <span
                                style={{
                                    fontSize: 16,
                                    fontWeight: 700
                                }}>🛒 购物车（{shopCart.reduce((s, i) => s + i.quantity, 0)}件）</span>
                            <button
                                onClick={() => {
                                    setShopCart([]);
                                    setShopShowCart(false);
                                }}
                                style={{
                                    background: "none",
                                    border: "1px solid #e5e7eb",
                                    borderRadius: 6,
                                    padding: "2px 8px",
                                    fontSize: 11,
                                    color: "#9ca3af",
                                    cursor: "pointer"
                                }}>清空</button>
                        </div>
                        {shopCart.length === 0 ? <div
                            style={{
                                textAlign: "center",
                                padding: 30,
                                color: "#9ca3af",
                                fontSize: 13
                            }}>购物车是空的</div> : <>
                            {shopCart.map((item, i) => <div
                                key={i}
                                style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                    padding: "8px 0",
                                    borderBottom: "1px solid #f3f4f6",
                                    fontSize: 13
                                }}>
                                <span>{item.productName}×{item.quantity}</span>
                                <span
                                    style={{
                                        color: "#dc2626",
                                        fontWeight: 600
                                    }}>{item.price * item.quantity}🪙</span>
                            </div>)}
                            <div
                                style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                    marginTop: 12,
                                    padding: "10px 0",
                                    borderTop: "2px solid #fde68a",
                                    fontSize: 14,
                                    fontWeight: 700
                                }}>
                                <span>合计</span>
                                <span
                                    style={{
                                        color: "#dc2626",
                                        fontSize: 18
                                    }}>{cartTotal}🪙</span>
                            </div>
                            <button
                                onClick={() => handleShopCheckout()}
                                disabled={cartTotal === 0 || user && user.balance < cartTotal}
                                style={{
                                    width: "100%",
                                    marginTop: 10,
                                    padding: "12px",
                                    background: user && user.balance >= cartTotal ? "#dc2626" : "#d1d5db",
                                    border: "none",
                                    borderRadius: 10,
                                    color: "#fff",
                                    fontSize: 15,
                                    fontWeight: 700,
                                    cursor: user && user.balance >= cartTotal ? "pointer" : "not-allowed"
                                }}>结算购物车</button>
                        </>}
                    </div>
                </div>}
                {}
                <div
                    style={{
                        flex: 1,
                        overflow: "auto",
                        padding: "0 10px 10px"
                    }}>
                    {}
                    <div
                        style={{
                            display: "flex",
                            gap: 6,
                            padding: "8px 0"
                        }}>
                        <input
                            value={shopBuyInput}
                            onChange={e => setShopBuyInput(e.target.value)}
                            placeholder="搜索啪多多好物..."
                            style={{
                                flex: 1,
                                padding: "8px 12px",
                                borderRadius: 8,
                                border: "2px solid #fecaca",
                                fontSize: 13,
                                outline: "none",
                                background: "#fff"
                            }} />
                        <button
                            onClick={handleTogetherBrowse}
                            style={{
                                padding: "8px 12px",
                                background: "#dc2626",
                                border: "none",
                                borderRadius: 8,
                                color: "#fff",
                                fontSize: 12,
                                fontWeight: 600,
                                cursor: "pointer",
                                whiteSpace: "nowrap"
                            }}>👫 一起逛</button>
                    </div>
                    {}
                    <div
                        style={{
                            display: "flex",
                            gap: 6,
                            overflowX: "auto",
                            paddingBottom: 8,
                            flexShrink: 0
                        }}>
                        {(["全部", "服装", "家居", "数码", "食品", "礼物", "其他"] as const).map(cat => <button
                            key={cat}
                            onClick={() => setShopCategory(cat)}
                            style={{
                                padding: "4px 12px",
                                borderRadius: 14,
                                border: shopCategory === cat ? "2px solid #dc2626" : "1px solid #fecaca",
                                background: shopCategory === cat ? "#fef2f2" : "#fff",
                                color: shopCategory === cat ? "#dc2626" : "#6b7280",
                                fontSize: 12,
                                fontWeight: shopCategory === cat ? 700 : 500,
                                cursor: "pointer",
                                whiteSpace: "nowrap",
                                flexShrink: 0
                            }}>{cat}</button>)}
                    </div>
                    {}
                    {shopTogetherMode && <div
                        style={{
                            background: "linear-gradient(135deg, #fef3c7, #fde68a)",
                            borderRadius: 12,
                            padding: 12,
                            marginBottom: 10,
                            border: "2px solid #fbbf24"
                        }}>
                        <div
                            style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                marginBottom: 8
                            }}>
                            <span
                                style={{
                                    fontSize: 13,
                                    fontWeight: 700
                                }}>🛒 啪多多 · 当前在线</span>
                            <button
                                onClick={() => {
                                    setShopTogetherMode(false);
                                    setShopBrowseComments([]);
                                }}
                                style={{
                                    background: "none",
                                    border: "none",
                                    fontSize: 14,
                                    cursor: "pointer",
                                    color: "#92400e"
                                }}>✕</button>
                        </div>
                        <div
                            style={{
                                fontSize: 11,
                                color: "#92400e",
                                marginBottom: 6
                            }}>👀 正在逛：{onlineMembers.filter(m => m.id !== "user").map(m => m.name).join("、") || "暂无家庭成员在线"}
                        </div>
                        {shopMembers.filter(m => m.isOnline && m.id !== "user").map(m => <div
                            key={m.id}
                            style={{
                                fontSize: 11,
                                color: "#92400e",
                                marginBottom: 2
                            }}>🛍️ {m.name}正在看「{m.browsingCategory}」分类
                                            </div>)}
                        {shopBrowseComments.length > 0 && <div
                            style={{
                                marginTop: 8,
                                borderTop: "1px dashed #fbbf24",
                                paddingTop: 6
                            }}>
                            <div
                                style={{
                                    fontSize: 11,
                                    fontWeight: 600,
                                    color: "#92400e",
                                    marginBottom: 4
                                }}>💬 实时评论：</div>
                            {shopBrowseComments.map((c, i) => <div
                                key={i}
                                style={{
                                    fontSize: 11,
                                    color: "#92400e",
                                    marginBottom: 3
                                }}>[{c.time}] {c.memberName}："{c.text}"
                                                    </div>)}
                        </div>}
                    </div>}
                    {}
                    {shopCategory === "全部" && !shopTogetherMode && <div
                        style={{
                            marginBottom: 12
                        }}>
                        <div
                            style={{
                                fontSize: 14,
                                fontWeight: 700,
                                marginBottom: 8,
                                display: "flex",
                                alignItems: "center",
                                gap: 4
                            }}>🔥 热销排行
                                          </div>
                        <div
                            style={{
                                display: "flex",
                                gap: 8,
                                overflowX: "auto",
                                paddingBottom: 4
                            }}>
                            {hotProducts.map((p, i) => <div
                                key={p.id}
                                style={{
                                    minWidth: 140,
                                    background: "linear-gradient(180deg, #fef2f2, #fff)",
                                    borderRadius: 12,
                                    padding: 10,
                                    border: "1px solid #fecaca",
                                    flexShrink: 0
                                }}>
                                <div
                                    style={{
                                        background: i === 0 ? "#dc2626" : i === 1 ? "#f97316" : "#fbbf24",
                                        color: "#fff",
                                        width: 20,
                                        height: 20,
                                        borderRadius: "50%",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        fontSize: 10,
                                        fontWeight: 700,
                                        marginBottom: 4
                                    }}>{i + 1}</div>
                                <div
                                    style={{
                                        fontSize: 13,
                                        fontWeight: 600,
                                        marginBottom: 2
                                    }}>{p.name}</div>
                                <div
                                    style={{
                                        fontSize: 11,
                                        color: "#6b7280",
                                        marginBottom: 4
                                    }}>已售{p.soldCount}件 ⭐</div>
                                <div
                                    style={{
                                        display: "flex",
                                        justifyContent: "space-between",
                                        alignItems: "center"
                                    }}>
                                    <span
                                        style={{
                                            fontSize: 14,
                                            fontWeight: 700,
                                            color: "#dc2626"
                                        }}>{p.price}🪙</span>
                                    <button
                                        onClick={() => handleShopAddToCart(p)}
                                        disabled={p.stock <= 0}
                                        style={{
                                            padding: "3px 8px",
                                            background: p.stock > 0 ? "#dc2626" : "#d1d5db",
                                            border: "none",
                                            borderRadius: 6,
                                            color: "#fff",
                                            fontSize: 10,
                                            fontWeight: 600,
                                            cursor: p.stock > 0 ? "pointer" : "not-allowed"
                                        }}>+</button>
                                </div>
                            </div>)}
                        </div>
                    </div>}
                    {}
                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(2, 1fr)",
                            gap: 8
                        }}>
                        {filteredProducts.map(p => <div
                            key={p.id}
                            style={{
                                background: "#fff",
                                borderRadius: 12,
                                overflow: "hidden",
                                border: "1px solid #f3f4f6"
                            }}>
                            {}
                            <div
                                style={{
                                    height: 100,
                                    background: "linear-gradient(135deg, #fef2f2, #fee2e2)",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    fontSize: 36,
                                    position: "relative"
                                }}>
                                {p.category === "服装" && "👗"}
                                {p.category === "家居" && "🏠"}
                                {p.category === "数码" && "📱"}
                                {p.category === "食品" && "🍖"}
                                {p.category === "礼物" && "🎁"}
                                {p.category === "其他" && "📦"}
                                {p.stock <= 5 && p.stock > 0 && <span
                                    style={{
                                        position: "absolute",
                                        top: 4,
                                        right: 4,
                                        background: "#fbbf24",
                                        color: "#7c2d12",
                                        borderRadius: 4,
                                        padding: "1px 6px",
                                        fontSize: 9,
                                        fontWeight: 700
                                    }}>仅剩{p.stock}件</span>}
                                {p.stock <= 0 && <span
                                    style={{
                                        position: "absolute",
                                        inset: 0,
                                        background: "rgba(0,0,0,0.3)",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        color: "#fff",
                                        fontSize: 14,
                                        fontWeight: 700
                                    }}>已售罄</span>}
                            </div>
                            <div
                                style={{
                                    padding: 8
                                }}>
                                <div
                                    style={{
                                        fontSize: 12,
                                        fontWeight: 600,
                                        marginBottom: 2
                                    }}>{p.name}</div>
                                <div
                                    style={{
                                        fontSize: 10,
                                        color: "#9ca3af",
                                        marginBottom: 4
                                    }}>{p.detail}</div>
                                <div
                                    style={{
                                        display: "flex",
                                        justifyContent: "space-between",
                                        alignItems: "center"
                                    }}>
                                    <div>
                                        <span
                                            style={{
                                                fontSize: 14,
                                                fontWeight: 700,
                                                color: "#dc2626"
                                            }}>{p.price}</span>
                                        <span
                                            style={{
                                                fontSize: 10,
                                                color: "#dc2626",
                                                fontWeight: 600
                                            }}>🪙</span>
                                    </div>
                                    <button
                                        onClick={() => handleShopAddToCart(p)}
                                        disabled={p.stock <= 0}
                                        style={{
                                            padding: "4px 10px",
                                            background: p.stock > 0 ? "#dc2626" : "#d1d5db",
                                            border: "none",
                                            borderRadius: 14,
                                            color: "#fff",
                                            fontSize: 11,
                                            fontWeight: 600,
                                            cursor: p.stock > 0 ? "pointer" : "not-allowed"
                                        }}>加入购物车</button>
                                </div>
                                <div
                                    style={{
                                        fontSize: 9,
                                        color: "#9ca3af",
                                        marginTop: 3
                                    }}>已售{p.soldCount}件 | 库存{p.stock}</div>
                            </div>
                        </div>)}
                    </div>
                    {}
                    {shopOrders.length > 0 && <div
                        style={{
                            marginTop: 16,
                            paddingTop: 12,
                            borderTop: "1px solid #f3f4f6"
                        }}>
                        <div
                            style={{
                                fontSize: 13,
                                fontWeight: 700,
                                marginBottom: 8
                            }}>📦 最近订单</div>
                        {shopOrders.slice(0, 5).map(o => <div
                            key={o.id}
                            style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                padding: "6px 0",
                                borderBottom: "1px solid #f9fafb",
                                fontSize: 11
                            }}>
                            <span>
                                <span
                                    style={{
                                        fontWeight: 600
                                    }}>{o.buyerName}</span>
                                {o.recipientName !== "自用" && o.buyerId !== "user" && <span
                                    style={{
                                        color: "#dc2626"
                                    }}>→ {o.recipientName}</span>}
                                <span
                                    style={{
                                        color: "#6b7280"
                                    }}>买了 {o.productName}×{o.quantity}</span>
                            </span>
                            <span
                                style={{
                                    color: "#9ca3af",
                                    fontSize: 10
                                }}>{o.timestamp}</span>
                        </div>)}
                    </div>}
                    {filteredProducts.length === 0 && <div
                        style={{
                            textAlign: "center",
                            padding: 40,
                            color: "#9ca3af",
                            fontSize: 13
                        }}>
                        <div
                            style={{
                                fontSize: 40,
                                marginBottom: 8
                            }}>🛒</div>该分类暂无商品
                                    </div>}
                </div>
                {}
                <div
                    style={{
                        background: "#dc2626",
                        padding: "6px 0",
                        textAlign: "center",
                        color: "#fff",
                        fontSize: 10,
                        fontWeight: 600,
                        letterSpacing: 1,
                        flexShrink: 0
                    }}>啪多多 · 米米币支付 · 正品保障
                            </div>
            </div>
        );
    }

    function renderAppContent() {
        if (!currentApp)
            return null;

        switch (currentApp) {
        case "mixin":
            return renderMixin();
        case "moments":
            return renderMoments();
        case "weibo":
            return renderWeibo();
        case "home":
            return renderHome();
        case "pet":
            return renderPet();
        case "dressup":
            return renderDressUp();
        case "me":
            return renderMe();
        case "worldbook":
            return renderWorldBook();
        case "call":
            return renderCall();
        case "browser":
            return renderBrowser();
        case "music":
            return renderMusic();
        case "shopping":
            return renderShopping();
        case "lpmi":
            return renderLpmi();
        case "mimicosmo":
        case "miniworkshop":
            return null;
        case "forum":
            return renderForum();
        case "user-profile":
            return renderUserProfile();
        case "admin":
            return <AdminApp adminRole={adminRole} onClose={() => setCurrentApp(null)} />;
        case "admin-review":
            return <AdminReviewApp loginUsername={loginUsername} onClose={() => setCurrentApp(null)} />;
        case "app-store":
            return renderAppStore();
        default:
            if (currentApp && installedStoreApps.some(a => a.id === currentApp)) {
                return renderStoreApp(currentApp);
            }
            return <div className="empty-state"><div className="empty-emoji">📱</div>APP开发中</div>;
        }
    }

    function renderAppStore() {
        return (
            <AppStoreApp
                isAdmin={isAdmin}
                loginUsername={loginUsername}
                installedAppIds={installedStoreApps.map(a => a.id)}
                onInstall={(app) => {
                    const next = Array.from(new Set([...installedStoreApps, { id: app.app_id, name: app.name, icon: app.icon }]));
                    setInstalledStoreApps(next);
                    try {
                        localStorage.setItem("mimi_installed_apps_v1", JSON.stringify(next));
                    } catch {}
                }}
                onOpenApp={(appId) => {
                    setCurrentApp(appId);
                }}
                onClose={() => setCurrentApp(null)}
            />
        );
    }

    function renderStoreApp(appId: string) {
        const app = installedStoreApps.find(a => a.id === appId);
        return (
            <div className="app-layer" style={{ background: "rgba(255,255,255,0.85)", display: "flex", flexDirection: "column", height: "100%" }}>
                <div style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: 12, borderBottom: "1px solid rgba(184,220,196,0.5)" }}>
                    <button onClick={() => setCurrentApp(null)} style={{ background: "none", border: "none", fontSize: 18, color: "#2e5c33" }}>←</button>
                    <span style={{ fontWeight: 700, color: "#2e5c33" }}>{app?.icon ? `${app.icon} ` : ""}{app?.name || "应用"}</span>
                </div>
                <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#4a7c50" }}>
                    外部应用加载中...
                </div>
            </div>
        );
    }

    function renderForum() {
        return (
            <ForumApp
                onClose={() => setCurrentApp(null)}
                isAdmin={isAdmin}
                loginUsername={loginUsername}
                onViewUserProfile={(username) => {
                    setViewingUserProfile(username);
                    setCurrentApp("user-profile");
                }}
            />
        );
    }

    function renderUserProfile() {
        return (
            <UserProfileApp
                username={viewingUserProfile || loginUsername}
                isSelf={viewingUserProfile === loginUsername || !viewingUserProfile}
                bio={userBio}
                onClose={() => {
                    setViewingUserProfile(null);
                    setCurrentApp("forum");
                }}
            />
        );
    }

    function renderWeiboVerifyScreen() {
        return (
            <div style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                padding: "20px",
                overflow: "auto"
            }}>
                {/* Header */}
                <div style={{
                    display: "flex",
                    alignItems: "center",
                    marginBottom: 24
                }}>
                    <button
                        onClick={() => {
                            setShowWeiboVerify(false);
                            setIsLoggedIn(false);
                        }}
                        style={{
                            background: "none",
                            border: "none",
                            fontSize: 20,
                            cursor: "pointer",
                            color: "#2e5c33",
                            padding: "8px"
                        }}>←</button>
                    <span style={{
                        fontSize: 18,
                        fontWeight: 700,
                        color: "#2e5c33",
                        marginLeft: 8
                    }}>微博身份验证</span>
                </div>

                {wbVerifyStep === "input" && <>
                    {/* Step 1: Input Weibo info */}
                    <div style={{
                        background: "rgba(255,255,255,0.7)",
                        backdropFilter: "blur(20px)",
                        borderRadius: 16,
                        padding: 20,
                        marginBottom: 16
                    }}>
                        <div style={{
                            fontSize: 15,
                            fontWeight: 600,
                            color: "#2e5c33",
                            marginBottom: 12
                        }}>📱 绑定微博账号</div>
                        <div style={{
                            fontSize: 12,
                            color: "#4a7c50",
                            marginBottom: 16,
                            lineHeight: 1.6
                        }}>
                            为了确保社区安全，我们需要验证你的微博身份。请填写你的微博信息：
                        </div>
                        <div style={{ marginBottom: 12 }}>
                            <div style={{
                                fontSize: 11,
                                color: "#3d5c45",
                                fontWeight: 600,
                                marginBottom: 4
                            }}>微博UID或主页链接</div>
                            <input
                                value={wbVerifyUid}
                                onChange={e => setWbVerifyUid(e.target.value)}
                                placeholder="例如：1234567890 或 weibo.com/u/xxx"
                                style={{
                                    width: "100%",
                                    padding: "10px 12px",
                                    border: "1.5px solid rgba(165,214,167,0.5)",
                                    borderRadius: 10,
                                    fontSize: 13,
                                    outline: "none",
                                    background: "rgba(255,255,255,0.8)",
                                    color: "#2e5c33",
                                    boxSizing: "border-box"
                                }}
                            />
                        </div>
                        <div style={{ marginBottom: 16 }}>
                            <div style={{
                                fontSize: 11,
                                color: "#3d5c45",
                                fontWeight: 600,
                                marginBottom: 4
                            }}>微博昵称（选填）</div>
                            <input
                                value={wbVerifyName}
                                onChange={e => setWbVerifyName(e.target.value)}
                                placeholder="你的微博昵称"
                                style={{
                                    width: "100%",
                                    padding: "10px 12px",
                                    border: "1.5px solid rgba(165,214,167,0.5)",
                                    borderRadius: 10,
                                    fontSize: 13,
                                    outline: "none",
                                    background: "rgba(255,255,255,0.8)",
                                    color: "#2e5c33",
                                    boxSizing: "border-box"
                                }}
                            />
                        </div>
                        <button
                            onClick={() => {
                                if (!wbVerifyUid.trim()) return;
                                initWeiboVerify();
                            }}
                            disabled={!wbVerifyUid.trim()}
                            style={{
                                width: "100%",
                                padding: "12px",
                                background: wbVerifyUid.trim() ? "linear-gradient(135deg, #5a9e6a, #2e7d32)" : "#ccc",
                                border: "none",
                                borderRadius: 12,
                                color: "#fff",
                                fontSize: 15,
                                fontWeight: 600,
                                cursor: wbVerifyUid.trim() ? "pointer" : "not-allowed"
                            }}>提交并开始验证</button>
                    </div>
                </>}

                {wbVerifyStep === "waiting" && <>
                    {/* Step 2: Waiting for verification */}
                    <div style={{
                        background: "rgba(255,255,255,0.7)",
                        backdropFilter: "blur(20px)",
                        borderRadius: 16,
                        padding: 20,
                        marginBottom: 16
                    }}>
                        <div style={{
                            fontSize: 15,
                            fontWeight: 600,
                            color: "#2e5c33",
                            marginBottom: 16
                        }}>🔐 验证进度</div>

                        {/* Step 1: DM verification */}
                        <div style={{
                            display: "flex",
                            alignItems: "flex-start",
                            marginBottom: 20,
                            padding: 14,
                            background: wbStep1Passed ? "rgba(34,197,94,0.08)" : "rgba(255,255,255,0.5)",
                            borderRadius: 12,
                            border: wbStep1Passed ? "1.5px solid rgba(34,197,94,0.3)" : "1.5px solid rgba(165,214,167,0.3)"
                        }}>
                            <div style={{
                                width: 28,
                                height: 28,
                                borderRadius: "50%",
                                background: wbStep1Passed ? "#22c55e" : "rgba(165,214,167,0.3)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: 14,
                                flexShrink: 0,
                                marginRight: 12,
                                color: wbStep1Passed ? "#fff" : "#4a7c50"
                            }}>{wbStep1Passed ? "✓" : "1"}</div>
                            <div style={{ flex: 1 }}>
                                <div style={{
                                    fontSize: 14,
                                    fontWeight: 600,
                                    color: wbStep1Passed ? "#16a34a" : "#2e5c33",
                                    marginBottom: 4
                                }}>
                                    {wbStep1Passed ? "✅ 私信验证通过" : "给官方号发验证码"}
                                </div>
                                {!wbStep1Passed && <div style={{
                                    fontSize: 12,
                                    color: "#4a7c50",
                                    lineHeight: 1.6
                                }}>
                                    请用微博给 <span style={{ fontWeight: 600, color: "#2e7d32" }}>@米米官方号</span> 发一条私信，内容为：<br />
                                    <div style={{
                                        background: "rgba(46,125,50,0.08)",
                                        padding: "8px 12px",
                                        borderRadius: 8,
                                        marginTop: 6,
                                        fontFamily: "monospace",
                                        fontSize: 14,
                                        fontWeight: 700,
                                        color: "#2e7d32",
                                        letterSpacing: 1
                                    }}>{wbVerifyCode}</div>
                                    <div style={{
                                        marginTop: 8,
                                        fontSize: 11,
                                        color: "#81c784"
                                    }}>管理员确认后将自动通过</div>
                                </div>}
                            </div>
                        </div>

                        {/* Step 2: 超话等级 check */}
                        <div style={{
                            display: "flex",
                            alignItems: "flex-start",
                            padding: 14,
                            background: wbStep2Passed ? "rgba(34,197,94,0.08)" : "rgba(255,255,255,0.5)",
                            borderRadius: 12,
                            border: wbStep2Passed ? "1.5px solid rgba(34,197,94,0.3)" : "1.5px solid rgba(165,214,167,0.3)",
                            opacity: wbStep1Passed ? 1 : 0.5
                        }}>
                            <div style={{
                                width: 28,
                                height: 28,
                                borderRadius: "50%",
                                background: wbStep2Passed ? "#22c55e" : "rgba(165,214,167,0.3)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: 14,
                                flexShrink: 0,
                                marginRight: 12,
                                color: wbStep2Passed ? "#fff" : "#4a7c50"
                            }}>{wbStep2Passed ? "✓" : "2"}</div>
                            <div style={{ flex: 1 }}>
                                <div style={{
                                    fontSize: 14,
                                    fontWeight: 600,
                                    color: wbStep2Passed ? "#16a34a" : "#2e5c33",
                                    marginBottom: 4
                                }}>
                                    {wbStep2Passed ? "✅ 超话等级验证通过" : "超话等级审核"}
                                </div>
                                {!wbStep2Passed && <div style={{
                                    fontSize: 12,
                                    color: "#4a7c50",
                                    lineHeight: 1.6
                                }}>
                                    {wbStep1Passed
                                        ? "管理员正在检查你的超话等级，请稍候..."
                                        : "完成第一步后自动开始"}
                                </div>}
                            </div>
                        </div>
                    </div>

                    {/* Status hint */}
                    <div style={{
                        textAlign: "center",
                        padding: "12px",
                        fontSize: 12,
                        color: "#4a7c50",
                        background: "rgba(255,255,255,0.4)",
                        borderRadius: 12
                    }}>
                        {wbVerifyStatus === "rejected"
                            ? "❌ 验证未通过，请联系客服"
                            : wbStep1Passed && wbStep2Passed
                                ? "🎉 验证全部通过！正在进入..."
                                : "⏳ 等待管理员审核中，你可以退出页面稍后再来查看"}
                    </div>

                    {/* Refresh button */}
                    <button
                        onClick={checkWeiboVerifyStatus}
                        style={{
                            width: "100%",
                            padding: "12px",
                            marginTop: 12,
                            background: "rgba(255,255,255,0.6)",
                            border: "1.5px solid rgba(165,214,167,0.5)",
                            borderRadius: 12,
                            color: "#2e7d32",
                            fontSize: 14,
                            fontWeight: 600,
                            cursor: "pointer"
                        }}>🔄 刷新状态</button>
                </>}

                {wbVerifyStep === "verified" && <>
                    <div style={{
                        flex: 1,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        textAlign: "center"
                    }}>
                        <div style={{ fontSize: 48, marginBottom: 16 }}>🎉</div>
                        <div style={{
                            fontSize: 18,
                            fontWeight: 700,
                            color: "#2e7d32",
                            marginBottom: 8
                        }}>验证通过！</div>
                        <div style={{
                            fontSize: 13,
                            color: "#4a7c50"
                        }}>正在进入小手机...</div>
                    </div>
                </>}
            </div>
        );
    }

    function renderLoginScreen() {
        return (
            <div
                style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "linear-gradient(170deg, #f0faf0 0%, #dcf0dc 35%, #c8e6c9 75%, #a5d6a7 100%)",
                    position: "relative",
                    overflow: "hidden",
                    padding: "16px 20px"
                }}>
                {}
                <div
                    style={{
                        position: "absolute",
                        top: "-12%",
                        right: "-8%",
                        width: 180,
                        height: 180,
                        borderRadius: "50%",
                        background: "radial-gradient(circle, rgba(76,175,80,0.2) 0%, rgba(76,175,80,0.04) 40%, transparent 70%)",
                        pointerEvents: "none" as const,
                        animation: "float-glow 6s ease-in-out infinite"
                    }} />
                <div
                    style={{
                        position: "absolute",
                        bottom: "-5%",
                        left: "-10%",
                        width: 140,
                        height: 140,
                        borderRadius: "50%",
                        background: "radial-gradient(circle, rgba(129,199,132,0.15) 0%, rgba(129,199,132,0.03) 40%, transparent 70%)",
                        pointerEvents: "none" as const,
                        animation: "float-glow 8s ease-in-out infinite 2s"
                    }} />
                <div
                    style={{
                        position: "absolute",
                        top: "40%",
                        left: "3%",
                        width: 60,
                        height: 60,
                        borderRadius: "50%",
                        background: "radial-gradient(circle, rgba(165,214,167,0.12) 0%, transparent 70%)",
                        pointerEvents: "none" as const
                    }} />
                <div
                    style={{
                        width: "100%",
                        position: "relative",
                        zIndex: 1
                    }}>
                    {}
                    <div
                        style={{
                            textAlign: "center",
                            marginBottom: 28
                        }}>
                        {}
                        <div
                            style={{
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                                width: 72,
                                height: 72,
                                borderRadius: 22,
                                background: "rgba(255,255,255,0.7)",
                                backdropFilter: "blur(20px)",
                                WebkitBackdropFilter: "blur(20px)",
                                boxShadow: "0 8px 32px rgba(46,125,50,0.1), 0 2px 6px rgba(46,125,50,0.05), inset 0 1px 0 rgba(255,255,255,0.9)",
                                marginBottom: 12,
                                transition: "transform 0.3s ease"
                            }}>
                            <span
                                style={{
                                    fontSize: 34,
                                    filter: "drop-shadow(0 2px 4px rgba(46,125,50,0.1))"
                                }}>📱</span>
                        </div>
                        <div
                            style={{
                                fontSize: 24,
                                fontWeight: 900,
                                color: "#2e5c33",
                                letterSpacing: 2.5,
                                textShadow: "0 2px 4px rgba(46,125,50,0.06)"
                            }}>小手机</div>
                        <div
                            style={{
                                fontSize: 11,
                                color: "#4a7c50",
                                marginTop: 4,
                                fontWeight: 500,
                                letterSpacing: 4,
                                textTransform: "uppercase" as const
                            }}>CP社交平台
                                        </div>
                        <div
                            style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                gap: 8,
                                marginTop: 10
                            }}>
                            <span
                                style={{
                                    display: "inline-block",
                                    width: 20,
                                    height: 1,
                                    background: "linear-gradient(90deg, transparent, #5a9e6a)",
                                    borderRadius: 1
                                }} />
                            <span
                                style={{
                                    fontSize: 10,
                                    color: "#5a9e6a",
                                    letterSpacing: 3,
                                    fontWeight: 600
                                }}>验证通</span>
                            <span
                                style={{
                                    display: "inline-block",
                                    width: 20,
                                    height: 1,
                                    background: "linear-gradient(90deg, #5a9e6a, transparent)",
                                    borderRadius: 1
                                }} />
                        </div>
                    </div>
                    {}
                    <div
                        style={{
                            background: "rgba(255,255,255,0.6)",
                            backdropFilter: "blur(32px)",
                            WebkitBackdropFilter: "blur(32px)",
                            borderRadius: 24,
                            padding: "22px 20px",
                            boxShadow: "0 12px 40px rgba(46,125,50,0.08), 0 2px 8px rgba(46,125,50,0.04), inset 0 1px 0 rgba(255,255,255,0.7)",
                            border: "1px solid rgba(255,255,255,0.5)"
                        }}>
                        {}
                        <div
                            style={{
                                marginBottom: 14
                            }}>
                            <div
                                style={{
                                    fontSize: 11,
                                    color: "#3d5c45",
                                    fontWeight: 700,
                                    marginBottom: 6,
                                    letterSpacing: 1.5
                                }}>账 号</div>
                            <div
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    background: "rgba(255,255,255,0.8)",
                                    borderRadius: 14,
                                    border: "1.5px solid rgba(165,214,167,0.5)",
                                    overflow: "hidden",
                                    transition: "border-color 0.2s, box-shadow 0.2s"
                                }}
                                onFocusCapture={e => {
                                    e.currentTarget.style.borderColor = "rgba(90,158,106,0.6)";
                                    e.currentTarget.style.boxShadow = "0 0 0 3px rgba(90,158,106,0.08)";
                                }}
                                onBlurCapture={e => {
                                    e.currentTarget.style.borderColor = "rgba(165,214,167,0.5)";
                                    e.currentTarget.style.boxShadow = "none";
                                }}>
                                <span
                                    style={{
                                        padding: "0 0 0 14px",
                                        fontSize: 16,
                                        opacity: 0.7
                                    }}>👤</span>
                                <input
                                    value={loginUsername}
                                    onChange={e => setLoginUsername(e.target.value)}
                                    onKeyDown={e => e.key === "Enter" && handleLogin()}
                                    placeholder="输入你的账号"
                                    maxLength={20}
                                    style={{
                                        flex: 1,
                                        padding: "12px 14px 12px 8px",
                                        border: "none",
                                        fontSize: 14,
                                        outline: "none",
                                        background: "transparent",
                                        color: "#2e5c33",
                                        fontWeight: 500
                                    }} />
                            </div>
                        </div>
                        <div
                            style={{
                                marginBottom: 20
                            }}>
                            <div
                                style={{
                                    fontSize: 11,
                                    color: "#3d5c45",
                                    fontWeight: 700,
                                    marginBottom: 6,
                                    letterSpacing: 1.5
                                }}>密 码</div>
                            <div
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    background: "rgba(255,255,255,0.8)",
                                    borderRadius: 14,
                                    border: "1.5px solid rgba(165,214,167,0.5)",
                                    overflow: "hidden",
                                    transition: "border-color 0.2s, box-shadow 0.2s"
                                }}
                                onFocusCapture={e => {
                                    e.currentTarget.style.borderColor = "rgba(90,158,106,0.6)";
                                    e.currentTarget.style.boxShadow = "0 0 0 3px rgba(90,158,106,0.08)";
                                }}
                                onBlurCapture={e => {
                                    e.currentTarget.style.borderColor = "rgba(165,214,167,0.5)";
                                    e.currentTarget.style.boxShadow = "none";
                                }}>
                                <span
                                    style={{
                                        padding: "0 0 0 14px",
                                        fontSize: 16,
                                        opacity: 0.7
                                    }}>🔒</span>
                                <input
                                    value={loginPassword}
                                    onChange={e => setLoginPassword(e.target.value)}
                                    onKeyDown={e => e.key === "Enter" && handleLogin()}
                                    placeholder="输入你的密码"
                                    type="password"
                                    maxLength={30}
                                    style={{
                                        flex: 1,
                                        padding: "12px 14px 12px 8px",
                                        border: "none",
                                        fontSize: 14,
                                        outline: "none",
                                        background: "transparent",
                                        color: "#2e5c33",
                                        fontWeight: 500
                                    }} />
                            </div>
                        </div>
                        {}
                        {/* 登录/注册切换 */}
                        <div style={{ display: "flex", justifyContent: "center", gap: 20, marginBottom: 16 }}>
                            <button
                                onClick={() => { setLoginMode("login"); setLoginError(""); }}
                                style={{
                                    background: "none",
                                    border: "none",
                                    fontSize: 14,
                                    fontWeight: loginMode === "login" ? 700 : 400,
                                    color: loginMode === "login" ? "#2e7d32" : "#4a7c50",
                                    cursor: "pointer",
                                    padding: "4px 0",
                                    borderBottom: loginMode === "login" ? "2px solid #2e7d32" : "2px solid transparent",
                                    transition: "all 0.2s"
                                }}>登录</button>
                            <button
                                onClick={() => { setLoginMode("register"); setLoginError(""); }}
                                style={{
                                    background: "none",
                                    border: "none",
                                    fontSize: 14,
                                    fontWeight: loginMode === "register" ? 700 : 400,
                                    color: loginMode === "register" ? "#2e7d32" : "#4a7c50",
                                    cursor: "pointer",
                                    padding: "4px 0",
                                    borderBottom: loginMode === "register" ? "2px solid #2e7d32" : "2px solid transparent",
                                    transition: "all 0.2s"
                                }}>注册</button>
                        </div>
                        {/* 邀请码输入框（注册时且需要邀请码时显示） */}
                        {loginMode === "register" && (
                            <div style={{
                                marginBottom: 14,
                                background: "rgba(255,255,255,0.65)",
                                backdropFilter: "blur(20px)",
                                borderRadius: 14,
                                border: "1px solid rgba(255,255,255,0.5)",
                                overflow: "hidden"
                            }}>
                                <div style={{
                                    display: "flex",
                                    alignItems: "center",
                                    padding: "0 14px"
                                }}>
                                    <span style={{ fontSize: 16, marginRight: 8 }}>🎟️</span>
                                    <input
                                        value={invitationCode}
                                        onChange={(e) => setInvitationCode(e.target.value)}
                                        placeholder="输入邀请码"
                                        maxLength={30}
                                        style={{
                                            flex: 1,
                                            padding: "12px 0",
                                            border: "none",
                                            fontSize: 14,
                                            outline: "none",
                                            background: "transparent",
                                            color: "#2e5c33",
                                            fontWeight: 500
                                        }} />
                                </div>
                            </div>
                        )}
                        {/* 微博昵称（注册时必填） */}
                        {loginMode === "register" && (
                            <div style={{
                                marginBottom: 14
                            }}>
                                <div style={{
                                    fontSize: 11,
                                    color: "#3d5c45",
                                    fontWeight: 700,
                                    marginBottom: 6,
                                    letterSpacing: 1.5
                                }}>微博昵称 <span style={{color: "#ef4444"}}>*</span></div>
                                <div style={{
                                    display: "flex",
                                    alignItems: "center",
                                    background: "rgba(255,255,255,0.8)",
                                    borderRadius: 14,
                                    border: "1.5px solid rgba(165,214,167,0.5)",
                                    overflow: "hidden",
                                    transition: "border-color 0.2s, box-shadow 0.2s"
                                }}
                                onFocusCapture={e => {
                                    e.currentTarget.style.borderColor = "rgba(90,158,106,0.6)";
                                    e.currentTarget.style.boxShadow = "0 0 0 3px rgba(90,158,106,0.08)";
                                }}
                                onBlurCapture={e => {
                                    e.currentTarget.style.borderColor = "rgba(165,214,167,0.5)";
                                    e.currentTarget.style.boxShadow = "none";
                                }}>
                                    <span style={{
                                        padding: "0 0 0 14px",
                                        fontSize: 16,
                                        opacity: 0.7
                                    }}>🧣</span>
                                    <input
                                        value={registerWeiboName}
                                        onChange={e => setRegisterWeiboName(e.target.value)}
                                        placeholder="请输入微博昵称"
                                        style={{
                                            flex: 1,
                                            padding: "12px 14px 12px 8px",
                                            border: "none",
                                            fontSize: 14,
                                            outline: "none",
                                            background: "transparent",
                                            color: "#2e5c33",
                                            fontWeight: 500
                                        }} />
                                </div>
                            </div>
                        )}
                        {/* 微博主页链接（注册时必填） */}
                        {loginMode === "register" && (
                            <div style={{
                                marginBottom: 14
                            }}>
                                <div style={{
                                    fontSize: 11,
                                    color: "#3d5c45",
                                    fontWeight: 700,
                                    marginBottom: 6,
                                    letterSpacing: 1.5
                                }}>微博主页链接 <span style={{color: "#ef4444"}}>*</span></div>
                                <div style={{
                                    display: "flex",
                                    alignItems: "center",
                                    background: "rgba(255,255,255,0.8)",
                                    borderRadius: 14,
                                    border: "1.5px solid rgba(165,214,167,0.5)",
                                    overflow: "hidden",
                                    transition: "border-color 0.2s, box-shadow 0.2s"
                                }}
                                onFocusCapture={e => {
                                    e.currentTarget.style.borderColor = "rgba(90,158,106,0.6)";
                                    e.currentTarget.style.boxShadow = "0 0 0 3px rgba(90,158,106,0.08)";
                                }}
                                onBlurCapture={e => {
                                    e.currentTarget.style.borderColor = "rgba(165,214,167,0.5)";
                                    e.currentTarget.style.boxShadow = "none";
                                }}>
                                    <span style={{
                                        padding: "0 0 0 14px",
                                        fontSize: 16,
                                        opacity: 0.7
                                    }}>🔗</span>
                                    <input
                                        value={weiboLink}
                                        onChange={e => setWeiboLink(e.target.value)}
                                        placeholder="请填写你的微博主页链接"
                                        style={{
                                            flex: 1,
                                            padding: "12px 14px 12px 8px",
                                            border: "none",
                                            fontSize: 14,
                                            outline: "none",
                                            background: "transparent",
                                            color: "#2e5c33",
                                            fontWeight: 500
                                        }} />
                                </div>
                            </div>
                        )}
                        {/* 注册成功待审核提示 */}
                        {adminPendingMsg && (
                            <div style={{
                                background: "rgba(46,125,50,0.06)",
                                border: "1px solid rgba(46,125,50,0.2)",
                                borderRadius: 10,
                                padding: "12px 14px",
                                marginBottom: 14,
                                fontSize: 13,
                                color: "#2e5c33",
                                textAlign: "center",
                                lineHeight: 1.6
                            }}>
                                {adminPendingMsg}
                                <button
                                    onClick={() => { setAdminPendingMsg(""); setLoginMode("login"); }}
                                    style={{
                                        display: "block",
                                        margin: "10px auto 0",
                                        padding: "6px 20px",
                                        fontSize: 13,
                                        color: "#fff",
                                        background: "#2e7d32",
                                        border: "none",
                                        borderRadius: 8,
                                        cursor: "pointer"
                                    }}
                                >去登录</button>
                            </div>
                        )}
                        {/* 被踢下线提示 */}
                        {kickedMessage && (
                            <div style={{
                                background: "rgba(234,179,8,0.08)",
                                border: "1px solid rgba(234,179,8,0.25)",
                                borderRadius: 10,
                                padding: "10px 14px",
                                marginBottom: 14,
                                fontSize: 13,
                                color: "#92400e",
                                textAlign: "center"
                            }}>
                                {kickedMessage}
                                <button
                                    onClick={() => setKickedMessage(null)}
                                    style={{
                                        display: "block",
                                        margin: "8px auto 0",
                                        fontSize: 12,
                                        color: "#5a9e6a",
                                        background: "none",
                                        border: "none",
                                        cursor: "pointer",
                                        textDecoration: "underline"
                                    }}
                                >知道了</button>
                            </div>
                        )}
                        {/* 错误提示 */}
                        {loginError && (
                            <div style={{
                                background: "rgba(239,83,80,0.08)",
                                border: "1px solid rgba(239,83,80,0.2)",
                                borderRadius: 10,
                                padding: "10px 14px",
                                marginBottom: 14,
                                fontSize: 13,
                                color: "#c62828",
                                textAlign: "center"
                            }}>{loginError}</div>
                        )}
                        <button
                            onClick={handleLogin}
                            style={{
                                width: "100%",
                                padding: "13px 0",
                                borderRadius: 14,
                                background: "linear-gradient(135deg, #5a9e6a 0%, #3d8b5a 100%)",
                                color: "#fff",
                                fontSize: 16,
                                fontWeight: 700,
                                border: "none",
                                cursor: "pointer",
                                boxShadow: "0 6px 20px rgba(90,158,106,0.35), 0 2px 4px rgba(90,158,106,0.15)",
                                transition: "all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)",
                                letterSpacing: 5
                            }}
                            onMouseDown={e => (e.currentTarget.style.transform = "scale(0.96)", e.currentTarget.style.boxShadow = "0 2px 8px rgba(90,158,106,0.2)")}
                            onMouseUp={e => (e.currentTarget.style.transform = "scale(1)", e.currentTarget.style.boxShadow = "0 6px 20px rgba(90,158,106,0.35), 0 2px 4px rgba(90,158,106,0.15)")}
                            onMouseLeave={e => (e.currentTarget.style.transform = "scale(1)", e.currentTarget.style.boxShadow = "0 6px 20px rgba(90,158,106,0.35), 0 2px 4px rgba(90,158,106,0.15)")}>{loginMode === "login" ? "登 录" : "注 册"}</button>
                        {}
                        <div
                            style={{
                                textAlign: "center",
                                marginTop: 12,
                                fontSize: 10,
                                color: "#4a7c50",
                                lineHeight: 1.6
                            }}>登录即代表同意 <span
                                style={{
                                    color: "#3d8b5a",
                                    textDecoration: "underline",
                                    cursor: "pointer",
                                    fontWeight: 500
                                }}>用户协议</span>和 <span
                                style={{
                                    color: "#3d8b5a",
                                    textDecoration: "underline",
                                    cursor: "pointer",
                                    fontWeight: 500
                                }}>隐私政策</span>
                        </div>
                    </div>
                    {/* 忘记密码链接 */}
                    <div style={{ textAlign: "center", marginTop: 12 }}>
                        <span
                            onClick={() => setShowForgotPassword(true)}
                            style={{
                                fontSize: 12,
                                color: "#3d8b5a",
                                textDecoration: "underline",
                                cursor: "pointer",
                                fontWeight: 500
                            }}>
                            忘记密码？
                        </span>
                    </div>
                    {}
                    <div
                        style={{
                            textAlign: "center",
                            marginTop: 18
                        }}>
                        <div
                            style={{
                                fontSize: 10,
                                color: "#4a7c50",
                                opacity: 0.65,
                                marginBottom: 4,
                                fontWeight: 500
                            }}>💡 管理员账号：admin / manager_lin / cp_official
                                        </div>
                        <div
                            style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                gap: 12
                            }}>
                            <span
                                style={{
                                    fontSize: 10,
                                    color: "#5a9e6a",
                                    opacity: 0.45
                                }}>v1.0.0</span>
                            <span
                                style={{
                                    width: 1,
                                    height: 10,
                                    background: "#5a9e6a",
                                    opacity: 0.2,
                                    borderRadius: 1
                                }} />
                            <span
                                style={{
                                    fontSize: 10,
                                    color: "#5a9e6a",
                                    opacity: 0.45
                                }}>AI小手机团队</span>
                        </div>
                    </div>
                </div>
                {}
                <style>{`
          @keyframes float-glow {
            0%, 100% { transform: translateY(0) scale(1); opacity: 0.7; }
            50% { transform: translateY(-8px) scale(1.05); opacity: 1; }
          }
        `}</style>
                {/* 忘记密码弹窗 */}
                {showForgotPassword && (
                    <div style={{
                        position: "absolute",
                        inset: 0,
                        background: "rgba(0,0,0,0.5)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        zIndex: 100,
                        padding: 20
                    }}>
                        <div style={{
                            background: "white",
                            borderRadius: 20,
                            padding: 24,
                            width: "100%",
                            maxWidth: 320,
                            boxShadow: "0 10px 40px rgba(0,0,0,0.2)"
                        }}>
                            <div style={{ fontSize: 18, fontWeight: 700, color: "#2e5c33", marginBottom: 16 }}>
                                {forgotPasswordSubmitted ? "申请已提交" : "忘记密码"}
                            </div>
                            {!forgotPasswordSubmitted ? (
                                <>
                                    <div style={{ fontSize: 12, color: "#666", marginBottom: 16, lineHeight: 1.5 }}>
                                        提交申请后，管理员会通过微博私信将新密码发送给您
                                    </div>
                                    <div style={{ marginBottom: 12 }}>
                                        <div style={{ fontSize: 11, color: "#3d5c45", fontWeight: 700, marginBottom: 6 }}>账号 <span style={{color: "#ef4444"}}>*</span></div>
                                        <input
                                            value={forgotPasswordForm.username}
                                            onChange={e => setForgotPasswordForm({...forgotPasswordForm, username: e.target.value})}
                                            placeholder="请输入账号"
                                            style={{
                                                width: "100%",
                                                padding: "10px 12px",
                                                border: "1.5px solid rgba(165,214,167,0.5)",
                                                borderRadius: 10,
                                                fontSize: 14,
                                                outline: "none",
                                                boxSizing: "border-box"
                                            }} />
                                    </div>
                                    <div style={{ marginBottom: 12 }}>
                                        <div style={{ fontSize: 11, color: "#3d5c45", fontWeight: 700, marginBottom: 6 }}>微博昵称 <span style={{color: "#ef4444"}}>*</span></div>
                                        <input
                                            value={forgotPasswordForm.weiboNickname}
                                            onChange={e => setForgotPasswordForm({...forgotPasswordForm, weiboNickname: e.target.value})}
                                            placeholder="请输入微博昵称"
                                            style={{
                                                width: "100%",
                                                padding: "10px 12px",
                                                border: "1.5px solid rgba(165,214,167,0.5)",
                                                borderRadius: 10,
                                                fontSize: 14,
                                                outline: "none",
                                                boxSizing: "border-box"
                                            }} />
                                    </div>
                                    <div style={{ marginBottom: 16 }}>
                                        <div style={{ fontSize: 11, color: "#3d5c45", fontWeight: 700, marginBottom: 6 }}>微博主页链接 <span style={{color: "#ef4444"}}>*</span></div>
                                        <input
                                            value={forgotPasswordForm.weiboLink}
                                            onChange={e => setForgotPasswordForm({...forgotPasswordForm, weiboLink: e.target.value})}
                                            placeholder="请输入微博主页链接"
                                            style={{
                                                width: "100%",
                                                padding: "10px 12px",
                                                border: "1.5px solid rgba(165,214,167,0.5)",
                                                borderRadius: 10,
                                                fontSize: 14,
                                                outline: "none",
                                                boxSizing: "border-box"
                                            }} />
                                    </div>
                                    <div style={{ display: "flex", gap: 10 }}>
                                        <button
                                            onClick={() => {
                                                setShowForgotPassword(false);
                                                setForgotPasswordForm({ username: "", weiboNickname: "", weiboLink: "" });
                                            }}
                                            style={{
                                                flex: 1,
                                                padding: "10px 0",
                                                background: "#f0f0f0",
                                                color: "#666",
                                                border: "none",
                                                borderRadius: 10,
                                                fontSize: 14,
                                                fontWeight: 600,
                                                cursor: "pointer"
                                            }}>
                                            取消
                                        </button>
                                        <button
                                            onClick={() => {
                                                if (!forgotPasswordForm.username || !forgotPasswordForm.weiboNickname || !forgotPasswordForm.weiboLink) {
                                                    alert("请填写所有必填项");
                                                    return;
                                                }
                                                const newRequest = {
                                                    id: "fp_" + Date.now(),
                                                    username: forgotPasswordForm.username,
                                                    weiboNickname: forgotPasswordForm.weiboNickname,
                                                    weiboLink: forgotPasswordForm.weiboLink,
                                                    status: "pending" as const,
                                                    createdAt: new Date().toLocaleString("zh-CN")
                                                };
                                                setForgotPasswordRequests([...forgotPasswordRequests, newRequest]);
                                                setForgotPasswordSubmitted(true);
                                                setTimeout(() => {
                                                    setShowForgotPassword(false);
                                                    setForgotPasswordSubmitted(false);
                                                    setForgotPasswordForm({ username: "", weiboNickname: "", weiboLink: "" });
                                                }, 3000);
                                            }}
                                            style={{
                                                flex: 1,
                                                padding: "10px 0",
                                                background: "linear-gradient(135deg, #5a9e6a 0%, #3d8b5a 100%)",
                                                color: "white",
                                                border: "none",
                                                borderRadius: 10,
                                                fontSize: 14,
                                                fontWeight: 600,
                                                cursor: "pointer"
                                            }}>
                                            提交申请
                                        </button>
                                    </div>
                                </>
                            ) : (
                                <div style={{ textAlign: "center", padding: "20px 0" }}>
                                    <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
                                    <div style={{ fontSize: 14, color: "#3d5c45", lineHeight: 1.6 }}>
                                        申请已提交，请关注您的微博私信<br/>
                                        管理员会尽快联系您
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        );
    }

    function renderAdminDashboard() {
        const totalUsers = 2;
        const todayActive = 2;
        const totalCost = (tokenTotalConsumed / 10000 * tokenCostPer).toFixed(2);
        const avgCost = (tokenTotalConsumed / Math.max(totalUsers, 1)).toFixed(0);

        return (
            <div
                style={{
                    flex: 1,
                    background: "linear-gradient(180deg, #faf8f3 0%, #f8f5ee 100%)",
                    overflow: "hidden",
                    display: "flex",
                    flexDirection: "column"
                }}>
                {}
                <div
                    style={{
                        flexShrink: 0,
                        background: "rgba(255,255,255,0.85)",
                        backdropFilter: "blur(20px)",
                        WebkitBackdropFilter: "blur(20px)",
                        borderBottom: "1px solid rgba(146,64,0,0.08)",
                        padding: "10px 14px",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center"
                    }}>
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8
                        }}>
                        <div
                            style={{
                                width: 28,
                                height: 28,
                                borderRadius: 10,
                                background: "linear-gradient(135deg, #f59e0b, #d97706)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                boxShadow: "0 2px 8px rgba(245,158,11,0.25)"
                            }}>
                            <span
                                style={{
                                    fontSize: 14
                                }}>🔧</span>
                        </div>
                        <div>
                            <div
                                style={{
                                    fontSize: 13,
                                    fontWeight: 800,
                                    color: "#78350f",
                                    letterSpacing: 0.5
                                }}>管理员总控</div>
                            <div
                                style={{
                                    fontSize: 9,
                                    color: "#b45309",
                                    opacity: 0.6
                                }}>@{loginUsername}</div>
                        </div>
                    </div>
                    <div
                        style={{
                            display: "flex",
                            gap: 6
                        }}>
                        <button
                            onClick={() => {
                                setIsLoggedIn(false);
                                setIsAdmin(false);
                                setLoginUsername("");
                                setAuthToken(null);
                                localStorage.removeItem("auth_token");
                                localStorage.removeItem("mock_admin_user");
                            }}
                            style={{
                                fontSize: 10,
                                padding: "6px 12px",
                                borderRadius: 10,
                                background: "rgba(0,0,0,0.04)",
                                color: "#888",
                                border: "1px solid rgba(0,0,0,0.06)",
                                fontWeight: 500,
                                cursor: "pointer"
                            }}>退出
                                        </button>
                        <button
                            onClick={() => setAdminViewMode("user")}
                            style={{
                                fontSize: 10,
                                padding: "6px 14px",
                                borderRadius: 10,
                                background: "linear-gradient(135deg, #f59e0b, #ec4899)",
                                color: "#fff",
                                border: "none",
                                fontWeight: 600,
                                cursor: "pointer",
                                boxShadow: "0 3px 12px rgba(245,158,11,0.3)",
                                letterSpacing: 0.5
                            }}>🎮 用户模式
                                        </button>
                    </div>
                </div>
                {}
                <div
                    style={{
                        flexShrink: 0,
                        display: "flex",
                        borderBottom: "1px solid rgba(146,64,0,0.06)",
                        background: "rgba(255,255,255,0.6)",
                        backdropFilter: "blur(12px)",
                        padding: "0 6px"
                    }}>
                    {[{
                        key: "dashboard" as const,
                        icon: "📊",
                        label: "看板"
                    }, {
                        key: "cpchat" as const,
                        icon: "💬",
                        label: "私聊"
                    }, {
                        key: "content" as const,
                        icon: "🔧",
                        label: "内容"
                    }, {
                        key: "token" as const,
                        icon: "💰",
                        label: "定价"
                    }, {
                        key: "weibo" as const,
                        icon: "🔐",
                        label: "验证"
                    }, {
                        key: "admins" as const,
                        icon: "👑",
                        label: "管理"
                    }, {
                        key: "invite" as const,
                        icon: "🎟️",
                        label: "邀请"
                    }, {
                        key: "god" as const,
                        icon: "👁️",
                        label: "上帝"
                    }].map(tab => <div
                        key={tab.key}
                        onClick={() => setAdminTab(tab.key)}
                        style={{
                            padding: "10px 0",
                            cursor: "pointer",
                            fontSize: 10,
                            fontWeight: adminTab === tab.key ? 700 : 500,
                            color: adminTab === tab.key ? "#92400e" : "#bbb",
                            borderBottom: adminTab === tab.key ? "2.5px solid #f59e0b" : "2.5px solid transparent",
                            transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
                            textAlign: "center",
                            flex: 1,
                            position: "relative"
                        }}>
                        <div
                            style={{
                                fontSize: 16,
                                marginBottom: 2,
                                filter: adminTab === tab.key ? "none" : "grayscale(0.5)",
                                opacity: adminTab === tab.key ? 1 : 0.5,
                                transition: "all 0.25s"
                            }}>{tab.icon}</div>
                        <div
                            style={{
                                marginTop: 1
                            }}>{tab.label}</div>
                    </div>)}
                </div>
                <div
                    style={{
                        flex: 1,
                        overflow: "auto",
                        padding: "12px"
                    }}>
                    {}
                    {adminTab === "dashboard" && <div>
                        <div
                            style={{
                                display: "grid",
                                gridTemplateColumns: "repeat(2, 1fr)",
                                gap: 8,
                                marginBottom: 10
                            }}>
                            {[{
                                label: "总用户数",
                                value: totalUsers,
                                icon: "👥",
                                color: "#3b82f6",
                                bg: "rgba(59,130,246,0.08)"
                            }, {
                                label: "今日活跃",
                                value: todayActive,
                                icon: "🔥",
                                color: "#ef4444",
                                bg: "rgba(239,68,68,0.08)"
                            }, {
                                label: "累计消耗Token",
                                value: tokenTotalConsumed.toLocaleString(),
                                icon: "💎",
                                color: "#8b5cf6",
                                bg: "rgba(139,92,246,0.08)"
                            }, {
                                label: "API总成本",
                                value: `${totalCost}元`,
                                icon: "💰",
                                color: "#f59e0b",
                                bg: "rgba(245,158,11,0.08)"
                            }].map(card => <div
                                key={card.label}
                                style={{
                                    background: "rgba(255,255,255,0.7)",
                                    borderRadius: 14,
                                    padding: 14,
                                    boxShadow: "0 2px 12px rgba(146,64,0,0.04), 0 1px 2px rgba(146,64,0,0.03)",
                                    border: "1px solid rgba(255,255,255,0.6)"
                                }}>
                                <div
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 8,
                                        marginBottom: 6
                                    }}>
                                    <div
                                        style={{
                                            width: 28,
                                            height: 28,
                                            borderRadius: 9,
                                            background: card.bg,
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            fontSize: 14
                                        }}>{card.icon}</div>
                                </div>
                                <div
                                    style={{
                                        fontSize: 18,
                                        fontWeight: 800,
                                        color: card.color,
                                        lineHeight: 1.2
                                    }}>{card.value}</div>
                                <div
                                    style={{
                                        fontSize: 10,
                                        color: "#999",
                                        marginTop: 2,
                                        fontWeight: 500
                                    }}>{card.label}</div>
                            </div>)}
                        </div>
                        <div
                            style={{
                                background: "rgba(255,255,255,0.7)",
                                borderRadius: 14,
                                padding: 14,
                                boxShadow: "0 2px 12px rgba(146,64,0,0.04), 0 1px 2px rgba(146,64,0,0.03)",
                                border: "1px solid rgba(255,255,255,0.6)"
                            }}>
                            <div
                                style={{
                                    fontSize: 12,
                                    fontWeight: 700,
                                    color: "#78350f",
                                    marginBottom: 8,
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 6
                                }}>
                                <span
                                    style={{
                                        width: 4,
                                        height: 14,
                                        borderRadius: 2,
                                        background: "#f59e0b"
                                    }} />📈 成本分析
                                                </div>
                            <div
                                style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    fontSize: 11,
                                    color: "#666",
                                    padding: "5px 0",
                                    borderBottom: "1px solid rgba(0,0,0,0.04)"
                                }}>
                                <span>人均消耗</span><span
                                    style={{
                                        fontWeight: 600,
                                        color: "#333"
                                    }}>{avgCost}Token</span>
                            </div>
                            <div
                                style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    fontSize: 11,
                                    color: "#666",
                                    padding: "5px 0",
                                    borderBottom: "1px solid rgba(0,0,0,0.04)"
                                }}>
                                <span>单位成本</span><span
                                    style={{
                                        fontWeight: 600,
                                        color: "#333"
                                    }}>{tokenCostPer}元/万Token</span>
                            </div>
                            <div
                                style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    fontSize: 11,
                                    color: "#666",
                                    padding: "5px 0"
                                }}>
                                <span>建议定价</span><span
                                    style={{
                                        fontWeight: 700,
                                        color: "#f59e0b"
                                    }}>{(tokenCostPer * 1.5).toFixed(1)}元/万Token</span>
                            </div>
                        </div>
                    </div>}
                    {}
                    {adminTab === "cpchat" && <div>
                        <div
                            style={{
                                background: "rgba(255,255,255,0.7)",
                                borderRadius: 14,
                                padding: 14,
                                boxShadow: "0 2px 12px rgba(146,64,0,0.04), 0 1px 2px rgba(146,64,0,0.03)",
                                border: "1px solid rgba(255,255,255,0.6)",
                                marginBottom: 10
                            }}>
                            <div
                                style={{
                                    fontSize: 12,
                                    fontWeight: 700,
                                    color: "#78350f",
                                    marginBottom: 8,
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 6
                                }}>
                                <span
                                    style={{
                                        width: 4,
                                        height: 14,
                                        borderRadius: 2,
                                        background: "#ec4899"
                                    }} />💬 CP私聊记录
                                                </div>
                            <div
                                style={{
                                    maxHeight: 180,
                                    overflowY: "auto",
                                    background: "rgba(248,245,237,0.8)",
                                    borderRadius: 10,
                                    padding: 10
                                }}>
                                {cpChatMessages.map(msg => <div
                                    key={msg.id}
                                    style={{
                                        display: "flex",
                                        gap: 6,
                                        marginBottom: 8,
                                        alignItems: "flex-start"
                                    }}>
                                    <div
                                        style={{
                                            width: 24,
                                            height: 24,
                                            borderRadius: "50%",
                                            background: msg.from === "A" ? "linear-gradient(135deg, #f59e0b, #fbbf24)" : "linear-gradient(135deg, #ec4899, #f472b6)",
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            fontSize: 11,
                                            flexShrink: 0,
                                            color: "#fff",
                                            fontWeight: 700
                                        }}>
                                        {msg.from === "A" ? "田" : "梓"}
                                    </div>
                                    <div>
                                        <div
                                            style={{
                                                fontSize: 8,
                                                color: "#bbb",
                                                marginBottom: 1
                                            }}>{msg.from === "A" ? "田栩宁" : "梓渝"}· {msg.time}</div>
                                        <div
                                            style={{
                                                fontSize: 11,
                                                color: "#333",
                                                lineHeight: 1.5,
                                                background: msg.from === "A" ? "rgba(245,158,11,0.06)" : "rgba(236,72,153,0.06)",
                                                padding: "4px 8px",
                                                borderRadius: 8
                                            }}>{msg.text}</div>
                                    </div>
                                </div>)}
                            </div>
                        </div>
                        <div
                            style={{
                                background: "rgba(255,255,255,0.7)",
                                borderRadius: 14,
                                padding: 14,
                                boxShadow: "0 2px 12px rgba(146,64,0,0.04), 0 1px 2px rgba(146,64,0,0.03)",
                                border: "1px solid rgba(255,255,255,0.6)",
                                marginBottom: 10
                            }}>
                            <div
                                style={{
                                    fontSize: 12,
                                    fontWeight: 700,
                                    color: "#78350f",
                                    marginBottom: 8,
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 6
                                }}>
                                <span
                                    style={{
                                        width: 4,
                                        height: 14,
                                        borderRadius: 2,
                                        background: "#f59e0b"
                                    }} />✍️ 设置私聊
                                                </div>
                            <div
                                style={{
                                    display: "flex",
                                    gap: 6,
                                    marginBottom: 8
                                }}>
                                <select
                                    value={cpChatTarget}
                                    onChange={e => setCpChatTarget(e.target.value as "A" | "B")}
                                    style={{
                                        padding: "7px 10px",
                                        borderRadius: 10,
                                        border: "1.5px solid rgba(253,230,138,0.5)",
                                        fontSize: 10,
                                        background: "rgba(255,255,255,0.8)",
                                        outline: "none",
                                        fontWeight: 500,
                                        color: "#78350f"
                                    }}>
                                    <option value="A">A → B（田→梓）</option>
                                    <option value="B">B → A（梓→田）</option>
                                </select>
                            </div>
                            <div
                                style={{
                                    display: "flex",
                                    gap: 6
                                }}>
                                <input
                                    value={cpChatInput}
                                    onChange={e => setCpChatInput(e.target.value)}
                                    onKeyDown={e => e.key === "Enter" && handleAdminSetCpChat()}
                                    placeholder="输入私聊内容..."
                                    style={{
                                        flex: 1,
                                        padding: "8px 12px",
                                        borderRadius: 10,
                                        border: "1.5px solid rgba(253,230,138,0.5)",
                                        fontSize: 11,
                                        outline: "none",
                                        background: "rgba(255,255,255,0.8)",
                                        color: "#78350f"
                                    }} />
                                <button
                                    onClick={handleAdminSetCpChat}
                                    style={{
                                        padding: "8px 14px",
                                        borderRadius: 10,
                                        background: "linear-gradient(135deg, #f59e0b, #d97706)",
                                        color: "#fff",
                                        border: "none",
                                        fontWeight: 600,
                                        cursor: "pointer",
                                        fontSize: 10,
                                        boxShadow: "0 2px 8px rgba(245,158,11,0.25)",
                                        whiteSpace: "nowrap"
                                    }}>插入</button>
                            </div>
                        </div>
                        <button
                            onClick={() => {
                                if (cpChatMessages.length > 0) {
                                    alert("已将最新私聊推送给所有用户！");
                                }
                            }}
                            style={{
                                width: "100%",
                                padding: "10px",
                                borderRadius: 12,
                                background: "linear-gradient(135deg, #ec4899, #f59e0b)",
                                color: "#fff",
                                border: "none",
                                fontWeight: 700,
                                cursor: "pointer",
                                fontSize: 11,
                                boxShadow: "0 4px 16px rgba(236,72,153,0.25)",
                                letterSpacing: 1
                            }}>📢 推送最新私聊给所有用户
                                          </button>
                    </div>}
                    {}
                    {adminTab === "content" && <div>
                        <div
                            style={{
                                background: "rgba(255,255,255,0.7)",
                                borderRadius: 14,
                                padding: 14,
                                boxShadow: "0 2px 12px rgba(146,64,0,0.04), 0 1px 2px rgba(146,64,0,0.03)",
                                border: "1px solid rgba(255,255,255,0.6)",
                                marginBottom: 10
                            }}>
                            <div
                                style={{
                                    fontSize: 12,
                                    fontWeight: 700,
                                    color: "#78350f",
                                    marginBottom: 8,
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 6
                                }}>
                                <span
                                    style={{
                                        width: 4,
                                        height: 14,
                                        borderRadius: 2,
                                        background: "#ef4444"
                                    }} />🔥 热搜榜管理
                                                </div>
                            {weiboHotSearch.map((item, idx) => <div
                                key={item.id}
                                style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    padding: "6px 0",
                                    borderBottom: "1px solid rgba(0,0,0,0.04)"
                                }}>
                                <div
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 8
                                    }}>
                                    <span
                                        style={{
                                            width: 20,
                                            fontSize: 12,
                                            fontWeight: 800,
                                            color: idx < 3 ? "#ef4444" : idx < 5 ? "#f59e0b" : "#bbb",
                                            flexShrink: 0,
                                            textAlign: "center"
                                        }}>{idx + 1}</span>
                                    <span
                                        style={{
                                            flex: 1,
                                            fontSize: 10,
                                            color: "#333",
                                            overflow: "hidden",
                                            textOverflow: "ellipsis",
                                            whiteSpace: "nowrap",
                                            lineHeight: 1.4
                                        }}>
                                        {item.title}
                                        {item.tag && <span
                                            style={{
                                                marginLeft: 3,
                                                fontSize: 7,
                                                background: item.tagColor || "#f97316",
                                                color: "#fff",
                                                padding: "1px 4px",
                                                borderRadius: 3,
                                                fontWeight: 600,
                                                verticalAlign: "middle"
                                            }}>{item.tag}</span>}
                                    </span>
                                    <button
                                        onClick={() => {
                                            setWeiboHotSearch(prev => {
                                                const updated = [item, ...prev.filter(p => p.id !== item.id)];

                                                return updated.map((h, i) => ({
                                                    ...h,
                                                    id: i + 1
                                                }));
                                            });
                                        }}
                                        style={{
                                            fontSize: 8,
                                            padding: "3px 8px",
                                            borderRadius: 8,
                                            background: adminHotSearchLocked.includes(item.id) ? "rgba(254,243,199,0.8)" : "rgba(0,0,0,0.04)",
                                            color: adminHotSearchLocked.includes(item.id) ? "#f59e0b" : "#888",
                                            border: "none",
                                            cursor: "pointer",
                                            fontWeight: 600,
                                            whiteSpace: "nowrap"
                                        }}>
                                        {adminHotSearchLocked.includes(item.id) ? "📌 已置顶" : "置顶"}
                                    </button>
                                    <button
                                        onClick={() => {
                                            const title = prompt("修改标题:", item.title);

                                            if (title !== null) {
                                                setWeiboHotSearch(prev => prev.map(h => h.id === item.id ? {
                                                    ...h,
                                                    title
                                                } : h));
                                            }
                                        }}
                                        style={{
                                            fontSize: 8,
                                            padding: "3px 6px",
                                            borderRadius: 8,
                                            background: "rgba(0,0,0,0.04)",
                                            color: "#888",
                                            border: "none",
                                            cursor: "pointer"
                                        }}>✏️</button>
                                    <button
                                        onClick={() => {
                                            const detail = prompt("修改详情内容:", item.detail || "");

                                            if (detail !== null) {
                                                setWeiboHotSearch(prev => prev.map(h => h.id === item.id ? {
                                                    ...h,
                                                    detail
                                                } : h));
                                            }
                                        }}
                                        style={{
                                            fontSize: 8,
                                            padding: "3px 6px",
                                            borderRadius: 8,
                                            background: "rgba(0,0,0,0.04)",
                                            color: "#888",
                                            border: "none",
                                            cursor: "pointer"
                                        }}>📝</button>
                                    <button
                                        onClick={() => {
                                            const imgUrl = prompt("添加图片URL（留空则清除）:", item.detailImage || "");

                                            if (imgUrl !== null) {
                                                setWeiboHotSearch(prev => prev.map(h => h.id === item.id ? {
                                                    ...h,
                                                    detailImage: imgUrl || undefined
                                                } : h));
                                            }
                                        }}
                                        style={{
                                            fontSize: 8,
                                            padding: "3px 6px",
                                            borderRadius: 8,
                                            background: item.detailImage ? "rgba(16,185,129,0.1)" : "rgba(0,0,0,0.04)",
                                            color: item.detailImage ? "#10b981" : "#888",
                                            border: "none",
                                            cursor: "pointer"
                                        }}>{item.detailImage ? "🖼️" : "🖼️+"}</button>
                                </div>
                                {item.detail && <div
                                    style={{
                                        fontSize: 8,
                                        color: "#888",
                                        marginTop: 3,
                                        marginLeft: 28,
                                        lineHeight: 1.3,
                                        maxHeight: 24,
                                        overflow: "hidden"
                                    }}>{item.detail.slice(0, 60)}</div>}
                                {item.detailImage && <div
                                    style={{
                                        marginLeft: 28,
                                        marginTop: 4,
                                        width: 60,
                                        height: 36,
                                        borderRadius: 6,
                                        background: `url(${item.detailImage}) center/cover`,
                                        border: "1px solid rgba(0,0,0,0.06)"
                                    }} />}
                            </div>)}
                        </div>
                        <div
                            style={{
                                background: "rgba(255,255,255,0.7)",
                                borderRadius: 14,
                                padding: 14,
                                boxShadow: "0 2px 12px rgba(146,64,0,0.04), 0 1px 2px rgba(146,64,0,0.03)",
                                border: "1px solid rgba(255,255,255,0.6)"
                            }}>
                            <div
                                style={{
                                    fontSize: 12,
                                    fontWeight: 700,
                                    color: "#78350f",
                                    marginBottom: 8,
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 6
                                }}>
                                <span
                                    style={{
                                        width: 4,
                                        height: 14,
                                        borderRadius: 2,
                                        background: "#ef4444"
                                    }} />📢 发送官方公告
                                                </div>
                            <div
                                style={{
                                    display: "flex",
                                    gap: 6
                                }}>
                                <input
                                    value={adminAnnouncement}
                                    onChange={e => setAdminAnnouncement(e.target.value)}
                                    placeholder="输入公告内容..."
                                    style={{
                                        flex: 1,
                                        padding: "9px 12px",
                                        borderRadius: 10,
                                        border: "1.5px solid rgba(253,230,138,0.5)",
                                        fontSize: 11,
                                        outline: "none",
                                        background: "rgba(255,255,255,0.8)",
                                        color: "#78350f"
                                    }} />
                                <button
                                    onClick={() => {
                                        if (adminAnnouncement.trim()) {
                                            const newPost: WeiboPost = {
                                                id: weiboNextId.current++,
                                                avatar: "📢",
                                                name: "官方公告",
                                                tag: "官方",
                                                verified: true,
                                                time: "刚刚",
                                                text: adminAnnouncement.trim(),
                                                color: "#ef4444",
                                                likes: 0,
                                                iLiked: false,
                                                comments: [],
                                                reposts: 0,
                                                expandedComments: false,
                                                commentsLoaded: true
                                            };

                                            setWeiboData(prev => [newPost, ...prev]);
                                            setAdminAnnouncement("");
                                            alert("公告已发布！");
                                        }
                                    }}
                                    style={{
                                        padding: "9px 16px",
                                        borderRadius: 10,
                                        background: "linear-gradient(135deg, #ef4444, #dc2626)",
                                        color: "#fff",
                                        border: "none",
                                        fontWeight: 600,
                                        cursor: "pointer",
                                        fontSize: 10,
                                        boxShadow: "0 2px 8px rgba(239,68,68,0.25)",
                                        whiteSpace: "nowrap"
                                    }}>发布</button>
                            </div>
                        </div>
                    </div>}
                    {}
                    {adminTab === "token" && <div>
                        <div
                            style={{
                                background: "rgba(255,255,255,0.7)",
                                borderRadius: 14,
                                padding: 14,
                                boxShadow: "0 2px 12px rgba(146,64,0,0.04), 0 1px 2px rgba(146,64,0,0.03)",
                                border: "1px solid rgba(255,255,255,0.6)",
                                marginBottom: 10
                            }}>
                            <div
                                style={{
                                    fontSize: 12,
                                    fontWeight: 700,
                                    color: "#78350f",
                                    marginBottom: 10,
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 6
                                }}>
                                <span
                                    style={{
                                        width: 4,
                                        height: 14,
                                        borderRadius: 2,
                                        background: "#f59e0b"
                                    }} />💰 消耗单价设置
                                                </div>
                            {[{
                                key: "postImage" as const,
                                label: "发图消耗",
                                icon: "📷"
                            }, {
                                key: "viewPrivateChat" as const,
                                label: "看私聊消耗",
                                icon: "🔒"
                            }, {
                                key: "aiChat" as const,
                                label: "AI对话消耗",
                                icon: "🤖"
                            }].map(item => <div
                                key={item.key}
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                    padding: "8px 0",
                                    borderBottom: "1px solid rgba(0,0,0,0.04)"
                                }}>
                                <span
                                    style={{
                                        fontSize: 11,
                                        color: "#666",
                                        fontWeight: 500
                                    }}>{item.icon} {item.label}</span>
                                <div
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 6
                                    }}>
                                    <input
                                        type="number"
                                        value={tokenPricing[item.key]}
                                        onChange={e => setTokenPricing(prev => ({
                                            ...prev,
                                            [item.key]: Math.max(0, parseInt(e.target.value) || 0)
                                        }))}
                                        style={{
                                            width: 54,
                                            padding: "6px 8px",
                                            borderRadius: 10,
                                            border: "1.5px solid rgba(253,230,138,0.5)",
                                            fontSize: 12,
                                            textAlign: "center",
                                            outline: "none",
                                            background: "rgba(255,255,255,0.8)",
                                            fontWeight: 600,
                                            color: "#78350f"
                                        }} />
                                    <span
                                        style={{
                                            fontSize: 10,
                                            color: "#bbb"
                                        }}>Token</span>
                                </div>
                            </div>)}
                            <div
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                    padding: "8px 0"
                                }}>
                                <span
                                    style={{
                                        fontSize: 11,
                                        color: "#666",
                                        fontWeight: 500
                                    }}>💵 单位Token成本</span>
                                <div
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 6
                                    }}>
                                    <input
                                        type="number"
                                        value={tokenCostPer}
                                        step="0.1"
                                        onChange={e => setTokenCostPer(Math.max(0, parseFloat(e.target.value) || 0))}
                                        style={{
                                            width: 64,
                                            padding: "6px 8px",
                                            borderRadius: 10,
                                            border: "1.5px solid rgba(253,230,138,0.5)",
                                            fontSize: 12,
                                            textAlign: "center",
                                            outline: "none",
                                            background: "rgba(255,255,255,0.8)",
                                            fontWeight: 600,
                                            color: "#78350f"
                                        }} />
                                    <span
                                        style={{
                                            fontSize: 10,
                                            color: "#bbb"
                                        }}>元/万Token</span>
                                </div>
                            </div>
                        </div>
                        <div
                            style={{
                                background: "rgba(255,255,255,0.7)",
                                borderRadius: 14,
                                padding: 14,
                                boxShadow: "0 2px 12px rgba(146,64,0,0.04), 0 1px 2px rgba(146,64,0,0.03)",
                                border: "1px solid rgba(255,255,255,0.6)"
                            }}>
                            <div
                                style={{
                                    fontSize: 12,
                                    fontWeight: 700,
                                    color: "#78350f",
                                    marginBottom: 10,
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 6
                                }}>
                                <span
                                    style={{
                                        width: 4,
                                        height: 14,
                                        borderRadius: 2,
                                        background: "#8b5cf6"
                                    }} />👥 用户消耗明细
                                                </div>
                            {tokenUserRecords.map((user, i) => <div
                                key={i}
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                    padding: "8px 0",
                                    borderBottom: i < tokenUserRecords.length - 1 ? "1px solid rgba(0,0,0,0.04)" : "none"
                                }}>
                                <div>
                                    <div
                                        style={{
                                            fontSize: 12,
                                            fontWeight: 600,
                                            color: "#333"
                                        }}>
                                        {user.name}
                                        <span
                                            style={{
                                                marginLeft: 4,
                                                fontSize: 9,
                                                background: "rgba(254,243,199,0.8)",
                                                color: "#b45309",
                                                padding: "1px 5px",
                                                borderRadius: 5,
                                                fontWeight: 600
                                            }}>Lv.{user.level}</span>
                                    </div>
                                    <div
                                        style={{
                                            fontSize: 9,
                                            color: "#bbb",
                                            marginTop: 1
                                        }}>最近活跃：{user.lastActive}</div>
                                </div>
                                <div
                                    style={{
                                        fontSize: 13,
                                        color: "#8b5cf6",
                                        fontWeight: 700
                                    }}>{user.consumed.toLocaleString()} <span
                                        style={{
                                            fontSize: 9,
                                            color: "#bbb",
                                            fontWeight: 400
                                        }}>Token</span></div>
                            </div>)}
                        </div>
                    </div>}
                    {}
                    {adminTab === "weibo" && <WeiboVerifyAdmin />}
                    {adminTab === "admins" && <AdminManagePanel currentUsername={weiboAccount.nickname || loginUsername} />}
                    {adminTab === "invite" && <InviteAdminPanel currentUsername={weiboAccount.nickname || loginUsername} />}
                    {adminTab === "god" && <div>
                        <div
                            style={{
                                background: "rgba(255,255,255,0.7)",
                                borderRadius: 14,
                                padding: 14,
                                boxShadow: "0 2px 12px rgba(146,64,0,0.04), 0 1px 2px rgba(146,64,0,0.03)",
                                border: "1px solid rgba(255,255,255,0.6)",
                                marginBottom: 10
                            }}>
                            <div
                                style={{
                                    fontSize: 12,
                                    fontWeight: 700,
                                    color: "#78350f",
                                    marginBottom: 8,
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 6
                                }}>
                                <span
                                    style={{
                                        width: 4,
                                        height: 14,
                                        borderRadius: 2,
                                        background: "#8b5cf6"
                                    }} />👁️ 全平台数据概览
                                                </div>
                            <div
                                style={{
                                    fontSize: 11,
                                    color: "#666",
                                    lineHeight: 2.2
                                }}>
                                <div>📱 总用户数：<b
                                        style={{
                                            color: "#333"
                                        }}>{totalUsers}</b></div>
                                <div>🔥 今日活跃：<b
                                        style={{
                                            color: "#333"
                                        }}>{todayActive}</b></div>
                                <div>📝 总微博数：<b
                                        style={{
                                            color: "#333"
                                        }}>{weiboData.length}</b></div>
                                <div>💬 总评论数：<b
                                        style={{
                                            color: "#333"
                                        }}>{weiboData.reduce((sum, p) => sum + p.comments.length, 0)}</b></div>
                                <div>💎 累计消耗：<b
                                        style={{
                                            color: "#8b5cf6"
                                        }}>{tokenTotalConsumed.toLocaleString()}Token</b></div>
                                <div>💰 总成本：<b
                                        style={{
                                            color: "#f59e0b"
                                        }}>{totalCost}元</b></div>
                            </div>
                        </div>
                        <div
                            style={{
                                background: "rgba(255,255,255,0.7)",
                                borderRadius: 14,
                                padding: 14,
                                boxShadow: "0 2px 12px rgba(146,64,0,0.04), 0 1px 2px rgba(146,64,0,0.03)",
                                border: "1px solid rgba(255,255,255,0.6)",
                                marginBottom: 10
                            }}>
                            <div
                                style={{
                                    fontSize: 12,
                                    fontWeight: 700,
                                    color: "#78350f",
                                    marginBottom: 8,
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 6
                                }}>
                                <span
                                    style={{
                                        width: 4,
                                        height: 14,
                                        borderRadius: 2,
                                        background: "#ec4899"
                                    }} />💬 CP完整私聊历史
                                                </div>
                            <div
                                style={{
                                    maxHeight: 250,
                                    overflowY: "auto",
                                    background: "rgba(248,245,237,0.8)",
                                    borderRadius: 10,
                                    padding: 10
                                }}>
                                {cpChatMessages.map(msg => <div
                                    key={msg.id}
                                    style={{
                                        display: "flex",
                                        gap: 8,
                                        marginBottom: 8,
                                        alignItems: "flex-start"
                                    }}>
                                    <div
                                        style={{
                                            width: 26,
                                            height: 26,
                                            borderRadius: "50%",
                                            background: msg.from === "A" ? "linear-gradient(135deg, #f59e0b, #fbbf24)" : "linear-gradient(135deg, #ec4899, #f472b6)",
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            fontSize: 12,
                                            flexShrink: 0,
                                            color: "#fff",
                                            fontWeight: 700
                                        }}>
                                        {msg.from === "A" ? "田" : "梓"}
                                    </div>
                                    <div>
                                        <span
                                            style={{
                                                fontSize: 9,
                                                color: "#bbb"
                                            }}>{msg.from === "A" ? "田栩宁" : "梓渝"}</span>
                                        <div
                                            style={{
                                                fontSize: 11,
                                                color: "#333",
                                                lineHeight: 1.5,
                                                background: msg.from === "A" ? "rgba(245,158,11,0.06)" : "rgba(236,72,153,0.06)",
                                                padding: "4px 8px",
                                                borderRadius: 8
                                            }}>{msg.text}</div>
                                    </div>
                                </div>)}
                            </div>
                        </div>
                        <div
                            style={{
                                background: "rgba(255,255,255,0.7)",
                                borderRadius: 14,
                                padding: 14,
                                boxShadow: "0 2px 12px rgba(146,64,0,0.04), 0 1px 2px rgba(146,64,0,0.03)",
                                border: "1px solid rgba(255,255,255,0.6)"
                            }}>
                            <div
                                style={{
                                    fontSize: 12,
                                    fontWeight: 700,
                                    color: "#78350f",
                                    marginBottom: 8,
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 6
                                }}>
                                <span
                                    style={{
                                        width: 4,
                                        height: 14,
                                        borderRadius: 2,
                                        background: "#3b82f6"
                                    }} />👥 用户主页查看
                                                </div>
                            {tokenUserRecords.map((user, i) => <div
                                key={i}
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 10,
                                    padding: "8px 0",
                                    borderBottom: i < tokenUserRecords.length - 1 ? "1px solid rgba(0,0,0,0.04)" : "none"
                                }}>
                                <div
                                    style={{
                                        width: 34,
                                        height: 34,
                                        borderRadius: "50%",
                                        background: "linear-gradient(135deg, rgba(254,243,199,0.8), rgba(253,230,138,0.5))",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        fontSize: 15,
                                        boxShadow: "0 2px 6px rgba(146,64,0,0.08)"
                                    }}>👤</div>
                                <div
                                    style={{
                                        flex: 1
                                    }}>
                                    <div
                                        style={{
                                            fontSize: 12,
                                            fontWeight: 600,
                                            color: "#333"
                                        }}>{user.name}</div>
                                    <div
                                        style={{
                                            fontSize: 9,
                                            color: "#bbb"
                                        }}>Lv.{user.level}· 消耗 {user.consumed.toLocaleString()}Token</div>
                                </div>
                                <button
                                    style={{
                                        fontSize: 10,
                                        padding: "4px 12px",
                                        borderRadius: 8,
                                        background: "rgba(0,0,0,0.04)",
                                        color: "#888",
                                        border: "1px solid rgba(0,0,0,0.06)",
                                        cursor: "pointer",
                                        fontWeight: 500
                                    }}>查看</button>
                            </div>)}
                        </div>
                    </div>}
                </div>
            </div>
        );
    }

    const showInfoPanel = isLoggedIn && !(isAdmin && adminViewMode === "admin");

    const debugBtnStyle: React.CSSProperties = {
        width: "100%",
        padding: "10px",
        borderRadius: 10,
        border: "none",
        fontSize: 13,
        fontWeight: 600,
        cursor: "pointer"
    };

    const smallBtnStyle: React.CSSProperties = {
        padding: "5px 10px",
        borderRadius: 8,
        border: "1px solid rgba(255,255,255,0.15)",
        background: "rgba(255,255,255,0.06)",
        color: "#ccc",
        fontSize: 11,
        cursor: "pointer"
    };

    return (
        <div className="phone-page" style={{ background: WALLPAPER_PRESETS[wallpaper] }}>
            {}
            {showInfoPanel && <div className="info-panel">
                {isAdmin && <div
                    className="info-card"
                    style={{
                        background: "linear-gradient(135deg, #fef3c7, #fde68a)",
                        border: "1px solid #f59e0b"
                    }}>
                    <div
                        style={{
                            fontSize: 11,
                            color: "#92400e",
                            fontWeight: 600,
                            marginBottom: 4
                        }}>🔧 管理员模式</div>
                    <button
                        onClick={() => setAdminViewMode("admin")}
                        style={{
                            width: "100%",
                            padding: "6px",
                            borderRadius: 10,
                            background: "#f59e0b",
                            color: "#fff",
                            border: "none",
                            fontSize: 11,
                            fontWeight: 600,
                            cursor: "pointer"
                        }}>返回管理后台
                                      </button>
                </div>}
                <div className="info-card">
                    <div className="info-card-title">💎 Token</div>
                    <div className="level-row">
                        <span
                            className="level-badge"
                            style={{
                                background: "#8b5cf6"
                            }}>{tokenBalance}</span>
                        <span
                            style={{
                                fontSize: 10,
                                color: "#999"
                            }}>余额</span>
                    </div>
                    <div
                        style={{
                            fontSize: 9,
                            color: "#999",
                            marginTop: 4
                        }}>发图:{tokenPricing.postImage}| 私聊:{tokenPricing.viewPrivateChat}| AI:{tokenPricing.aiChat}</div>
                </div>
                <div className="info-card">
                    <div className="info-card-title">⭐ 等级</div>
                    <div className="level-row">
                        <span className="level-badge">Lv.{userLevel}</span>
                        <span className="chapter-badge">{userLevel >= 50 ? "Ch6 · 身份风暴" : userLevel >= 30 ? "Ch5 · 官宣天下" : userLevel >= 20 ? "Ch4 · 粉圈潜行" : userLevel >= 15 ? "Ch3 · 偷窥真心" : userLevel >= 10 ? "Ch2 · 暗流涌动" : "Ch1 · 地下秘密"}</span>
                    </div>
                    <div className="progress-bar"><div
                            className="progress-fill"
                            style={{
                                width: `${Math.min(userLevel % 10 * 10, 100)}%`
                            }}></div></div>
                    <div className="progress-label">距离 Lv.{userLevel + 1}还需 {100 - userLevel % 10 * 10}经验</div>
                </div>
                <div className="info-card">
                    <div className="info-card-title">💖 亲密度</div>
                    <div className="intimacy-row">
                        <div className="intimacy-item">
                            <span
                                className="intimacy-name"
                                style={{
                                    color: "#f59e0b"
                                }}>👨 爸爸</span>
                            <div className="intimacy-bar"><div
                                    className="intimacy-fill"
                                    style={{
                                        width: "12%",
                                        background: "#f59e0b"
                                    }}></div></div>
                            <span className="intimacy-val">12</span>
                        </div>
                        <div className="intimacy-item">
                            <span
                                className="intimacy-name"
                                style={{
                                    color: "#ec4899"
                                }}>👩 妈咪</span>
                            <div className="intimacy-bar"><div
                                    className="intimacy-fill"
                                    style={{
                                        width: "8%",
                                        background: "#ec4899"
                                    }}></div></div>
                            <span className="intimacy-val">8</span>
                        </div>
                    </div>
                </div>
                <div className="info-card">
                    <div
                        className="info-card-title"
                        style={{
                            fontSize: 13,
                            color: "#999",
                            textAlign: "center"
                        }}>世界书：src/lib/world-book.ts</div>
                </div>
            </div>}
            {}
            {!isLoggedIn && renderLoginScreen()}
            {isLoggedIn && isPageLoading && (
                <div style={{ position: "fixed", inset: 0, background: "linear-gradient(135deg, #e8f5e9 0%, #c8e6c9 100%)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", zIndex: 9999 }}>
                    <div style={{ width: 48, height: 48, border: "4px solid rgba(46,125,50,0.2)", borderTopColor: "#2e7d32", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
                    <div style={{ marginTop: 16, fontSize: 14, color: "#2e5c33", fontWeight: 500 }}>加载中...</div>
                </div>
            )}

            {isLoggedIn && !isPageLoading && !currentApp && (
                <>
                <div className="phone-screen home-screen">
                    <div className="status-bar" />
                    <div className="home-content">
                        <div className="big-clock">
                            <div className="big-time">{time}</div>
                            <div className="big-date">{dateStr}</div>
                        </div>
                        <div className="parent-widgets">
                            <div className="parent-widget">
                                <div className="parent-emoji">👨</div>
                                <div className="parent-info">
                                    <span className="parent-name">爸爸</span>
                                    <span className="parent-status">{parentStatus.dadStatus}</span>
                                </div>
                                <div className="parent-desc-inline">{parentStatus.dadDesc}</div>
                            </div>
                            <div className="parent-widget">
                                <div className="parent-emoji">👩</div>
                                <div className="parent-info">
                                    <span className="parent-name">妈妈</span>
                                    <span className="parent-status">{parentStatus.momStatus}</span>
                                </div>
                                <div className="parent-desc-inline">{parentStatus.momDesc}</div>
                            </div>
                        </div>
                        {isEditing && (
                            <div id="editModeBar">
                                <button
                                    className="edit-dock-btn"
                                    disabled={!selectedAppId}
                                    onClick={() => selectedAppId && addToDock(selectedAppId)}
                                >
                                    {isDockReplacing ? "点击Dock图标替换" : "添加到Dock"}
                                </button>
                                <button className="edit-done-btn" onClick={exitEditMode}>完成</button>
                            </div>
                        )}
                        <div
                            className="home-slider"
                            onTouchStart={handleTouchStart}
                            onTouchMove={handleTouchMove}
                            onTouchEnd={handleTouchEnd}
                            onMouseDown={handleMouseDown}
                        >
                            <div
                                ref={sliderRef}
                                className={`home-slider-track ${isEditing ? "edit-mode" : ""}`}
                                style={{ transform: `translateX(${-currentPage * 100}%)`, transition: "transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)" }}
                            >
                                <div className="home-page">
                                    <div className="app-page-grid page-one">
                                        {homeAppIds.map((appId, idx) => {
                                            const app = FIRST_PAGE_APPS.find(a => a.id === appId);
                                            if (!app)
                                                return null;
                                            return renderAppIcon(app, false, idx);
                                        })}
                                    </div>
                                </div>
                                <div className="home-page">
                                    <div className="app-page-grid page-two">
                                        {SECOND_PAGE_APPS.map((app, idx) => renderAppIcon(app, false, idx))}
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="page-indicator">
                            <span className={currentPage === 0 ? "active" : ""} />
                            <span className={currentPage === 1 ? "active" : ""} />
                        </div>
                    </div>
                    <div className="dock">
                        {dockAppIds.map((appId, idx) => {
                            const app = getAppById(appId);
                            if (!app) return null;
                            return (
                                <div
                                    key={appId}
                                    className={`dock-icon ${isDockReplacing && isEditing ? "replacing" : ""}`}
                                    onClick={() => {
                                        if (isEditing && isDockReplacing && selectedAppId) {
                                            const newDock = [...dockAppIds];
                                            newDock[idx] = selectedAppId;
                                            setDockAppIds(newDock);
                                            localStorage.setItem("phone_dock_apps_v1", JSON.stringify(newDock));
                                            setIsDockReplacing(false);
                                            setSelectedAppId(null);
                                        } else {
                                            openApp(appId);
                                        }
                                    }}
                                >
                                    <span>{app.emoji}</span>
                                    <span className="dock-label">{getAppLabel(appId, true)}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </>
            )}

            {isLoggedIn && !isPageLoading && currentApp && (
                <div className={`app-layer ${appClosing ? "closing" : ""}`}>
                    <div className="app-content">
                        {renderAppContent()}
                    </div>
                    {renderExternalAppCache()}
                </div>
            )}
            {defaultPasswordTip && (
                <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10000, padding: 24 }}>
                    <div style={{ background: "rgba(255,255,255,0.95)", backdropFilter: "blur(20px)", borderRadius: 20, padding: 24, maxWidth: 320, width: "100%", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
                        <div style={{ fontSize: 18, fontWeight: 700, color: "#2e5c33", marginBottom: 12, textAlign: "center" }}>🔒 建议修改默认密码</div>
                        <div style={{ fontSize: 13, color: "#4a7c50", lineHeight: 1.6, marginBottom: 20, textAlign: "center" }}>
                            你当前使用的是默认密码，为了账户安全，建议立即前往「我的 → 账户设置」修改密码。
                        </div>
                        <div style={{ display: "flex", gap: 10 }}>
                            <button
                                onClick={() => setDefaultPasswordTip(false)}
                                style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: "none", background: "#e5e7eb", color: "#3d5c45", fontWeight: 600, fontSize: 13 }}>
                                稍后
                            </button>
                            <button
                                onClick={() => {
                                    setDefaultPasswordTip(false);
                                    setCurrentApp("me");
                                    setMeSubPage("account");
                                }}
                                style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: "none", background: "#2e7d32", color: "#fff", fontWeight: 600, fontSize: 13 }}>
                                去修改
                            </button>
                        </div>
                    </div>
                </div>
            )}
            <div className={`phone-toast ${toast.show ? "show" : ""}`}>{toast.message}</div>

            {isLoggedIn && (
                <>
                    <div
                        ref={knobRef}
                        onPointerDown={handleKnobPointerDown}
                        onPointerMove={handleKnobPointerMove}
                        onPointerUp={handleKnobPointerUp}
                        onClick={handleKnobClick}
                        style={{
                            position: "absolute",
                            right: knobPos.x === 0 ? 16 : undefined,
                            bottom: knobPos.y === 0 ? 80 : undefined,
                            transform: `translate(${knobPos.x === 0 ? 0 : -knobPos.x}px, ${knobPos.y === 0 ? 0 : -knobPos.y}px)`,
                            left: knobPos.x !== 0 ? `calc(100% - ${48 + knobPos.x}px)` : undefined,
                            top: knobPos.y !== 0 ? `calc(100% - ${48 + knobPos.y}px)` : undefined,
                            width: 48,
                            height: 48,
                            borderRadius: "50%",
                            background: "rgba(255,255,255,0.85)",
                            backdropFilter: "blur(12px)",
                            boxShadow: "0 4px 20px rgba(46,92,51,0.18), inset 0 0 0 1px rgba(255,255,255,0.6)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            zIndex: 99999,
                            cursor: knobDragging ? "grabbing" : "grab",
                            userSelect: "none",
                            touchAction: "none",
                            fontSize: 22,
                        }}
                    >
                        {KNOB_STYLES.find((s) => s.id === knobStyle)?.icon}
                    </div>
                    {showKnobMenu && (
                        <div
                            style={{
                                position: "absolute",
                                right: knobPos.x === 0 ? 20 : undefined,
                                bottom: knobPos.y === 0 ? 140 : undefined,
                                left: knobPos.x !== 0 ? `calc(100% - ${44 + knobPos.x}px)` : undefined,
                                top: knobPos.y !== 0 ? `calc(100% - ${108 + knobPos.y}px)` : undefined,
                                background: "rgba(255,255,255,0.95)",
                                backdropFilter: "blur(16px)",
                                borderRadius: 16,
                                padding: "8px 0",
                                boxShadow: "0 10px 40px rgba(46,92,51,0.2)",
                                zIndex: 100000,
                                minWidth: 140,
                            }}
                        >
                            {currentApp && (
                                <button
                                    onClick={handleKnobBack}
                                    style={{
                                        display: "block",
                                        width: "100%",
                                        padding: "12px 18px",
                                        border: "none",
                                        background: "transparent",
                                        textAlign: "left",
                                        fontSize: 14,
                                        color: "#2e5c33",
                                        fontWeight: 500,
                                        cursor: "pointer",
                                    }}
                                >
                                    ↩ 返回上一级
                                </button>
                            )}
                            <button
                                onClick={handleKnobHome}
                                style={{
                                    display: "block",
                                    width: "100%",
                                    padding: "12px 18px",
                                    border: "none",
                                    background: "transparent",
                                    textAlign: "left",
                                    fontSize: 14,
                                    color: "#2e5c33",
                                    fontWeight: 500,
                                    cursor: "pointer",
                                }}
                            >
                                ⌂ 回主界面
                            </button>
                        </div>
                    )}
                </>
            )}
            {showNewAdmin && authToken && (
                <AdminDashboard
                    token={authToken}
                    username={loginUsername}
                    onClose={() => setShowNewAdmin(false)}
                />
            )}
        </div>
    );
}
