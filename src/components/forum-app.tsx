"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import UserProfileApp from "./user-profile-app";

// ============ 类型定义 ============
interface ForumPost {
    id: string;
    title: string;
    content: string;
    author: string;
    authorAvatar: string;
    avatarUrl?: string;
    authorId?: string;
    section: string;
    replyCount: number;
    viewCount: number;
    createdAt: string;
    lastReplyAt: string;
    status: "normal" | "pending" | "deleted" | "hidden";
    isEssence: boolean;
    isPinned: boolean;
    isLocked: boolean;
    replies: ForumReply[];
    likes: number;
    favorites: number;
    bugStatus?: "pending" | "fixed" | "wontfix";
}

interface ForumReply {
    id: string;
    postId: string;
    content: string;
    author: string;
    authorAvatar: string;
    avatarUrl?: string;
    authorId?: string;
    createdAt: string;
    isPinned: boolean;
    isDeleted: boolean;
    subReplies: ForumSubReply[];
}

interface ForumSubReply {
    id: string;
    replyId: string;
    content: string;
    author: string;
    authorAvatar: string;
    avatarUrl?: string;
    authorId?: string;
    createdAt: string;
    replyTo: string;
}

interface ForumSection {
    id: string;
    icon: string;
    name: string;
    desc: string;
    postCount?: number;
}

// ============ localStorage 数据持久化 ============
function loadCustomSections(): ForumSection[] {
    if (typeof window === "undefined") return [];
    try {
        const raw = localStorage.getItem("forum_custom_sections");
        if (raw) return JSON.parse(raw) as ForumSection[];
    } catch {}
    return [];
}

function saveCustomSections(sections: ForumSection[]) {
    if (typeof window === "undefined") return;
    localStorage.setItem("forum_custom_sections", JSON.stringify(sections));
}

function loadCoins(username: string): number {
    if (typeof window === "undefined") return 1000;
    try {
        const raw = localStorage.getItem(`mimi_coins_${username}`);
        return raw ? Number(raw) : 1000;
    } catch {
        return 1000;
    }
}

function saveCoins(username: string, amount: number) {
    if (typeof window === "undefined") return;
    localStorage.setItem(`mimi_coins_${username}`, String(Math.max(0, amount)));
}

function transferCoins(from: string, to: string, amount: number): boolean {
    if (!from || !to || from === to || amount <= 0) return false;
    const fromBalance = loadCoins(from);
    if (fromBalance < amount) return false;
    saveCoins(from, fromBalance - amount);
    saveCoins(to, loadCoins(to) + amount);
    return true;
}

// ============ API 数据层 ============
interface ApiPost {
    id: string;
    title: string;
    content: string;
    section: string;
    author_id: string;
    author_name: string;
    category?: string;
    tags?: string[];
    is_pinned: boolean;
    is_essence: boolean;
    bug_status?: "pending" | "fixed" | "wontfix";
    deleted_at?: string;
    created_at: string;
    updated_at: string;
    last_reply_at?: string;
    replyCount?: number;
    likes?: number;
    favorites?: number;
    // list 下是 count 聚合 [{count}]；detail 下是回复行数组 ApiReply[]
    forum_replies?: { count: number }[] | ApiReply[];
    forum_likes?: { count: number }[] | { user_id: string }[];
    forum_favorites?: { count: number }[];
    forum_replies_detail?: ApiReply[];
}

interface ApiReply {
    id: string;
    post_id: string;
    author_id: string;
    author_name: string;
    content: string;
    is_admin: boolean;
    parent_reply_id?: string;
    created_at: string;
}

function getAuthToken(): string | null {
    if (typeof window === "undefined") return null;
    try {
        return localStorage.getItem("auth_token");
    } catch {
        return null;
    }
}

function formatTime(iso: string): string {
    if (!iso) return "";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return iso;
    return date.toLocaleString("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    });
}

// 头像：真实上传图优先，无图时用 emoji 占位；可点击进主页
function Avatar({ url, fallback, size = 36, onClick, ring }: {
    url?: string; fallback: string; size?: number; onClick?: () => void; ring?: boolean;
}) {
    const hasUrl = !!url;
    return (
        <div
            onClick={onClick}
            style={{
                width: size, height: size, borderRadius: "50%",
                overflow: "hidden", flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: hasUrl ? "#fff" : "linear-gradient(135deg,#fde68a,#fca5a5)",
                fontSize: size * 0.5,
                cursor: onClick ? "pointer" : "default",
                border: ring ? "2px solid rgba(255,255,255,0.8)" : "none",
                boxShadow: "0 1px 4px rgba(0,0,0,0.08)"
            }}>
            {hasUrl
                ? <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                : <span>{fallback}</span>}
        </div>
    );
}

function mapApiReplyToReply(r: ApiReply): ForumReply {
    return {
        id: r.id,
        postId: r.post_id,
        content: r.content,
        author: r.author_name,
        authorAvatar: r.is_admin ? "👑" : "🌽",
        avatarUrl: (r as any).author_avatar || "",
        authorId: r.author_id,
        createdAt: formatTime(r.created_at),
        isPinned: false,
        isDeleted: false,
        subReplies: [],
    };
}

function mapApiPostToPost(p: ApiPost): ForumPost {
    // detail 后端返回 forum_replies 回复行数组（并额外给了 forum_replies_detail）；list 下 forum_replies 是 count 聚合。
    // 三种形态都兼容，避免字段名对不上导致评论全空。
    const rawReplies: unknown = p.forum_replies_detail ?? p.forum_replies;
    const topReplies: ApiReply[] = Array.isArray(rawReplies)
        ? (rawReplies as unknown[]).filter(
            (r): r is ApiReply => typeof r === "object" && r !== null && "author_name" in r
        )
        : [];
    const parentReplies = topReplies.filter((r) => !r.parent_reply_id).map(mapApiReplyToReply);
    const subReplies = topReplies.filter((r) => r.parent_reply_id);
    parentReplies.forEach((r) => {
        r.subReplies = subReplies
            .filter((sr) => sr.parent_reply_id === r.id)
            .map((sr) => ({
                id: sr.id,
                replyId: r.id,
                content: sr.content,
                author: sr.author_name,
                authorAvatar: sr.is_admin ? "👑" : "",
                avatarUrl: (sr as any).author_avatar || "",
                authorId: sr.author_id,
                createdAt: formatTime(sr.created_at),
                replyTo: r.author,
            }));
    });
    // 关联表 count 聚合优先（真实值）；冗余数字列只作旧数据兜底
    const readCount = (
        nested: unknown,
        fallback: number | null | undefined
    ): number => {
        if (Array.isArray(nested)) {
            if (nested.length > 0 && typeof nested[0] === "object" && nested[0] !== null && "count" in nested[0]) {
                return Number((nested[0] as { count: number }).count) || 0;
            }
            if (nested.length === 0) return 0;
        }
        return typeof fallback === "number" ? fallback : 0;
    };
    const likeCount = readCount(p.forum_likes, p.likes);
    const favCount = readCount(p.forum_favorites, p.favorites);
    // 回复数：list 下 forum_replies 是 [{count}] 聚合；detail 下是行数组（用长度）；后端显式 replyCount 兜底
    let replyCount: number;
    if (
        Array.isArray(p.forum_replies) &&
        p.forum_replies.length > 0 &&
        typeof p.forum_replies[0] === "object" &&
        p.forum_replies[0] !== null &&
        "count" in p.forum_replies[0]
    ) {
        replyCount = Number((p.forum_replies[0] as { count: number }).count) || 0;
    } else {
        replyCount = topReplies.length;
    }
    return {
        id: p.id,
        title: p.title,
        content: p.content,
        author: p.author_name,
        authorAvatar: p.author_name === "官方通知" || p.section === "announce" ? "📢" : "🌽",
        avatarUrl: (p as any).author_avatar || "",
        authorId: p.author_id,
        section: p.section,
        replyCount,
        viewCount: 0,
        createdAt: formatTime(p.created_at),
        lastReplyAt: formatTime(p.updated_at),
        status: p.deleted_at ? "deleted" : "normal",
        isEssence: p.is_essence,
        isPinned: p.is_pinned,
        isLocked: false,
        replies: parentReplies,
        likes: likeCount,
        favorites: favCount,
        bugStatus: p.bug_status,
    };
}

async function forumApi(action: string, payload: Record<string, unknown> = {}) {
    const token = getAuthToken();
    const res = await fetch("/api/forum", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, authToken: token, ...payload }),
    });
    return res.json() as Promise<{ success: boolean; data?: unknown; error?: string }>;
}

async function fetchForumPosts(section?: string, search?: string): Promise<ForumPost[]> {
    const res = await forumApi("list", { section: section || "all", search });
    if (!res.success || !Array.isArray(res.data)) return [];
    return (res.data as ApiPost[]).map(mapApiPostToPost);
}

async function fetchForumPostDetail(postId: string): Promise<ForumPost | null> {
    const res = await forumApi("detail", { postId });
    if (!res.success || !res.data) return null;
    return mapApiPostToPost(res.data as ApiPost);
}

// ============ 板块定义 ============
const BUILTIN_SECTIONS: ForumSection[] = [
    { id: "creative", icon: "🎨", name: "同人创作", desc: "文字描述、创作讨论" },
    { id: "cp", icon: "💬", name: "CP讨论", desc: "日常嗑糖、剧情讨论" },
    { id: "fanfic", icon: "", name: "同人文", desc: "粉丝创作的故事" },
    { id: "event", icon: "🏆", name: "活动专区", desc: "比赛投票" },
    { id: "announce", icon: "📢", name: "公告板", desc: "仅管理员可发帖" },
    { id: "bug-report", icon: "🐛", name: "Bug反馈", desc: "提交bug与功能建议" }
];


// ============ 论坛组件 ============
interface ForumAppProps {
    onClose?: () => void;
    isAdmin?: boolean;
    loginUsername?: string;
    onViewUserProfile?: (username: string) => void;
    initialPostId?: string | null;
    onConsumeInitialPost?: () => void;
}

export function ForumApp({ onClose, isAdmin = false, loginUsername = "", onViewUserProfile, initialPostId = null, onConsumeInitialPost }: ForumAppProps = {}) {
    const [view, setView] = useState<"sections" | "posts" | "postDetail" | "newPost" | "search" | "notifications" | "messages" | "me">("sections");
    const [mainTab, setMainTab] = useState<"home" | "messages" | "me">("home");
    const [followingPosts, setFollowingPosts] = useState<ForumPost[]>([]);
    const [followingLoaded, setFollowingLoaded] = useState(false);
    const [followingLoading, setFollowingLoading] = useState(false);
    const [profileChain, setProfileChain] = useState<string[]>([]);

    const [currentSection, setCurrentSection] = useState<string | null>(null);
    const [currentPost, setCurrentPost] = useState<ForumPost | null>(null);
    const [posts, setPosts] = useState<ForumPost[]>([]);
    const [sortBy, setSortBy] = useState<"latest" | "hot" | "essence">("latest");
    const [isLoading, setIsLoading] = useState(false);
    const [apiError, setApiError] = useState<string | null>(null);
    const [isOffline, setIsOffline] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [searchType, setSearchType] = useState<"post" | "user">("post");
    const [searchFilter, setSearchFilter] = useState<{ section: string; time: string; essenceOnly: boolean }>({
        section: "all",
        time: "all",
        essenceOnly: false
    });

    // 发帖表单
    const [newPostSection, setNewPostSection] = useState("");
    const [newPostTitle, setNewPostTitle] = useState("");
    const [newPostContent, setNewPostContent] = useState("");

    // 回复表单
    const [replyContent, setReplyContent] = useState("");
    const [replyToReplyId, setReplyToReplyId] = useState<string | null>(null);
    const [replyToAuthor, setReplyToAuthor] = useState("");

    // 举报表单
    const [reportPostId, setReportPostId] = useState<string | null>(null);
    const [reportType, setReportType] = useState("");
    const [reportDesc, setReportDesc] = useState("");

    // 用户点赞/收藏记录
    const userKey = loginUsername || "guest";
    const [likedPostIds, setLikedPostIds] = useState<string[]>(() => {
        if (typeof window === "undefined") return [];
        try {
            const raw = localStorage.getItem(`forum_likes_${userKey}`);
            return raw ? JSON.parse(raw) : [];
        } catch {
            return [];
        }
    });
    const [favoritedPostIds, setFavoritedPostIds] = useState<string[]>(() => {
        if (typeof window === "undefined") return [];
        try {
            const raw = localStorage.getItem(`forum_favorites_${userKey}`);
            return raw ? JSON.parse(raw) : [];
        } catch {
            return [];
        }
    });

    // 新 Bug 状态（管理员回复时可更新）
    const [newBugStatus, setNewBugStatus] = useState<"pending" | "fixed" | "wontfix">("pending");

    // 板块列表（支持管理员创建自定义板块）
    const [customSections, setCustomSections] = useState<ForumSection[]>(() => loadCustomSections());
    const sections = useMemo(() => [...BUILTIN_SECTIONS, ...customSections], [customSections]);
    const [showSectionForm, setShowSectionForm] = useState(false);
    const [newSectionName, setNewSectionName] = useState("");
    const [newSectionDesc, setNewSectionDesc] = useState("");
    const [newSectionIcon, setNewSectionIcon] = useState("📁");

    // 打赏/奖励输入
    const [showRewardForm, setShowRewardForm] = useState(false);
    const [rewardAmount, setRewardAmount] = useState("");
    const [rewardMessage, setRewardMessage] = useState("");

    // 发布官方通知（仅admin）
    const handlePublishNotice = async () => {
        const title = newNoticeTitle.trim();
        const content = newNoticeContent.trim();
        if (!title || !content) {
            setApiError("请先填写公告标题和内容");
            return;
        }
        const token = getAuthToken();
        if (!token) {
            alert("请先登录");
            return;
        }
        setIsLoading(true);
        setApiError(null);
        try {
            const res = await forumApi("create", {
                title: `【官方公告】${title}`,
                content,
                section: "announce"
            });
            if (!res.success) {
                setApiError(res.error || "发布公告失败");
                return;
            }
            const fresh = await fetchForumPostDetail((res.data as { id: string }).id);
            if (fresh) {
                setPosts(prev => [fresh, ...prev.filter(p => p.id !== fresh.id)]);
            }
            setNewNoticeTitle("");
            setNewNoticeContent("");
            setShowNoticeForm(false);
            setApiError(null);
        } catch (err) {
            setApiError(err instanceof Error ? err.message : "发布公告失败，请检查网络后重试");
        } finally {
            setIsLoading(false);
        }
    };

    // 通知相关状态
    const [newNoticeTitle, setNewNoticeTitle] = useState("");
    const [newNoticeContent, setNewNoticeContent] = useState("");
    const [showNoticeForm, setShowNoticeForm] = useState(false);

    // 创建板块（仅管理员）
    const handleCreateSection = () => {
        const name = newSectionName.trim();
        const desc = newSectionDesc.trim();
        if (!name) return;
        const id = `custom_${Date.now()}`;
        const section: ForumSection = {
            id,
            icon: newSectionIcon || "📁",
            name,
            desc: desc || "社区板块"
        };
        setCustomSections(prev => [...prev, section]);
        setNewSectionName("");
        setNewSectionDesc("");
        setNewSectionIcon("📁");
        setShowSectionForm(false);
    };

    // 管理员加精/取消加精
    const toggleEssence = async (postId: string) => {
        if (!isAdmin) return;
        const post = posts.find(p => p.id === postId);
        if (!post) return;
        try {
            const res = await forumApi("admin_essence", { postId, value: !post.isEssence });
            if (!res.success) {
                setApiError(res.error || "加精失败");
                return;
            }
            const fresh = await fetchForumPostDetail(postId);
            if (fresh) {
                setPosts(prev => prev.map(p => p.id === fresh.id ? fresh : p));
                if (currentPost?.id === fresh.id) setCurrentPost(fresh);
            }
            setApiError(null);
        } catch (err) {
            setApiError(err instanceof Error ? err.message : "加精失败");
        }
    };

    // 打赏作者米米币
    const handleReward = () => {
        if (!currentPost) return;
        const amount = Number(rewardAmount);
        if (!amount || amount <= 0) {
            setRewardMessage("请输入有效金额");
            return;
        }
        const from = loginUsername || "guest";
        const to = currentPost.author;
        if (from === to) {
            setRewardMessage("不能打赏自己");
            return;
        }
        if (transferCoins(from, to, amount)) {
            setRewardMessage(`打赏成功，已转给作者 ${amount} 米米币`);
        } else {
            setRewardMessage("米米币不足");
            return;
        }
        setTimeout(() => {
            setShowRewardForm(false);
            setRewardAmount("");
            setRewardMessage("");
        }, 1200);
    };

    // 获取板块信息
    const getSection = (id: string) => sections.find(s => s.id === id);

    // 过滤和排序帖子
    const getFilteredPosts = () => {
        let filtered = posts.filter(p => p.status === "normal");

        // 按板块过滤
        if (currentSection) {
            filtered = filtered.filter(p => p.section === currentSection);
        }

        // 排序
        const pinned = filtered.filter(p => p.isPinned);
        const unpinned = filtered.filter(p => !p.isPinned);

        let sorted = unpinned;
        switch (sortBy) {
            case "latest":
                sorted = [...unpinned].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
                break;
            case "hot":
                sorted = [...unpinned].sort((a, b) => (b.likes + b.viewCount) - (a.likes + a.viewCount));
                break;
            case "essence":
                sorted = [...unpinned].filter(p => p.isEssence).sort((a, b) => (b.likes + b.viewCount) - (a.likes + a.viewCount));
                break;
        }

        return [...pinned, ...sorted];
    };

    // 搜索
    const getSearchResults = () => {
        let results = posts.filter(p => p.status === "normal");

        if (searchType === "post") {
            results = results.filter(p =>
                p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                p.content.toLowerCase().includes(searchQuery.toLowerCase())
            );
        } else {
            results = results.filter(p =>
                p.author.toLowerCase().includes(searchQuery.toLowerCase())
            );
        }

        if (searchFilter.section !== "all") {
            results = results.filter(p => p.section === searchFilter.section);
        }

        if (searchFilter.essenceOnly) {
            results = results.filter(p => p.isEssence);
        }

        return results;
    };

    // 持久化帖子数据
    useEffect(() => {
        try {
            localStorage.setItem("forum_posts", JSON.stringify(posts));
        } catch {}
    }, [posts]);

    // 从云端加载帖子（缓存优先）
    useEffect(() => {
        let cancelled = false;
        async function loadFromCloud() {
            setIsLoading(true);
            setApiError(null);
            try {
                const data = await fetchForumPosts();
                if (!cancelled) {
                    setPosts(data);
                    setIsOffline(false);
                }
            } catch (err) {
                if (!cancelled) {
                    setApiError(err instanceof Error ? err.message : "加载失败，显示本地缓存");
                    setIsOffline(true);
                }
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        }
        loadFromCloud();
        return () => { cancelled = true; };
    }, []);

    // 进入 Bug 帖子详情时同步状态选择器
    useEffect(() => {
        if (currentPost?.section === "bug-report") {
            setNewBugStatus(currentPost.bugStatus || "pending");
        }
    }, [currentPost]);

    useEffect(() => {
        try {
            saveCustomSections(customSections);
        } catch {}
    }, [customSections]);

    // ========== 通知状态 ==========
    const [unreadCount, setUnreadCount] = useState(0);
    const [notifications, setNotifications] = useState<any[]>([]);
    const [notifLoading, setNotifLoading] = useState(false);
    const [notifFilter, setNotifFilter] = useState<"all" | "like" | "comment">("all");
    const [detailReturnView, setDetailReturnView] = useState<"sections" | "posts" | "notifications" | "me">("sections");

    const refreshUnread = useCallback(async () => {
        if (!getAuthToken()) return;
        try {
            const res = await forumApi("unread_count");
            if (res.success) setUnreadCount((res.data as any)?.count || 0);
        } catch {}
    }, []);

    useEffect(() => {
        refreshUnread();
        const t = setInterval(refreshUnread, 30000);
        return () => clearInterval(t);
    }, [refreshUnread]);

    // 从主页/外部带帖子 ID 进入时，直接打开该帖详情
    useEffect(() => {
        if (initialPostId) {
            const id = initialPostId;
            onConsumeInitialPost?.();
            openPostDetailFromId(id, "sections");
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialPostId]);

    const openNotifications = async (viewMode: "messages" | "notifications" = "notifications") => {
        setNotifLoading(true);
        setView(viewMode);
        try {
            const res = await forumApi("notifications");
            if (res.success) setNotifications((res.data as any[]) || []);
        } finally {
            setNotifLoading(false);
        }
    };

    const loadFollowing = async () => {
        if (!getAuthToken()) {
            setFollowingPosts([]);
            setFollowingLoaded(true);
            return;
        }
        setFollowingLoading(true);
        try {
            const res = await forumApi("list", { feed: "following" });
            if (res.success && Array.isArray(res.data)) {
                setFollowingPosts((res.data as ApiPost[]).map(mapApiPostToPost));
            }
            setFollowingLoaded(true);
        } finally {
            setFollowingLoading(false);
        }
    };

    const goMainTab = (tab: "home" | "messages" | "me") => {
        setMainTab(tab);
        if (tab === "home") {
            setView("sections");
        } else if (tab === "messages") {
            if (notifications.length === 0) openNotifications("messages");
            else setView("messages");
        } else {
            setProfileChain([loginUsername]);
            setView("me");
        }
    };

    const viewUserByName = (username: string) => {
        setProfileChain(prev => [...prev, username]);
        setView("me");
    };

    const closeProfile = () => {
        setProfileChain(prev => {
            const next = prev.slice(0, -1);
            return next.length === 0 ? [loginUsername] : next;
        });
    };

    // 从通知/主页打开某帖详情
    const openPostDetailFromId = async (postId: string, returnTo: "sections" | "posts" | "notifications" | "me") => {
        setDetailReturnView(returnTo);
        const fresh = await fetchForumPostDetail(postId);
        if (fresh) {
            setCurrentPost(fresh);
            setView("postDetail");
            refreshUnread();
        } else {
            alert("帖子不存在或已被删除");
        }
    };

    const incrementViewCount = useCallback((postId: string): ForumPost | undefined => {
        let updated: ForumPost | undefined;
        setPosts(prev => prev.map(p => {
            if (p.id !== postId) return p;
            updated = { ...p, viewCount: p.viewCount + 1 };
            return updated;
        }));
        return updated;
    }, []);

    const toggleLike = useCallback(async (postId: string) => {
        const token = getAuthToken();
        if (!token) {
            alert("请先登录");
            return;
        }
        const liked = likedPostIds.includes(postId);
        setLikedPostIds(prev => liked ? prev.filter(id => id !== postId) : [...prev, postId]);
        setPosts(prev => prev.map(p => {
            if (p.id !== postId) return p;
            return { ...p, likes: Math.max(0, p.likes + (liked ? -1 : 1)) };
        }));
        try {
            const res = await forumApi("like", { postId });
            if (!res.success) {
                setApiError(res.error || "点赞失败");
                return;
            }
            const fresh = await fetchForumPostDetail(postId);
            if (fresh) {
                setPosts(prev => prev.map(p => p.id === fresh.id ? fresh : p));
                if (currentPost?.id === fresh.id) setCurrentPost(fresh);
            }
            setApiError(null);
        } catch (err) {
            setApiError(err instanceof Error ? err.message : "点赞失败");
        }
    }, [likedPostIds, currentPost]);

    const toggleFavorite = useCallback(async (postId: string) => {
        const token = getAuthToken();
        if (!token) {
            alert("请先登录");
            return;
        }
        const favorited = favoritedPostIds.includes(postId);
        setFavoritedPostIds(prev => favorited ? prev.filter(id => id !== postId) : [...prev, postId]);
        setPosts(prev => prev.map(p => {
            if (p.id !== postId) return p;
            return { ...p, favorites: Math.max(0, p.favorites + (favorited ? -1 : 1)) };
        }));
        try {
            const res = await forumApi("favorite", { postId });
            if (!res.success) {
                setApiError(res.error || "收藏失败");
                return;
            }
            const fresh = await fetchForumPostDetail(postId);
            if (fresh) {
                setPosts(prev => prev.map(p => p.id === fresh.id ? fresh : p));
                if (currentPost?.id === fresh.id) setCurrentPost(fresh);
            }
            setApiError(null);
        } catch (err) {
            setApiError(err instanceof Error ? err.message : "收藏失败");
        }
    }, [favoritedPostIds, currentPost]);

    // 发帖
    const handleCreatePost = useCallback(async () => {
        if (!newPostTitle.trim() || !newPostContent.trim() || !newPostSection) {
            setApiError("请选择板块并填写标题和内容");
            return;
        }
        if (newPostSection === "announce" && !isAdmin) {
            setApiError("只有管理员能在公告板发帖");
            return;
        }
        const token = getAuthToken();
        if (!token) {
            alert("请先登录");
            return;
        }

        setIsLoading(true);
        setApiError(null);
        try {
            const res = await forumApi("create", {
                title: newPostTitle.trim(),
                content: newPostContent.trim(),
                section: newPostSection
            });
            if (!res.success) {
                setApiError(res.error || "发帖失败");
                return;
            }
            const fresh = await fetchForumPostDetail((res.data as { id: string }).id);
            if (fresh) {
                setPosts(prev => [fresh, ...prev.filter(p => p.id !== fresh.id)]);
            }
            setNewPostTitle("");
            setNewPostContent("");
            setNewPostSection("");
            setView("posts");
            setCurrentSection(newPostSection);
            setApiError(null);
        } catch (err) {
            setApiError(err instanceof Error ? err.message : "发帖失败");
        } finally {
            setIsLoading(false);
        }
    }, [newPostTitle, newPostContent, newPostSection, isAdmin]);

    // 回复
    const handleReply = useCallback(async () => {
        if (!replyContent.trim() || !currentPost) return;
        const token = getAuthToken();
        if (!token) {
            alert("请先登录");
            return;
        }

        setIsLoading(true);
        try {
            const shouldUpdateBugStatus = isAdmin && currentPost.section === "bug-report" && newBugStatus !== currentPost.bugStatus;
            const res = await forumApi("reply", {
                postId: currentPost.id,
                content: replyContent.trim()
            });
            if (!res.success) {
                setApiError(res.error || "回复失败");
                return;
            }
            if (shouldUpdateBugStatus) {
                const bugRes = await forumApi("admin_update_bug_status", { postId: currentPost.id, value: newBugStatus });
                if (!bugRes.success) {
                    setApiError(bugRes.error || "更新Bug状态失败");
                    return;
                }
            }
            const fresh = await fetchForumPostDetail(currentPost.id);
            if (fresh) {
                setPosts(prev => prev.map(p => p.id === fresh.id ? fresh : p));
                setCurrentPost(fresh);
            }
            setReplyContent("");
            setReplyToReplyId(null);
            setReplyToAuthor("");
            setApiError(null);
        } catch (err) {
            setApiError(err instanceof Error ? err.message : "回复失败");
        } finally {
            setIsLoading(false);
        }
    }, [replyContent, currentPost, isAdmin, newBugStatus]);

    // 楼中楼回复
    const handleSubReply = (replyId: string, replyToAuthor: string) => {
        setReplyToReplyId(replyId);
        setReplyToAuthor(replyToAuthor);
    };

    // 提交楼中楼回复（真实入库，parentReplyId 挂到对应父回复）
    const handleSubmitSubReply = useCallback(async () => {
        if (!currentPost || !replyToReplyId) return;
        const content = replyContent.trim();
        if (!content) {
            setApiError("回复内容不能为空");
            return;
        }
        const token = typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;
        if (!token) {
            alert("请先登录");
            return;
        }
        setApiError(null);
        setIsLoading(true);
        try {
            const res = await forumApi("reply", {
                postId: currentPost.id,
                content,
                parentReplyId: replyToReplyId,
            });
            if (!res.success) {
                setApiError(res.error || "回复失败");
                return;
            }
            const fresh = await fetchForumPostDetail(currentPost.id);
            if (fresh) {
                setPosts(prev => prev.map(p => p.id === fresh.id ? fresh : p));
                setCurrentPost(fresh);
            }
            setReplyContent("");
            setReplyToReplyId(null);
            setReplyToAuthor("");
        } catch (err) {
            setApiError(err instanceof Error ? err.message : "回复失败，请检查网络后重试");
        } finally {
            setIsLoading(false);
        }
    }, [replyContent, currentPost, replyToReplyId]);

    // 删除评论（楼主）
    const handleDeleteReply = (replyId: string) => {
        if (!currentPost) return;

        const updatedPosts = posts.map(p => {
            if (p.id === currentPost.id) {
                return {
                    ...p,
                    replies: p.replies.map(r => {
                        if (r.id === replyId) {
                            return { ...r, isDeleted: true };
                        }
                        return r;
                    }),
                    replyCount: Math.max(0, p.replyCount - 1)
                };
            }
            return p;
        });

        setPosts(updatedPosts);
        setCurrentPost(updatedPosts.find(p => p.id === currentPost.id) || null);
    };

    // 置顶回复（楼主）
    const handlePinReply = (replyId: string) => {
        if (!currentPost) return;

        const updatedPosts = posts.map(p => {
            if (p.id === currentPost.id) {
                return {
                    ...p,
                    replies: p.replies.map(r => {
                        if (r.id === replyId) {
                            return { ...r, isPinned: !r.isPinned };
                        }
                        return { ...r, isPinned: false }; // 取消其他置顶
                    })
                };
            }
            return p;
        });

        setPosts(updatedPosts);
        setCurrentPost(updatedPosts.find(p => p.id === currentPost.id) || null);
    };

    // 举报：后端举报中心尚未上线，先诚实提示，避免假装成功
    const handleReport = () => {
        if (!reportPostId || !reportType || !reportDesc.trim()) return;
        alert("举报功能即将上线，暂未提交。紧急情况请直接联系管理员。");
        setReportPostId(null);
        setReportType("");
        setReportDesc("");
    };

    // ============ 渲染：板块列表 ============
    const renderSections = () => (
        <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "#f5f5f5" }}>
            {/* 顶部标题栏 */}
            <div style={{
                background: "linear-gradient(135deg, #f97316 0%, #fb923c 100%)",
                padding: "28px 20px 12px 20px",
                color: "#fff",
                position: "relative"
            }}>
                {loginUsername && (
                    <button
                        onClick={() => goMainTab("me")}
                        style={{
                            position: "absolute",
                            top: 28,
                            right: onClose ? 76 : 16,
                            background: "rgba(255,255,255,0.25)",
                            border: "1px solid rgba(255,255,255,0.4)",
                            borderRadius: 8,
                            padding: "4px 10px",
                            color: "#fff",
                            fontSize: 13,
                            cursor: "pointer",
                            backdropFilter: "blur(4px)"
                        }}>
                        我的
                    </button>
                )}
                {onClose && (
                    <button
                        onClick={onClose}
                        style={{
                            position: "absolute",
                            top: 28,
                            right: 16,
                            background: "rgba(255,255,255,0.25)",
                            border: "1px solid rgba(255,255,255,0.4)",
                            borderRadius: 8,
                            padding: "4px 10px",
                            color: "#fff",
                            fontSize: 13,
                            cursor: "pointer",
                            backdropFilter: "blur(4px)"
                        }}>
                        退出
                    </button>
                )}
                <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4, display: "flex", alignItems: "center", gap: 10 }}>
                    💬 社区论坛
                    <button
                        onClick={() => goMainTab("messages")}
                        style={{
                            position: "relative",
                            background: "rgba(255,255,255,0.25)",
                            border: "1px solid rgba(255,255,255,0.4)",
                            borderRadius: 20,
                            padding: "4px 10px",
                            color: "#fff", fontSize: 14, cursor: "pointer", lineHeight: 1
                        }}>
                        🔔
                        {unreadCount > 0 && (
                            <span style={{
                                position: "absolute", top: -4, right: -6,
                                background: "#ef4444", color: "#fff",
                                fontSize: 10, fontWeight: 700,
                                minWidth: 16, height: 16, borderRadius: 8,
                                display: "flex", alignItems: "center", justifyContent: "center",
                                padding: "0 4px", border: "1.5px solid #fb923c"
                            }}>{unreadCount > 99 ? "99+" : unreadCount}</span>
                        )}
                    </button>
                </div>
                <div style={{ fontSize: 12, opacity: 0.9 }}>甜玉米粉丝交流社区</div>
            </div>

            {/* 搜索入口 */}
            <div style={{ padding: "12px 16px", background: "#fff" }}>
                <div
                    onClick={() => setView("search")}
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "10px 14px",
                        background: "#f5f5f5",
                        borderRadius: 20,
                        fontSize: 14,
                        color: "#999",
                        cursor: "pointer"
                    }}>
                    <span>🔍</span>
                    <span>搜索帖子或用户</span>
                </div>
            </div>

            {/* 你的关注入口 */}
            {loginUsername && (
                <div style={{ padding: "0 16px 12px", background: "#fff" }}>
                    <div
                        onClick={() => {
                            if (!followingLoaded) loadFollowing();
                            setView("posts");
                            setCurrentSection("__following__");
                        }}
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            padding: "12px 14px",
                            background: "linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)",
                            borderRadius: 12,
                            border: "1px solid #fed7aa",
                            cursor: "pointer"
                        }}>
                        <span style={{ fontSize: 18 }}>⭐</span>
                        <span style={{ fontSize: 14, fontWeight: 600, color: "#9a3412" }}>你的关注</span>
                        <span style={{ marginLeft: "auto", fontSize: 14, color: "#ea580c" }}>›</span>
                    </div>
                </div>
            )}

            {/* 官方通知置顶 */}
            {(() => {
                const pinnedAnnounce = posts.filter(p => p.section === "announce" && p.status === "normal").sort(
                    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
                )[0];
                if (!pinnedAnnounce) return null;
                return (
                    <div style={{ padding: "0 16px 12px", background: "#fff" }}>
                        <div
                            onClick={async () => {
                                setView("postDetail");
                                const fresh = await fetchForumPostDetail(pinnedAnnounce.id);
                                setCurrentPost(fresh || pinnedAnnounce);
                            }}
                            style={{
                                padding: "12px 14px",
                                background: "linear-gradient(135deg, #e8f5e9 0%, #c8e6c9 100%)",
                                borderRadius: 12,
                                border: "1px solid #b8dcc4",
                                cursor: "pointer"
                            }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                                <span style={{ fontSize: 16 }}>📢</span>
                                <span style={{ fontSize: 13, fontWeight: 600, color: "#2e5c33" }}>官方通知</span>
                                <span style={{ fontSize: 11, color: "#888", marginLeft: "auto" }}>
                                    {pinnedAnnounce.createdAt}
                                </span>
                            </div>
                            <div style={{ fontSize: 15, fontWeight: 600, color: "#2e5c33", marginBottom: 4 }}>
                                {pinnedAnnounce.title}
                            </div>
                            <div style={{ fontSize: 13, color: "#4a7c50", lineHeight: 1.5, whiteSpace: "pre-line" }}>
                                {pinnedAnnounce.content.length > 80
                                    ? pinnedAnnounce.content.slice(0, 80) + "..."
                                    : pinnedAnnounce.content}
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* 管理员发布通知入口 */}
            {isAdmin && (
                <div style={{ padding: "0 16px 12px", background: "#fff" }}>
                    <button
                        onClick={() => setShowNoticeForm(!showNoticeForm)}
                        style={{
                            width: "100%",
                            padding: "10px 14px",
                            background: showNoticeForm ? "#fff" : "#f5f0e8",
                            border: "1px solid #d4c8b8",
                            borderRadius: 12,
                            fontSize: 14,
                            color: "#5a4a3a",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 6
                        }}>
                        <span>{showNoticeForm ? "取消" : "✏️ 发布官方通知"}</span>
                    </button>
                </div>
            )}

            {showNoticeForm && isAdmin && (
                <div style={{ padding: "0 16px 12px", background: "#fff" }}>
                    <div style={{ padding: 12, background: "#fafafa", borderRadius: 12, border: "1px solid #eee" }}>
                        <input
                            type="text"
                            placeholder="通知标题"
                            value={newNoticeTitle}
                            onChange={e => setNewNoticeTitle(e.target.value)}
                            style={{
                                width: "100%",
                                padding: "8px 10px",
                                marginBottom: 8,
                                border: "1px solid #ddd",
                                borderRadius: 8,
                                fontSize: 14,
                                background: "#fff"
                            }}
                        />
                        <textarea
                            placeholder="通知内容"
                            value={newNoticeContent}
                            onChange={e => setNewNoticeContent(e.target.value)}
                            rows={3}
                            style={{
                                width: "100%",
                                padding: "8px 10px",
                                marginBottom: 8,
                                border: "1px solid #ddd",
                                borderRadius: 8,
                                fontSize: 14,
                                resize: "none",
                                background: "#fff"
                            }}
                        />
                        <button
                            onClick={handlePublishNotice}
                            disabled={isLoading}
                            style={{
                                width: "100%",
                                padding: "10px",
                                background: isLoading ? "#9e9e9e" : "#2e7d32",
                                color: "#fff",
                                border: "none",
                                borderRadius: 8,
                                fontSize: 14,
                                cursor: isLoading ? "not-allowed" : "pointer"
                            }}>
                            {isLoading ? "发布中…" : "发布置顶通知"}
                        </button>
                    </div>
                </div>
            )}

            {/* 板块列表 */}
            <div style={{ flex: 1, overflow: "auto", padding: "12px 16px" }}>
                {isAdmin && (
                    <div style={{ marginBottom: 12 }}>
                        <button
                            onClick={() => setShowSectionForm(!showSectionForm)}
                            style={{
                                width: "100%",
                                padding: "10px 14px",
                                background: showSectionForm ? "#fff" : "#e8f5e9",
                                border: "1px solid #b8dcc4",
                                borderRadius: 12,
                                fontSize: 14,
                                color: "#2e5c33",
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                gap: 6
                            }}>
                            <span>{showSectionForm ? "取消" : "➕ 创建新板块"}</span>
                        </button>
                    </div>
                )}

                {showSectionForm && isAdmin && (
                    <div style={{ marginBottom: 12, padding: 12, background: "#fff", borderRadius: 12, border: "1px solid #eee" }}>
                        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                            <input
                                type="text"
                                placeholder="图标 Emoji"
                                value={newSectionIcon}
                                onChange={e => setNewSectionIcon(e.target.value)}
                                style={{
                                    width: 60,
                                    padding: "8px 10px",
                                    border: "1px solid #ddd",
                                    borderRadius: 8,
                                    fontSize: 14,
                                    textAlign: "center"
                                }}
                            />
                            <input
                                type="text"
                                placeholder="板块名称"
                                value={newSectionName}
                                onChange={e => setNewSectionName(e.target.value)}
                                style={{
                                    flex: 1,
                                    padding: "8px 10px",
                                    border: "1px solid #ddd",
                                    borderRadius: 8,
                                    fontSize: 14
                                }}
                            />
                        </div>
                        <input
                            type="text"
                            placeholder="板块描述（可选）"
                            value={newSectionDesc}
                            onChange={e => setNewSectionDesc(e.target.value)}
                            style={{
                                width: "100%",
                                padding: "8px 10px",
                                marginBottom: 8,
                                border: "1px solid #ddd",
                                borderRadius: 8,
                                fontSize: 14
                            }}
                        />
                        <button
                            onClick={handleCreateSection}
                            style={{
                                width: "100%",
                                padding: 10,
                                background: "#2e7d32",
                                color: "#fff",
                                border: "none",
                                borderRadius: 8,
                                fontSize: 14,
                                cursor: "pointer"
                            }}>
                            确认创建
                        </button>
                    </div>
                )}

                {sections.map(section => (
                    <div
                        key={section.id}
                        onClick={() => {
                            setCurrentSection(section.id);
                            setView("posts");
                        }}
                        style={{
                            background: "#fff",
                            borderRadius: 12,
                            padding: 16,
                            marginBottom: 12,
                            display: "flex",
                            alignItems: "center",
                            gap: 14,
                            cursor: "pointer",
                            boxShadow: "0 1px 3px rgba(0,0,0,0.05)"
                        }}>
                        <div style={{
                            width: 48,
                            height: 48,
                            borderRadius: 12,
                            background: "linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 24,
                            flexShrink: 0
                        }}>{section.icon}</div>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 16, fontWeight: 600, color: "#1f2937", marginBottom: 4 }}>{section.name}</div>
                            <div style={{ fontSize: 12, color: "#9ca3af" }}>{section.desc}</div>
                        </div>
                        <div style={{
                            fontSize: 12,
                            color: "#f97316",
                            background: "#fff7ed",
                            padding: "4px 10px",
                            borderRadius: 12,
                            fontWeight: 500
                        }}>{posts.filter(p => p.section === section.id && p.status === "normal").length} 帖</div>
                    </div>
                ))}
            </div>

            {/* 底部发帖按钮 */}
            <div style={{ padding: "12px 16px", background: "#fff", borderTop: "1px solid #f0f0f0" }}>
                <button
                    onClick={() => setView("newPost")}
                    style={{
                        width: "100%",
                        padding: 14,
                        background: "linear-gradient(135deg, #f97316 0%, #fb923c 100%)",
                        color: "#fff",
                        border: "none",
                        borderRadius: 12,
                        fontSize: 15,
                        fontWeight: 600,
                        cursor: "pointer"
                    }}>✏️ 发布新帖</button>
            </div>
        </div>
    );

    // ============ 渲染：帖子列表 ============
    const renderFollowingFeed = () => {
        const list = followingPosts;
        const openOne = async (post: ForumPost) => {
            incrementViewCount(post.id);
            setDetailReturnView("posts");
            setView("postDetail");
            const fresh = await fetchForumPostDetail(post.id);
            setCurrentPost(fresh || post);
        };
        return (
            <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "#f5f5f5" }}>
                <div style={{
                    background: "linear-gradient(135deg, #f97316 0%, #fb923c 100%)",
                    padding: "16px 20px", color: "#fff",
                    display: "flex", alignItems: "center", gap: 12
                }}>
                    <button
                        onClick={() => { setView("sections"); setCurrentSection(null); }}
                        style={{
                            background: "rgba(255,255,255,0.2)", border: "none", color: "#fff",
                            width: 32, height: 32, borderRadius: 8, fontSize: 18, cursor: "pointer",
                            display: "flex", alignItems: "center", justifyContent: "center"
                        }}>←</button>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 18, fontWeight: 700 }}>⭐ 你的关注</div>
                        <div style={{ fontSize: 12, opacity: 0.9 }}>关注用户发布的最新帖子</div>
                    </div>
                </div>
                <div style={{ flex: 1, overflow: "auto", padding: "12px 16px" }}>
                    {followingLoading ? (
                        <div style={{ textAlign: "center", padding: 40, color: "#999", fontSize: 14 }}>加载中...</div>
                    ) : list.length === 0 ? (
                        <div style={{ textAlign: "center", padding: 40, color: "#999" }}>
                            <div style={{ fontSize: 48, marginBottom: 12 }}>🌱</div>
                            <div style={{ fontSize: 14 }}>还没有关注的人</div>
                            <div style={{ fontSize: 12, marginTop: 6 }}>去帖子里点作者头像关注吧</div>
                        </div>
                    ) : (
                        list.map(post => (
                            <div key={post.id} onClick={() => openOne(post)} style={{
                                background: "#fff", borderRadius: 12, padding: 16, marginBottom: 12,
                                cursor: "pointer", boxShadow: "0 1px 3px rgba(0,0,0,0.05)"
                            }}>
                                <div style={{ fontSize: 15, fontWeight: 600, color: "#1f2937", marginBottom: 8, lineHeight: 1.4 }}>
                                    {post.isEssence && <span style={{ color: "#f59e0b", marginRight: 6 }}>⭐</span>}
                                    {post.title}
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                                    <Avatar url={post.avatarUrl} fallback={post.authorAvatar} size={32}
                                        onClick={post.authorId ? () => viewUserByName(post.author) : undefined} />
                                    <span style={{ fontSize: 13, color: "#6b7280", fontWeight: 500 }}>{post.author}</span>
                                    <span style={{ fontSize: 12, color: "#d1d5db" }}>·</span>
                                    <span style={{ fontSize: 12, color: "#9ca3af" }}>{post.createdAt}</span>
                                </div>
                                <div style={{ display: "flex", gap: 16, fontSize: 12, color: "#9ca3af" }}>
                                    <span>💬 {post.replyCount} 回复</span>
                                    <span>👁 {post.viewCount} 浏览</span>
                                    <span>👍 {post.likes} 赞</span>
                                    <span>⭐ {post.favorites} 收藏</span>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        );
    };

    const renderPosts = () => {
        if (currentSection === "__following__") return renderFollowingFeed();
        const filteredPosts = getFilteredPosts();
        const section = getSection(currentSection || "");

        return (
            <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "#f5f5f5" }}>
                {/* 顶部标题栏 */}
                <div style={{
                    background: "linear-gradient(135deg, #f97316 0%, #fb923c 100%)",
                    padding: "16px 20px",
                    color: "#fff",
                    display: "flex",
                    alignItems: "center",
                    gap: 12
                }}>
                    <button
                        onClick={() => {
                            setView("sections");
                            setCurrentSection(null);
                        }}
                        style={{
                            background: "rgba(255,255,255,0.2)",
                            border: "none",
                            color: "#fff",
                            width: 32,
                            height: 32,
                            borderRadius: 8,
                            fontSize: 18,
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center"
                        }}>←</button>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 18, fontWeight: 700 }}>{section?.icon} {section?.name}</div>
                        <div style={{ fontSize: 12, opacity: 0.9 }}>{section?.desc}</div>
                    </div>
                </div>

                {/* 排序切换 */}
                <div style={{
                    background: "#fff",
                    padding: "10px 16px",
                    display: "flex",
                    gap: 8,
                    borderBottom: "1px solid #f0f0f0",
                    overflowX: "auto"
                }}>
                    {[
                        { key: "latest", label: "最新发布" },
                        { key: "hot", label: "最热帖子" },
                        { key: "essence", label: "精华帖子" }
                    ].map(item => (
                        <button
                            key={item.key}
                            onClick={() => setSortBy(item.key as "latest" | "hot" | "essence")}
                            style={{
                                padding: "6px 14px",
                                background: sortBy === item.key ? "#f97316" : "#f5f5f5",
                                color: sortBy === item.key ? "#fff" : "#666",
                                border: "none",
                                borderRadius: 16,
                                fontSize: 13,
                                fontWeight: 500,
                                cursor: "pointer",
                                whiteSpace: "nowrap"
                            }}>{item.label}</button>
                    ))}
                </div>

                {/* 帖子列表 */}
                <div style={{ flex: 1, overflow: "auto", padding: "12px 16px" }}>
                    {filteredPosts.length === 0 ? (
                        <div style={{
                            textAlign: "center",
                            padding: 40,
                            color: "#999"
                        }}>
                            <div style={{ fontSize: 48, marginBottom: 12 }}>📭</div>
                            <div style={{ fontSize: 14 }}>暂无帖子</div>
                        </div>
                    ) : (
                        filteredPosts.map(post => (
                            <div
                                key={post.id}
                                onClick={async () => {
                                    incrementViewCount(post.id);
                                    setView("postDetail");
                                    const fresh = await fetchForumPostDetail(post.id);
                                    setCurrentPost(fresh || post);
                                }}
                                style={{
                                    background: "#fff",
                                    borderRadius: 12,
                                    padding: 16,
                                    marginBottom: 12,
                                    cursor: "pointer",
                                    boxShadow: "0 1px 3px rgba(0,0,0,0.05)"
                                }}>
                                {/* 标题 */}
                                <div style={{ fontSize: 15, fontWeight: 600, color: "#1f2937", marginBottom: 8, lineHeight: 1.4 }}>
                                    {post.isPinned && <span style={{ color: "#f97316", marginRight: 6 }}>📌</span>}
                                    {post.section === "announce" && <span style={{ color: "#f97316", marginRight: 6 }}>📢</span>}
                                    {post.isEssence && <span style={{ color: "#f59e0b", marginRight: 6 }}>⭐</span>}
                                    {post.isLocked && <span style={{ color: "#9ca3af", marginRight: 6 }}>🔒</span>}
                                    {post.title}
                                    {post.section === "bug-report" && post.bugStatus && (
                                        <span style={{
                                            marginLeft: 8,
                                            fontSize: 11,
                                            padding: "2px 8px",
                                            borderRadius: 10,
                                            background: post.bugStatus === "fixed" ? "#dcfce7" : post.bugStatus === "wontfix" ? "#f3f4f6" : "#ffedd5",
                                            color: post.bugStatus === "fixed" ? "#166534" : post.bugStatus === "wontfix" ? "#6b7280" : "#9a3412",
                                            fontWeight: 500
                                        }}>
                                            {post.bugStatus === "fixed" ? "已修复" : post.bugStatus === "wontfix" ? "不修复" : "待处理"}
                                        </span>
                                    )}
                                </div>

                                {/* 作者信息 */}
                                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                                    <Avatar url={post.avatarUrl} fallback={post.authorAvatar} size={32}
                                      onClick={onViewUserProfile && post.authorId ? () => onViewUserProfile?.(post.author) : undefined} />
                                    <span
                                      style={{ fontSize: 13, color: "#6b7280", fontWeight: 500, cursor: onViewUserProfile ? "pointer" : "default" }}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onViewUserProfile?.(post.author);
                                      }}
                                    >{post.author}</span>
                                    <span style={{ fontSize: 12, color: "#d1d5db" }}>·</span>
                                    <span style={{ fontSize: 12, color: "#9ca3af" }}>{post.createdAt}</span>
                                </div>

                                {/* 统计信息 */}
                                <div style={{
                                    display: "flex",
                                    gap: 16,
                                    fontSize: 12,
                                    color: "#9ca3af"
                                }}>
                                    <span>💬 {post.replyCount} 回复</span>
                                    <span>👁 {post.viewCount} 浏览</span>
                                    <span>👍 {post.likes} 赞</span>
                                    <span>⭐ {post.favorites} 收藏</span>
                                    <span style={{ marginLeft: "auto" }}>最后回复 {post.lastReplyAt}</span>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* 底部发帖按钮 */}
                {currentSection !== "announce" && (
                    <div style={{ padding: "12px 16px", background: "#fff", borderTop: "1px solid #f0f0f0" }}>
                        <button
                            onClick={() => setView("newPost")}
                            style={{
                                width: "100%",
                                padding: 14,
                                background: "linear-gradient(135deg, #f97316 0%, #fb923c 100%)",
                                color: "#fff",
                                border: "none",
                                borderRadius: 12,
                                fontSize: 15,
                                fontWeight: 600,
                                cursor: "pointer"
                            }}>✏️ 发布新帖</button>
                    </div>
                )}
            </div>
        );
    };

    // ============ 渲染：帖子详情 ============
    const renderPostDetail = () => {
        if (!currentPost) return null;

        // 排序回复：置顶优先
        const sortedReplies = [...currentPost.replies].sort((a, b) => {
            if (a.isPinned && !b.isPinned) return -1;
            if (!a.isPinned && b.isPinned) return 1;
            return 0;
        });

        return (
            <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "#f5f5f5" }}>
                {/* 顶部标题栏 */}
                <div style={{
                    background: "linear-gradient(135deg, #f97316 0%, #fb923c 100%)",
                    padding: "16px 20px",
                    color: "#fff",
                    display: "flex",
                    alignItems: "center",
                    gap: 12
                }}>
                    <button
                        onClick={() => {
                            setCurrentPost(null);
                            if (mainTab === "home") {
                                if (detailReturnView === "posts") setView("posts");
                                else { setView("sections"); setCurrentSection(null); }
                            } else if (mainTab === "messages") {
                                setView("messages");
                                refreshUnread();
                            } else {
                                setView("me");
                            }
                        }}
                        style={{
                            background: "rgba(255,255,255,0.2)",
                            border: "none",
                            color: "#fff",
                            width: 32,
                            height: 32,
                            borderRadius: 8,
                            fontSize: 18,
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center"
                        }}>←</button>
                    <div style={{ flex: 1, fontSize: 16, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        帖子详情
                    </div>
                    <button
                        onClick={() => setReportPostId(currentPost.id)}
                        style={{
                            background: "rgba(255,255,255,0.2)",
                            border: "none",
                            color: "#fff",
                            padding: "6px 12px",
                            borderRadius: 8,
                            fontSize: 12,
                            cursor: "pointer"
                        }}> 举报</button>
                    {isAdmin && (
                        <>
                            <button
                                onClick={async () => {
                                    if (!confirm("确定删除该帖子？")) return;
                                    try {
                                        const res = await forumApi("admin_delete", { postId: currentPost.id });
                                        if (!res.success) {
                                            setApiError(res.error || "删除失败");
                                            return;
                                        }
                                        setPosts(prev => prev.filter(p => p.id !== currentPost.id));
                                        setView("posts");
                                        setCurrentPost(null);
                                        setApiError(null);
                                    } catch (err) {
                                        setApiError(err instanceof Error ? err.message : "删除失败");
                                    }
                                }}
                                style={{
                                    background: "rgba(239,68,68,0.85)",
                                    border: "none",
                                    color: "#fff",
                                    padding: "6px 12px",
                                    borderRadius: 8,
                                    fontSize: 12,
                                    cursor: "pointer"
                                }}>删除</button>
                            <button
                                onClick={() => toggleEssence(currentPost.id)}
                                style={{
                                    background: "rgba(245,158,11,0.85)",
                                    border: "none",
                                    color: "#fff",
                                    padding: "6px 12px",
                                    borderRadius: 8,
                                    fontSize: 12,
                                    cursor: "pointer"
                                }}>{currentPost.isEssence ? "取消精华" : "加精"}</button>
                        </>
                    )}
                </div>

                {/* 帖子内容 */}
                <div style={{ flex: 1, overflow: "auto", padding: 16 }}>
                    {/* 主帖 */}
                    <div style={{
                        background: "#fff",
                        borderRadius: 12,
                        padding: 16,
                        marginBottom: 12,
                        boxShadow: "0 1px 3px rgba(0,0,0,0.05)"
                    }}>
                        <div style={{ fontSize: 17, fontWeight: 700, color: "#1f2937", marginBottom: 12, lineHeight: 1.5 }}>
                            {currentPost.isPinned && <span style={{ color: "#f97316", marginRight: 6 }}>📌</span>}
                            {currentPost.section === "announce" && <span style={{ color: "#f97316", marginRight: 6 }}>📢</span>}
                            {currentPost.isEssence && <span style={{ color: "#f59e0b", marginRight: 6 }}>⭐</span>}
                            {currentPost.title}
                            {currentPost.section === "bug-report" && currentPost.bugStatus && (
                                <span style={{
                                    marginLeft: 10,
                                    fontSize: 12,
                                    padding: "3px 10px",
                                    borderRadius: 12,
                                    background: currentPost.bugStatus === "fixed" ? "#dcfce7" : currentPost.bugStatus === "wontfix" ? "#f3f4f6" : "#ffedd5",
                                    color: currentPost.bugStatus === "fixed" ? "#166534" : currentPost.bugStatus === "wontfix" ? "#6b7280" : "#9a3412",
                                    fontWeight: 500
                                }}>
                                    {currentPost.bugStatus === "fixed" ? "已修复" : currentPost.bugStatus === "wontfix" ? "不修复" : "待处理"}
                                </span>
                            )}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                            <Avatar url={currentPost.avatarUrl} fallback={currentPost.authorAvatar} size={36}
                              onClick={onViewUserProfile && currentPost.authorId ? () => onViewUserProfile?.(currentPost.author) : undefined} />
                            <span style={{ fontSize: 14, color: "#6b7280", fontWeight: 500, cursor: "pointer" }}
                              onClick={() => onViewUserProfile?.(currentPost.author)}>{currentPost.author}</span>
                            <span style={{ fontSize: 12, color: "#d1d5db" }}>·</span>
                            <span style={{ fontSize: 12, color: "#9ca3af" }}>{currentPost.createdAt}</span>
                        </div>
                        <div style={{
                            fontSize: 14,
                            color: "#374151",
                            lineHeight: 1.8,
                            whiteSpace: "pre-wrap",
                            marginBottom: 14
                        }}>{currentPost.content}</div>
                        <div style={{
                            display: "flex",
                            gap: 16,
                            fontSize: 13,
                            color: "#9ca3af",
                            borderTop: "1px solid #f3f4f6",
                            paddingTop: 12
                        }}>
                            <span
                                onClick={() => toggleLike(currentPost.id)}
                                style={{
                                    cursor: "pointer",
                                    color: likedPostIds.includes(currentPost.id) ? "#ef4444" : "#6b7280",
                                    fontWeight: likedPostIds.includes(currentPost.id) ? 700 : 400
                                }}
                            >
                                {likedPostIds.includes(currentPost.id) ? "❤️" : "🤍"} {currentPost.likes}
                            </span>
                            <span
                                onClick={() => toggleFavorite(currentPost.id)}
                                style={{
                                    cursor: "pointer",
                                    color: favoritedPostIds.includes(currentPost.id) ? "#f59e0b" : "#6b7280",
                                    fontWeight: favoritedPostIds.includes(currentPost.id) ? 700 : 400
                                }}
                            >
                                {favoritedPostIds.includes(currentPost.id) ? "⭐" : "☆"} {currentPost.favorites}
                            </span>
                            <span>💬 {currentPost.replyCount} 回复</span>
                            <span>👁 {currentPost.viewCount} 浏览</span>
                        </div>

                        {/* 作者名与互动操作 */}
                        <div style={{
                            display: "flex",
                            flexWrap: "wrap",
                            gap: 8,
                            marginTop: 12,
                            paddingTop: 12,
                            borderTop: "1px solid #f3f4f6"
                        }}>
                            <button
                                onClick={() => onViewUserProfile?.(currentPost.author)}
                                style={{
                                    background: "#f5f5f5",
                                    border: "none",
                                    borderRadius: 8,
                                    padding: "6px 12px",
                                    fontSize: 13,
                                    color: "#6b7280",
                                    cursor: "pointer"
                                }}>👤 查看主页</button>
                            {isAdmin && (
                                <button
                                    onClick={() => toggleEssence(currentPost.id)}
                                    style={{
                                        background: currentPost.isEssence ? "#fff7ed" : "#f5f5f5",
                                        border: "none",
                                        borderRadius: 8,
                                        padding: "6px 12px",
                                        fontSize: 13,
                                        color: currentPost.isEssence ? "#f97316" : "#6b7280",
                                        cursor: "pointer"
                                    }}>{currentPost.isEssence ? "⭐ 取消精华" : "⭐ 设为精华"}</button>
                            )}
                            {loginUsername && loginUsername !== currentPost.author && (
                                <button
                                    onClick={() => { setShowRewardForm(true); setRewardAmount(""); setRewardMessage(""); }}
                                    style={{
                                        background: "#fff7ed",
                                        border: "none",
                                        borderRadius: 8,
                                        padding: "6px 12px",
                                        fontSize: 13,
                                        color: "#f97316",
                                        cursor: "pointer"
                                    }}>🍬 打赏作者</button>
                            )}
                        </div>
                    </div>

                    {/* 回复列表 */}
                    <div style={{
                        background: "#fff",
                        borderRadius: 12,
                        padding: 16,
                        boxShadow: "0 1px 3px rgba(0,0,0,0.05)"
                    }}>
                        <div style={{ fontSize: 15, fontWeight: 600, color: "#1f2937", marginBottom: 14 }}>
                            全部评论 ({currentPost.replyCount})
                        </div>

                        {sortedReplies.length === 0 ? (
                            <div style={{ textAlign: "center", padding: 30, color: "#9ca3af" }}>
                                <div style={{ fontSize: 36, marginBottom: 8 }}>💬</div>
                                <div style={{ fontSize: 13 }}>暂无评论，快来抢沙发～</div>
                            </div>
                        ) : (
                            sortedReplies.map((reply, idx) => (
                                <div key={reply.id} style={{
                                    padding: "14px 0",
                                    borderBottom: idx < sortedReplies.length - 1 ? "1px solid #f3f4f6" : "none"
                                }}>
                                    {reply.isPinned && (
                                        <div style={{
                                            fontSize: 12,
                                            color: "#f97316",
                                            background: "#fff7ed",
                                            padding: "4px 10px",
                                            borderRadius: 12,
                                            display: "inline-block",
                                            marginBottom: 8,
                                            fontWeight: 500
                                        }}>📌 楼主置顶</div>
                                    )}
                                    <div style={{ display: "flex", gap: 10, marginBottom: 8 }}>
                                        <Avatar url={reply.avatarUrl} fallback={reply.authorAvatar || "🌽"} size={34}
                                          onClick={onViewUserProfile && reply.authorId ? () => onViewUserProfile?.(reply.author) : undefined} />
                                        <div style={{ flex: 1 }}>
                                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                                                <span style={{ fontSize: 14, color: "#6b7280", fontWeight: 500, cursor: "pointer" }}
                                                  onClick={() => onViewUserProfile?.(reply.author)}>{reply.author}</span>
                                                <span style={{ fontSize: 12, color: "#d1d5db" }}>·</span>
                                                <span style={{ fontSize: 12, color: "#9ca3af" }}>{reply.createdAt}</span>
                                            </div>
                                            <div style={{
                                                fontSize: 14,
                                                color: "#374151",
                                                lineHeight: 1.6,
                                                marginBottom: 8
                                            }}>{reply.content}</div>

                                            {/* 楼中楼回复 */}
                                            {reply.subReplies.length > 0 && (
                                                <div style={{
                                                    background: "#f9fafb",
                                                    borderRadius: 8,
                                                    padding: 10,
                                                    marginTop: 8
                                                }}>
                                                    {reply.subReplies.map(subReply => (
                                                        <div key={subReply.id} style={{ marginBottom: 8 }}>
                                                            <div style={{ fontSize: 13, lineHeight: 1.6 }}>
                                                                <span style={{ color: "#6b7280", fontWeight: 500 }}>{subReply.author}</span>
                                                                <span style={{ color: "#9ca3af", margin: "0 6px" }}>回复</span>
                                                                <span style={{ color: "#f97316", fontWeight: 500 }}>{subReply.replyTo}</span>
                                                                <span style={{ color: "#374151" }}>：{subReply.content}</span>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}

                                            {/* 回复操作 */}
                                            <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
                                                <button
                                                    onClick={() => handleSubReply(reply.id, reply.author)}
                                                    style={{
                                                        background: "none",
                                                        border: "none",
                                                        color: "#9ca3af",
                                                        fontSize: 12,
                                                        cursor: "pointer",
                                                        padding: 0
                                                    }}>💬 回复</button>
                                                {currentPost.author === "我" && (
                                                    <>
                                                        <button
                                                            onClick={() => handlePinReply(reply.id)}
                                                            style={{
                                                                background: "none",
                                                                border: "none",
                                                                color: reply.isPinned ? "#f97316" : "#9ca3af",
                                                                fontSize: 12,
                                                                cursor: "pointer",
                                                                padding: 0
                                                            }}>{reply.isPinned ? "📌 取消置顶" : "📌 置顶"}</button>
                                                        <button
                                                            onClick={() => handleDeleteReply(reply.id)}
                                                            style={{
                                                                background: "none",
                                                                border: "none",
                                                                color: "#ef4444",
                                                                fontSize: 12,
                                                                cursor: "pointer",
                                                                padding: 0
                                                            }}>🗑 删除</button>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* 回复框（锁定帖隐藏） */}
                {!currentPost.isLocked && (
                    <div style={{
                        padding: "12px 16px",
                        background: "#fff",
                        borderTop: "1px solid #f0f0f0"
                    }}>
                        {replyToReplyId && (
                            <div style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                padding: "8px 12px",
                                background: "#fff7ed",
                                borderRadius: 8,
                                marginBottom: 8,
                                fontSize: 13,
                                color: "#f97316"
                            }}>
                                <span>回复 @{replyToAuthor}</span>
                                <button
                                    onClick={() => {
                                        setReplyToReplyId(null);
                                        setReplyToAuthor("");
                                    }}
                                    style={{
                                        background: "none",
                                        border: "none",
                                        color: "#f97316",
                                        cursor: "pointer",
                                        fontSize: 16
                                    }}>×</button>
                            </div>
                        )}
                        {isAdmin && currentPost.section === "bug-report" && (
                            <div style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                marginBottom: 8,
                                padding: "8px 12px",
                                background: "#f9fafb",
                                borderRadius: 8,
                                fontSize: 13,
                                color: "#4b5563"
                            }}>
                                <span>Bug 状态：</span>
                                {[
                                    { key: "pending", label: "待处理" },
                                    { key: "fixed", label: "已修复" },
                                    { key: "wontfix", label: "不修复" }
                                ].map(item => (
                                    <button
                                        key={item.key}
                                        onClick={() => setNewBugStatus(item.key as "pending" | "fixed" | "wontfix")}
                                        style={{
                                            padding: "4px 10px",
                                            borderRadius: 10,
                                            border: "none",
                                            fontSize: 12,
                                            cursor: "pointer",
                                            background: newBugStatus === item.key
                                                ? (item.key === "fixed" ? "#22c55e" : item.key === "wontfix" ? "#9ca3af" : "#f97316")
                                                : "#e5e7eb",
                                            color: newBugStatus === item.key ? "#fff" : "#374151"
                                        }}
                                    >{item.label}</button>
                                ))}
                            </div>
                        )}
                        <div style={{ display: "flex", gap: 10 }}>
                            <input
                                type="text"
                                value={replyContent}
                                onChange={e => setReplyContent(e.target.value)}
                                placeholder={replyToReplyId ? `回复 @${replyToAuthor}` : "写下你的评论..."}
                                style={{
                                    flex: 1,
                                    padding: "10px 14px",
                                    border: "1px solid #e5e7eb",
                                    borderRadius: 20,
                                    fontSize: 14,
                                    outline: "none"
                                }}
                                onKeyDown={e => {
                                    if (e.key === "Enter") {
                                        if (replyToReplyId) {
                                            handleSubmitSubReply();
                                        } else {
                                            handleReply();
                                        }
                                    }
                                }}
                            />
                            <button
                                onClick={() => {
                                    if (replyToReplyId) {
                                        handleSubmitSubReply();
                                    } else {
                                        handleReply();
                                    }
                                }}
                                style={{
                                    padding: "10px 20px",
                                    background: "linear-gradient(135deg, #f97316 0%, #fb923c 100%)",
                                    color: "#fff",
                                    border: "none",
                                    borderRadius: 20,
                                    fontSize: 14,
                                    fontWeight: 600,
                                    cursor: "pointer"
                                }}>发送</button>
                        </div>
                    </div>
                )}

                {/* 打赏/奖励弹窗 */}
                {showRewardForm && currentPost && (
                    <div style={{
                        position: "fixed",
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        background: "rgba(0,0,0,0.5)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        zIndex: 1001,
                        padding: 20
                    }}>
                        <div style={{
                            background: "#fff",
                            borderRadius: 16,
                            padding: 20,
                            width: "100%",
                            maxWidth: 360
                        }}>
                            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 12 }}>
                                🍬 打赏作者
                            </div>
                            <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 16 }}>
                                作者：<strong>{currentPost.author}</strong>
                                {loginUsername && (
                                    <div style={{ marginTop: 4 }}>我的余额：{loadCoins(loginUsername)} 米米币</div>
                                )}
                            </div>
                            <div style={{ marginBottom: 16 }}>
                                <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 8 }}>金额</div>
                                <input
                                    type="number"
                                    min={1}
                                    value={rewardAmount}
                                    onChange={e => setRewardAmount(e.target.value)}
                                    placeholder="请输入米米币数量"
                                    style={{
                                        width: "100%",
                                        padding: 12,
                                        border: "1px solid #e5e7eb",
                                        borderRadius: 10,
                                        fontSize: 15,
                                        outline: "none",
                                        boxSizing: "border-box"
                                    }}
                                />
                            </div>
                            {rewardMessage && (
                                <div style={{
                                    marginBottom: 14,
                                    padding: "10px 12px",
                                    background: rewardMessage.includes("不足") || rewardMessage.includes("不能") || rewardMessage.includes("有效")
                                        ? "#fef2f2"
                                        : "#f0fdf4",
                                    color: rewardMessage.includes("不足") || rewardMessage.includes("不能") || rewardMessage.includes("有效")
                                        ? "#ef4444"
                                        : "#16a34a",
                                    borderRadius: 8,
                                    fontSize: 13
                                }}>{rewardMessage}</div>
                            )}
                            <div style={{ display: "flex", gap: 10 }}>
                                <button
                                    onClick={() => {
                                        setShowRewardForm(false);
                                        setRewardAmount("");
                                        setRewardMessage("");
                                    }}
                                    style={{
                                        flex: 1,
                                        padding: 12,
                                        background: "#f5f5f5",
                                        color: "#666",
                                        border: "none",
                                        borderRadius: 10,
                                        fontSize: 14,
                                        cursor: "pointer"
                                    }}>取消</button>
                                <button
                                    onClick={() => handleReward()}
                                    style={{
                                        flex: 1,
                                        padding: 12,
                                        background: "#f97316",
                                        color: "#fff",
                                        border: "none",
                                        borderRadius: 10,
                                        fontSize: 14,
                                        fontWeight: 600,
                                        cursor: "pointer"
                                    }}>确认打赏</button>
                            </div>
                        </div>
                    </div>
                )}

                {/* 举报弹窗 */}
                {reportPostId && (
                    <div style={{
                        position: "fixed",
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        background: "rgba(0,0,0,0.5)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        zIndex: 1000,
                        padding: 20
                    }}>
                        <div style={{
                            background: "#fff",
                            borderRadius: 16,
                            padding: 20,
                            width: "100%",
                            maxWidth: 360
                        }}>
                            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 16 }}>🚨 举报帖子</div>
                            <div style={{ marginBottom: 14 }}>
                                <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 8 }}>举报类型</div>
                                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                                    {["广告 spam", "人身攻击", "色情内容", "政治敏感", "其他"].map(type => (
                                        <button
                                            key={type}
                                            onClick={() => setReportType(type)}
                                            style={{
                                                padding: "8px 14px",
                                                background: reportType === type ? "#f97316" : "#f5f5f5",
                                                color: reportType === type ? "#fff" : "#666",
                                                border: "none",
                                                borderRadius: 16,
                                                fontSize: 13,
                                                cursor: "pointer"
                                            }}>{type}</button>
                                    ))}
                                </div>
                            </div>
                            <div style={{ marginBottom: 16 }}>
                                <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 8 }}>举报描述</div>
                                <textarea
                                    value={reportDesc}
                                    onChange={e => setReportDesc(e.target.value)}
                                    placeholder="请详细描述举报原因..."
                                    style={{
                                        width: "100%",
                                        padding: 12,
                                        border: "1px solid #e5e7eb",
                                        borderRadius: 10,
                                        fontSize: 14,
                                        resize: "none",
                                        height: 80,
                                        outline: "none",
                                        boxSizing: "border-box"
                                    }}
                                />
                            </div>
                            <div style={{ display: "flex", gap: 10 }}>
                                <button
                                    onClick={() => {
                                        setReportPostId(null);
                                        setReportType("");
                                        setReportDesc("");
                                    }}
                                    style={{
                                        flex: 1,
                                        padding: 12,
                                        background: "#f5f5f5",
                                        color: "#666",
                                        border: "none",
                                        borderRadius: 10,
                                        fontSize: 14,
                                        cursor: "pointer"
                                    }}>取消</button>
                                <button
                                    onClick={handleReport}
                                    style={{
                                        flex: 1,
                                        padding: 12,
                                        background: "#ef4444",
                                        color: "#fff",
                                        border: "none",
                                        borderRadius: 10,
                                        fontSize: 14,
                                        fontWeight: 600,
                                        cursor: "pointer"
                                    }}>提交举报</button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    };

    // ============ 渲染：发帖页面 ============
    const renderNewPost = () => (
        <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "#f5f5f5" }}>
            {/* 顶部标题栏 */}
            <div style={{
                background: "linear-gradient(135deg, #f97316 0%, #fb923c 100%)",
                padding: "16px 20px",
                color: "#fff",
                display: "flex",
                alignItems: "center",
                gap: 12
            }}>
                <button
                    onClick={() => setView("sections")}
                    style={{
                        background: "rgba(255,255,255,0.2)",
                        border: "none",
                        color: "#fff",
                        width: 32,
                        height: 32,
                        borderRadius: 8,
                        fontSize: 18,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center"
                    }}>←</button>
                <div style={{ flex: 1, fontSize: 18, fontWeight: 700 }}>发布新帖</div>
            </div>

            {/* 表单 */}
            <div style={{ flex: 1, overflow: "auto", padding: 16 }}>
                {/* 选择板块 */}
                <div style={{
                    background: "#fff",
                    borderRadius: 12,
                    padding: 16,
                    marginBottom: 12,
                    boxShadow: "0 1px 3px rgba(0,0,0,0.05)"
                }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "#1f2937", marginBottom: 12 }}>选择板块</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                        {sections.filter(s => isAdmin || s.id !== "announce").map(section => (
                            <button
                                key={section.id}
                                onClick={() => setNewPostSection(section.id)}
                                style={{
                                    padding: "8px 16px",
                                    background: newPostSection === section.id ? "#f97316" : "#f5f5f5",
                                    color: newPostSection === section.id ? "#fff" : "#666",
                                    border: "none",
                                    borderRadius: 16,
                                    fontSize: 13,
                                    cursor: "pointer",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 6
                                }}>{section.icon} {section.name}</button>
                        ))}
                    </div>
                </div>

                {/* 标题 */}
                <div style={{
                    background: "#fff",
                    borderRadius: 12,
                    padding: 16,
                    marginBottom: 12,
                    boxShadow: "0 1px 3px rgba(0,0,0,0.05)"
                }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "#1f2937", marginBottom: 12 }}>
                        标题 <span style={{ color: "#9ca3af", fontWeight: 400 }}>(2-50 字)</span>
                    </div>
                    <input
                        type="text"
                        value={newPostTitle}
                        onChange={e => setNewPostTitle(e.target.value)}
                        placeholder="请输入帖子标题..."
                        maxLength={50}
                        style={{
                            width: "100%",
                            padding: 12,
                            border: "1px solid #e5e7eb",
                            borderRadius: 10,
                            fontSize: 14,
                            outline: "none",
                            boxSizing: "border-box"
                        }}
                    />
                    <div style={{ fontSize: 12, color: "#9ca3af", textAlign: "right", marginTop: 6 }}>
                        {newPostTitle.length}/50
                    </div>
                </div>

                {/* 正文 */}
                <div style={{
                    background: "#fff",
                    borderRadius: 12,
                    padding: 16,
                    boxShadow: "0 1px 3px rgba(0,0,0,0.05)"
                }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "#1f2937", marginBottom: 12 }}>
                        正文 <span style={{ color: "#9ca3af", fontWeight: 400 }}>(1-5000 字)</span>
                    </div>
                    <textarea
                        value={newPostContent}
                        onChange={e => setNewPostContent(e.target.value)}
                        placeholder="请输入帖子内容..."
                        maxLength={5000}
                        style={{
                            width: "100%",
                            padding: 12,
                            border: "1px solid #e5e7eb",
                            borderRadius: 10,
                            fontSize: 14,
                            resize: "none",
                            height: 200,
                            outline: "none",
                            boxSizing: "border-box",
                            lineHeight: 1.6
                        }}
                    />
                    <div style={{ fontSize: 12, color: "#9ca3af", textAlign: "right", marginTop: 6 }}>
                        {newPostContent.length}/5000
                    </div>
                </div>

                {/* 提示 */}
                <div style={{
                    background: "#fff7ed",
                    borderRadius: 12,
                    padding: 14,
                    marginTop: 12,
                    fontSize: 12,
                    color: "#f97316",
                    lineHeight: 1.6
                }}>
                    💡 发帖须知：
                    <ul style={{ margin: "8px 0 0 20px", padding: 0 }}>
                        <li>普通用户每天最多发 3 帖</li>
                        <li>新用户前 3 条帖子需审核后发布</li>
                        <li>禁止发布广告、人身攻击等内容</li>
                        <li>违规帖子将被删除或隐藏</li>
                    </ul>
                </div>
            </div>

            {/* 底部发布按钮 */}
            <div style={{ padding: "12px 16px", background: "#fff", borderTop: "1px solid #f0f0f0" }}>
                <button
                    onClick={handleCreatePost}
                    disabled={!newPostTitle.trim() || !newPostContent.trim() || !newPostSection || isLoading}
                    style={{
                        width: "100%",
                        padding: 14,
                        background: (!newPostTitle.trim() || !newPostContent.trim() || !newPostSection || isLoading)
                            ? "#d1d5db"
                            : "linear-gradient(135deg, #f97316 0%, #fb923c 100%)",
                        color: "#fff",
                        border: "none",
                        borderRadius: 12,
                        fontSize: 15,
                        fontWeight: 600,
                        cursor: (!newPostTitle.trim() || !newPostContent.trim() || !newPostSection || isLoading) ? "not-allowed" : "pointer"
                    }}>{isLoading ? "发布中…" : "发布帖子"}</button>
            </div>
        </div>
    );

    // ============ 渲染：搜索页面 ============
    const renderSearch = () => {
        const results = searchQuery ? getSearchResults() : [];

        return (
            <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "#f5f5f5" }}>
                {/* 顶部标题栏 */}
                <div style={{
                    background: "linear-gradient(135deg, #f97316 0%, #fb923c 100%)",
                    padding: "16px 20px",
                    color: "#fff",
                    display: "flex",
                    alignItems: "center",
                    gap: 12
                }}>
                    <button
                        onClick={() => setView("sections")}
                        style={{
                            background: "rgba(255,255,255,0.2)",
                            border: "none",
                            color: "#fff",
                            width: 32,
                            height: 32,
                            borderRadius: 8,
                            fontSize: 18,
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center"
                        }}>←</button>
                    <div style={{ flex: 1, fontSize: 18, fontWeight: 700 }}>搜索</div>
                </div>

                {/* 搜索框 */}
                <div style={{
                    background: "#fff",
                    padding: "12px 16px",
                    borderBottom: "1px solid #f0f0f0"
                }}>
                    <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            placeholder="搜索帖子或用户..."
                            style={{
                                flex: 1,
                                padding: "10px 14px",
                                border: "1px solid #e5e7eb",
                                borderRadius: 20,
                                fontSize: 14,
                                outline: "none"
                            }}
                        />
                        <button
                            onClick={() => setSearchQuery("")}
                            style={{
                                padding: "10px 16px",
                                background: "#f5f5f5",
                                color: "#666",
                                border: "none",
                                borderRadius: 20,
                                fontSize: 14,
                                cursor: "pointer"
                            }}>清除</button>
                    </div>

                    {/* 搜索类型 */}
                    <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                        <button
                            onClick={() => setSearchType("post")}
                            style={{
                                flex: 1,
                                padding: "8px 14px",
                                background: searchType === "post" ? "#f97316" : "#f5f5f5",
                                color: searchType === "post" ? "#fff" : "#666",
                                border: "none",
                                borderRadius: 16,
                                fontSize: 13,
                                cursor: "pointer"
                            }}> 搜帖子</button>
                        <button
                            onClick={() => setSearchType("user")}
                            style={{
                                flex: 1,
                                padding: "8px 14px",
                                background: searchType === "user" ? "#f97316" : "#f5f5f5",
                                color: searchType === "user" ? "#fff" : "#666",
                                border: "none",
                                borderRadius: 16,
                                fontSize: 13,
                                cursor: "pointer"
                            }}>👤 搜用户</button>
                    </div>

                    {/* 筛选条件 */}
                    <div style={{ display: "flex", gap: 8, overflowX: "auto" }}>
                        <select
                            value={searchFilter.section}
                            onChange={e => setSearchFilter({ ...searchFilter, section: e.target.value })}
                            style={{
                                padding: "6px 12px",
                                border: "1px solid #e5e7eb",
                                borderRadius: 16,
                                fontSize: 12,
                                outline: "none",
                                background: "#fff"
                            }}>
                            <option value="all">全部板块</option>
                            {sections.map(s => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                        </select>
                        <label style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            padding: "6px 12px",
                            background: searchFilter.essenceOnly ? "#fff7ed" : "#f5f5f5",
                            borderRadius: 16,
                            fontSize: 12,
                            cursor: "pointer"
                        }}>
                            <input
                                type="checkbox"
                                checked={searchFilter.essenceOnly}
                                onChange={e => setSearchFilter({ ...searchFilter, essenceOnly: e.target.checked })}
                                style={{ accentColor: "#f97316" }}
                            />
                            <span style={{ color: searchFilter.essenceOnly ? "#f97316" : "#666" }}>仅精华</span>
                        </label>
                    </div>
                </div>

                {/* 搜索结果 */}
                <div style={{ flex: 1, overflow: "auto", padding: 16 }}>
                    {searchQuery && results.length === 0 ? (
                        <div style={{ textAlign: "center", padding: 40, color: "#9ca3af" }}>
                            <div style={{ fontSize: 48, marginBottom: 12 }}>🔍</div>
                            <div style={{ fontSize: 14 }}>未找到相关内容</div>
                        </div>
                    ) : (
                        results.map(post => (
                            <div
                                key={post.id}
                                onClick={async () => {
                                    incrementViewCount(post.id);
                                    setView("postDetail");
                                    const fresh = await fetchForumPostDetail(post.id);
                                    setCurrentPost(fresh || post);
                                }}
                                style={{
                                    background: "#fff",
                                    borderRadius: 12,
                                    padding: 16,
                                    marginBottom: 12,
                                    cursor: "pointer",
                                    boxShadow: "0 1px 3px rgba(0,0,0,0.05)"
                                }}>
                                <div style={{ fontSize: 15, fontWeight: 600, color: "#1f2937", marginBottom: 8, lineHeight: 1.4 }}>
                                    {post.isPinned && <span style={{ color: "#f97316", marginRight: 6 }}>📌</span>}
                                    {post.isEssence && <span style={{ color: "#f59e0b", marginRight: 6 }}>⭐</span>}
                                    {post.title}
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                                    <Avatar url={post.avatarUrl} fallback={post.authorAvatar} size={32}
                                      onClick={onViewUserProfile && post.authorId ? () => onViewUserProfile?.(post.author) : undefined} />
                                    <span
                                      style={{ fontSize: 13, color: "#6b7280", fontWeight: 500, cursor: onViewUserProfile ? "pointer" : "default" }}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onViewUserProfile?.(post.author);
                                      }}
                                    >{post.author}</span>
                                    <span style={{ fontSize: 12, color: "#d1d5db" }}>·</span>
                                    <span style={{ fontSize: 12, color: "#9ca3af" }}>{getSection(post.section)?.name}</span>
                                </div>
                                <div style={{
                                    fontSize: 13,
                                    color: "#6b7280",
                                    lineHeight: 1.5,
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    display: "-webkit-box",
                                    WebkitLineClamp: 2,
                                    WebkitBoxOrient: "vertical"
                                }}>{post.content}</div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        );
    };

    // ============ 渲染：通知列表 ==========
    const renderMessages = () => {
        const isTab = mainTab === "messages";
        const filteredNotifs = notifications.filter((n) => {
            if (notifFilter === "like") return n.type === "like";
            if (notifFilter === "comment") return n.type === "reply" || n.type === "sub_reply";
            return true;
        });
        const typeMapAll: Record<string, { icon: string; text: string }> = {
            reply: { icon: "💬", text: "回复了你的帖子" },
            sub_reply: { icon: "💬", text: "回复了你的评论" },
            like: { icon: "❤️", text: "赞了你的帖子" },
            favorite: { icon: "⭐", text: "收藏了你的帖子" },
            follow: { icon: "👤", text: "关注了你" },
        };
        return (
        <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "#f5f5f5" }}>
            <div style={{
                background: "linear-gradient(135deg, #f97316 0%, #fb923c 100%)",
                padding: "16px 20px", color: "#fff",
                display: "flex", alignItems: "center", gap: 12
            }}>
                {!isTab && (
                    <button
                        onClick={() => setView("sections")}
                        style={{
                            background: "rgba(255,255,255,0.2)", border: "none", color: "#fff",
                            width: 32, height: 32, borderRadius: 8, fontSize: 18, cursor: "pointer",
                            display: "flex", alignItems: "center", justifyContent: "center"
                        }}>←</button>
                )}
                <div style={{ flex: 1, fontSize: 16, fontWeight: 600 }}>消息</div>
                <button
                    onClick={async () => {
                        await forumApi("mark_all_notifications_read");
                        setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
                        refreshUnread();
                    }}
                    style={{
                        background: "rgba(255,255,255,0.25)", border: "1px solid rgba(255,255,255,0.4)",
                        borderRadius: 8, padding: "4px 10px", color: "#fff", fontSize: 13, cursor: "pointer"
                    }}>全部已读</button>
            </div>

            {/* 分类筛选：全部 / 赞 / 评论和@ */}
            <div style={{ background: "#fff", padding: "10px 16px", display: "flex", gap: 8, borderBottom: "1px solid #f0f0f0" }}>
                {[
                    { key: "all", label: "全部" },
                    { key: "like", label: "赞" },
                    { key: "comment", label: "评论" },
                ].map(item => (
                    <button key={item.key} onClick={() => setNotifFilter(item.key as any)} style={{
                        padding: "6px 16px",
                        background: notifFilter === item.key ? "#f97316" : "#f5f5f5",
                        color: notifFilter === item.key ? "#fff" : "#666",
                        border: "none", borderRadius: 16, fontSize: 13, fontWeight: 500, cursor: "pointer"
                    }}>{item.label}</button>
                ))}
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: 12 }}>
                {notifLoading ? (
                    <div style={{ textAlign: "center", padding: 30, color: "#9ca3af", fontSize: 13 }}>加载中...</div>
                ) : filteredNotifs.length === 0 ? (
                    <div style={{ textAlign: "center", padding: 40, color: "#9ca3af" }}>
                        <div style={{ fontSize: 36, marginBottom: 8 }}>🔔</div>
                        <div style={{ fontSize: 13 }}>
                            {notifFilter === "like" ? "还没有收到点赞" : notifFilter === "comment" ? "还没有收到评论" : "还没有任何消息"}
                        </div>
                    </div>
                ) : (
                    filteredNotifs.map((n) => {
                        const meta = typeMapAll[n.type] || { icon: "🔔", text: "有新的互动" };
                        const isFollow = n.type === "follow";
                        const tapNotif = async () => {
                            if (!n.is_read) {
                                await forumApi("mark_notification_read", { notificationId: n.id });
                                setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, is_read: true } : x));
                                refreshUnread();
                            }
                            if (isFollow) {
                                if (n.actor_username) viewUserByName(n.actor_username);
                            } else if (!n.post_deleted) {
                                openPostDetailFromId(n.post_id, mainTab === "messages" ? "notifications" : "notifications");
                            }
                        };
                        return (
                            <div
                                key={n.id}
                                onClick={tapNotif}
                                style={{
                                    display: "flex", gap: 10, padding: 12, marginBottom: 8,
                                    background: n.is_read ? "#fff" : "#fff7ed",
                                    borderRadius: 12, cursor: (isFollow || !n.post_deleted) ? "pointer" : "default",
                                    border: "1px solid #f0f0f0", opacity: (!isFollow && n.post_deleted) ? 0.6 : 1
                                }}>
                                <Avatar url={n.actor_avatar} fallback="🌽" size={40} />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 13, marginBottom: 3 }}>
                                        <span style={{ fontWeight: 600, color: "#1f2937" }}>{n.actor_name}</span>
                                        <span style={{ color: "#6b7280" }}> {meta.icon} {meta.text}</span>
                                    </div>
                                    {!isFollow && (
                                    <div style={{
                                        fontSize: 13, color: "#374151", marginBottom: 3,
                                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
                                    }}>《{n.post_title}》</div>
                                    )}
                                    {n.content && (
                                        <div style={{ fontSize: 12, color: "#6b7280", lineHeight: 1.5 }}>{n.content}</div>
                                    )}
                                    <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 3 }}>
                                        {new Date(n.created_at).toLocaleString("zh-CN")}
                                    </div>
                                </div>
                                {!n.is_read && (
                                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#f97316", marginTop: 6, flexShrink: 0 }} />
                                )}
                            </div>
                        );
                    })
                )}
            </div>
        </div>
        );
    };

    // ============ 渲染：我（论坛内主页栈） ============
    const renderMe = () => {
        const current = profileChain[profileChain.length - 1] || loginUsername;
        const isSelf = !current || current === loginUsername;
        return (
            <UserProfileApp
                key={current + ":" + profileChain.length}
                username={current}
                isSelf={isSelf}
                embedded
                onOpenPost={async (postId) => {
                    setDetailReturnView("notifications");
                    const fresh = await fetchForumPostDetail(postId);
                    if (fresh) {
                        setCurrentPost(fresh);
                        setView("postDetail");
                    }
                }}
                onOpenUser={(u) => viewUserByName(u)}
            />
        );
    };

    const showBottomBar = view === "messages" || view === "me" || view === "sections" || view === "notifications";

    const renderBottomBar = () => (
        <div style={{
            position: "absolute",
            left: 0, right: 0, bottom: 0,
            height: 56,
            background: "#fff",
            borderTop: "1px solid #f0f0f0",
            display: "flex",
            zIndex: 50,
        }}>
            {([
                { key: "home", label: "首页", icon: "🏠" },
                { key: "messages", label: "消息", icon: "💬", badge: unreadCount },
                { key: "me", label: "我", icon: "👤" },
            ] as const).map(t => {
                const active = mainTab === t.key;
                return (
                    <button key={t.key} onClick={() => goMainTab(t.key)} style={{
                        flex: 1, border: "none", background: "none", cursor: "pointer",
                        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                        gap: 2, position: "relative",
                        color: active ? "#f97316" : "#9ca3af",
                    }}>
                        <span style={{ fontSize: 20, lineHeight: 1 }}>{t.icon}</span>
                        <span style={{ fontSize: 11, fontWeight: active ? 600 : 400 }}>{t.label}</span>
                        {t.key === "messages" && t.badge > 0 && (
                            <span style={{
                                position: "absolute", top: 4, right: "calc(50% - 22px)",
                                background: "#ef4444", color: "#fff", fontSize: 9, fontWeight: 700,
                                minWidth: 15, height: 15, borderRadius: 8,
                                display: "flex", alignItems: "center", justifyContent: "center",
                                padding: "0 4px"
                            }}>{t.badge > 99 ? "99+" : t.badge}</span>
                        )}
                    </button>
                );
            })}
        </div>
    );

    // ============ 主渲染 ============
    const content = (() => {
        switch (view) {
            case "sections":
                return renderSections();
            case "posts":
                return renderPosts();
            case "postDetail":
                return renderPostDetail();
            case "newPost":
                return renderNewPost();
            case "search":
                return renderSearch();
            case "notifications":
                return renderMessages();
            case "messages":
                return renderMessages();
            case "me":
                return renderMe();
            default:
                return renderSections();
        }
    })();

    return (
        <>
            {content}
            {showBottomBar && renderBottomBar()}
            {apiError && (
                <div
                    onClick={() => setApiError(null)}
                    style={{
                        position: "fixed",
                        left: 16,
                        right: 16,
                        bottom: 24,
                        zIndex: 3000,
                        background: "rgba(220,38,38,0.96)",
                        color: "#fff",
                        padding: "12px 14px",
                        borderRadius: 10,
                        fontSize: 13,
                        lineHeight: 1.5,
                        boxShadow: "0 6px 20px rgba(0,0,0,0.25)",
                        cursor: "pointer",
                        wordBreak: "break-word",
                    }}>
                    ⚠️ {apiError}（点击关闭）
                </div>
            )}
        </>
    );
}
