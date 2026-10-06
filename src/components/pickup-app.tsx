import { useState, useEffect, useCallback, } from "react";

// ============================================================
// 米米请就位（pickup）演绎楼 App
// 独立小手机 App，从主页/应用商店打开
// ============================================================

const API = "/api/pickup";
const PER_PAGE = 20;

interface User {
  id: string;
  name: string;
  username: string;
  emoji?: string;
  avatar?: string;
  isAdmin?: boolean;
}

interface Post {
  id: string;
  owner_id: string;
  owner_username: string;
  owner_display: string;
  owner_emoji: string;
  title: string;
  content: string;
  tag_ids: string[];
  pickup_tags?: { id: string; name: string }[];
  identity_required: boolean;
  host_label: string;
  replies_count: number;
  likes_count: number;
  created_at: string;
}

interface Reply {
  id: string;
  post_id: string;
  author_id: string;
  author_username: string;
  author_display: string;
  author_emoji: string;
  floor_no: number;
  content: string;
  likes_count: number;
  sub_replies_count: number;
  has_host_reply: boolean;
  created_at: string;
}

interface SubReply {
  id: string;
  reply_id: string;
  author_id: string;
  author_username: string;
  author_display: string;
  author_emoji: string;
  reply_to_username?: string;
  reply_to_display?: string;
  content: string;
  is_host_reply: boolean;
  likes_count: number;
  created_at: string;
}

interface Tag {
  id: string;
  name: string;
  use_count: number;
  approved: boolean;
}

interface Identity {
  id: string;
  display_name: string;
  emoji: string;
}

interface Notification {
  id: string;
  userId: string;
  type: string;
  title: string;
  content: string;
  relatedPostId: string | null;
  relatedReplyId: string | null;
  extra: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
}

const NOTIF_ICON: Record<string, string> = {
  reply: '💬', mention: '@', report_result: '⚖️',
  admin_action: '🛡️', system_announce: '📢', admin_custom: '✉️', version: '🎉',
};

const NOTIF_API = "/api/notifications";

async function notifGet(params: string, authToken: string): Promise<any> {
  const r = await fetch(`${NOTIF_API}?${params}`, {
    headers: { Authorization: `Bearer ${authToken}` },
  });
  return r.json();
}

async function notifPost(body: unknown, authToken: string): Promise<any> {
  const r = await fetch(NOTIF_API, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
    body: JSON.stringify(body),
  });
  return r.json();
}

// ============================================================
// API 调用
// ============================================================
async function apiGet(action: string, params: Record<string, string> = {}, token?: string): Promise<any> {
  const qs = new URLSearchParams({ action, ...params });
  if (token) qs.set("token", token);
  const r = await fetch(`${API}?${qs}`);
  return r.json();
}

async function apiPost(body: any): Promise<any> {
  const r = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return r.json();
}

function timeAgo(ts: string): string {
  const d = new Date(ts);
  const now = new Date();
  const diff = (now.getTime() - d.getTime()) / 1000;
  if (diff < 60) return "刚刚";
  if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}天前`;
  return `${d.getMonth() + 1}-${d.getDate()}`;
}

// ============================================================
// 主组件
// ============================================================
export function PickupApp({ onClose, loginUsername }: { onClose: () => void; loginUsername: string }) {
    const token = typeof window !== "undefined" ? localStorage.getItem("auth_token") || "" : "";
    const [me, setMe] = useState<{ name: string; emoji: string }>({ name: loginUsername, emoji: "🐰" });
    const [myId, setMyId] = useState<string>("");
    const [localTagNames, setLocalTagNames] = useState<Record<string, string>>({});
    const user: User = { id: "", name: me.name, username: loginUsername, emoji: me.emoji };
    const onBack = onClose;

    // 启动时拉自己的论坛昵称
    useEffect(() => {
        (async () => {
            try {
                const res = await fetch("/api/auth", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "get_profile", username: loginUsername }),
                });
                const json = await res.json();
                if (json.success && json.profile) {
                    setMe({
                        name: json.profile.displayName || loginUsername,
                        emoji: json.profile.emoji || "🐰",
                    });
                    if (json.profile.id) setMyId(json.profile.id);
                }
            } catch { /* ignore */ }
        })();
    }, [loginUsername]);
  type View =
    | { kind: "home" }
    | { kind: "post"; post: Post }
    | { kind: "replyPage"; post: Post; reply: Reply }
    | { kind: "create" }
    | { kind: "notif" };

  const [view, setView] = useState<View>({ kind: "home" });
  const [posts, setPosts] = useState<Post[]>([]);
  const [postsPage, setPostsPage] = useState(1);
  const [postsTotal, setPostsTotal] = useState(0);
  const [sort, setSort] = useState<"heat" | "new">("new");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [replySort, setReplySort] = useState<"floor" | "heat" | "floor_desc">("floor");
  const [replies, setReplies] = useState<Reply[]>([]);
  const [repliesPage, setRepliesPage] = useState(1);
  const [repliesTotal, setRepliesTotal] = useState(0);
  const [subReplies, setSubReplies] = useState<SubReply[]>([]);
  const [subRepliesPage, setSubRepliesPage] = useState(1);
  const [subRepliesTotal, setSubRepliesTotal] = useState(0);
  const [tags, setTags] = useState<Tag[]>([]);
  const [, setIdentity] = useState<Identity | null>(null);
  const [loading, setLoading] = useState(false);
  const [homeNotice, setHomeNotice] = useState("");

  // 回复输入
  const [replyText, setReplyText] = useState("");
  const [replyTo, setReplyTo] = useState<{ username: string; display: string } | null>(null);
  const [subReplyText, setSubReplyText] = useState("");

  // 开楼
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newTagIds, setNewTagIds] = useState<string[]>([]);
  const [newIdentityRequired, setNewIdentityRequired] = useState(true);
  const [newHostLabel, setNewHostLabel] = useState("");
  const [, ] = useState("🐰");
  const [, ] = useState("");

  // 首次回复身份弹层
  const [showIdentitySheet, setShowIdentitySheet] = useState(false);
  const [, setPendingReplyText] = useState("");
  const [pendingIdentityName, setPendingIdentityName] = useState("");
  const [pendingIdentityEmoji, setPendingIdentityEmoji] = useState("🐰");
  const [useAccountName, setUseAccountName] = useState(false);

  // 举报
  const [showReportSheet, setShowReportSheet] = useState(false);
  const [reportTarget, setReportTarget] = useState<{ type: string; id: string; postId?: string; replyId?: string; floorNo?: number } | null>(null);
  const [reportReason, setReportReason] = useState("");
  const [reportDesc, setReportDesc] = useState("");

  // 标签搜索/创建
  const [showTagSearch, setShowTagSearch] = useState(false);
  // 开楼页标签选择弹层
  const [showCreateTagPicker, setShowCreateTagPicker] = useState(false);
  const [createTagQ, setCreateTagQ] = useState("");
  const [createTagResults, setCreateTagResults] = useState<Tag[]>([]);
  const [creatingTag, setCreatingTag] = useState(false);
  const [tagSearchQ, setTagSearchQ] = useState("");
  const [tagSearchResults, setTagSearchResults] = useState<Tag[]>([]);

  // 我的帖子（推米）
  const [myPosts, setMyPosts] = useState<Post[]>([]);
  const [showMyPosts, setShowMyPosts] = useState(false);

  // 通知中心
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [notifPage, setNotifPage] = useState(1);
  const [notifTotal, setNotifTotal] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifTab, setNotifTab] = useState<"all" | "unread">("all");
  const [notifError, setNotifError] = useState("");
  const [showNotifSend, setShowNotifSend] = useState(false);
  const [notifSendTarget, setNotifSendTarget] = useState("");
  const [notifSendTitle, setNotifSendTitle] = useState("");
  const [notifSendContent, setNotifSendContent] = useState("");
  const [notifSendType, setNotifSendType] = useState("admin_custom");
  // TODO: 暂时用空列表判断管理员，后续从后端 user.isAdmin 获取
  const ADMIN_USERNAMES: string[] = [];
  const isAdmin = user.isAdmin || ADMIN_USERNAMES.includes(user.username);

  // -------- 加载广场 --------
  const loadPosts = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(page), sort };
      if (selectedTag) params.tag = selectedTag;
      if (searchKeyword) params.keyword = searchKeyword;
      const res = await apiGet("list", params, token);
      if (res.success) {
        setPosts(res.posts || []);
        setPostsTotal(res.total || 0);
        setPostsPage(page);
      }
    } finally {
      setLoading(false);
    }
  }, [sort, selectedTag, searchKeyword, token]);

  useEffect(() => { loadPosts(1); }, [loadPosts]);

  // -------- 加载回复 --------
  const loadReplies = useCallback(async (postId: string, page = 1) => {
    setLoading(true);
    try {
      const res = await apiGet("replies", { postId, page: String(page), sort: replySort }, token);
      if (res.success) {
        setReplies(res.replies || []);
        setRepliesTotal(res.total || 0);
        setRepliesPage(page);
      }
    } finally {
      setLoading(false);
    }
  }, [replySort, token]);

  // -------- 加载子回复 --------
  const loadSubReplies = useCallback(async (replyId: string, page = 1) => {
    setLoading(true);
    try {
      const res = await apiGet("sub_replies", { replyId, page: String(page) }, token);
      if (res.success) {
        setSubReplies(res.subReplies || []);
        setSubRepliesTotal(res.total || 0);
        setSubRepliesPage(page);
      }
    } finally {
      setLoading(false);
    }
  }, [token]);

  // -------- 加载标签 --------
  useEffect(() => {
    apiGet("tags", {}, token).then((res) => {
      if (res.success) setTags(res.tags || []);
    });
  }, [token]);

  // -------- 通知轮询 --------
  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await notifGet("action=unread_count", token);
      if (res.success) {
        setUnreadCount(res.count ?? 0);
      } else if (res.code === "TABLE_NOT_FOUND") {
        setNotifError("通知功能暂未开启，请联系管理员初始化数据库");
      }
    } catch { /* ignore */ }
  }, [token]);

  useEffect(() => {
    fetchUnreadCount();
    const timer = setInterval(fetchUnreadCount, 30000);
    return () => clearInterval(timer);
  }, [fetchUnreadCount]);

  // -------- 加载身份 --------
  const loadIdentity = useCallback(async (postId: string) => {
    const res = await apiGet("identity", { postId }, token);
    if (res.success) setIdentity(res.identity || null);
  }, [token]);

  // -------- 开楼 --------
  const handleCreatePost = async () => {
    if (!newTitle.trim()) return alert("请填写标题");
    if (!newContent.trim()) return alert("请填写内容");
    setLoading(true);
    try {
      const res = await apiPost({
        action: "create_post",
        token,
        title: newTitle.trim(),
        content: newContent.trim(),
        tagIds: newTagIds,
        identityRequired: newIdentityRequired,
        hostLabel: newHostLabel || me.name,
      });
      if (res.success) {
        setNewTitle(""); setNewContent(""); setNewTagIds([]);
        if (res.pendingReview) {
          // 待审：回到广场，显示提示横幅
          setView({ kind: "home" });
          setHomeNotice("帖子已提交，等待管理员审核。通过后将公开展示。");
          loadPosts(1);
        } else {
          setView({ kind: "post", post: res.post });
          setHomeNotice("");
          loadPosts(1);
        }
      } else {
        alert(res.error);
      }
    } finally {
      setLoading(false);
    }
  };

  // -------- 楼层回复 --------
  const handleReply = async (forceIdentityName?: string, forceEmoji?: string) => {
    if (!(view.kind === "post")) return;
    if (!replyText.trim()) return;
    setLoading(true);
    try {
      const res = await apiPost({
        action: "create_reply",
        token,
        postId: view.post.id,
        content: replyText.trim(),
        identityName: forceIdentityName,
        identityEmoji: forceEmoji,
      });
      if (res.success) {
        setReplyText("");
        loadReplies(view.post.id, 1);
        // 刷新帖子信息
        const pg = await apiGet("get", { postId: view.post.id }, token);
        if (pg.success) setView({ kind: "post", post: pg.post });
      } else if (res.error && res.error.includes("演绎身份")) {
        setPendingReplyText(replyText);
        setShowIdentitySheet(true);
      } else {
        alert(res.error);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmIdentity = async () => {
    const name = useAccountName ? user.name : pendingIdentityName.trim();
    const emoji = useAccountName ? ((user.emoji || "🐰")) : pendingIdentityEmoji;
    if (!useAccountName && (!name || name.length < 2)) {
      return alert("角色名至少 2 字");
    }
    setShowIdentitySheet(false);
    setPendingReplyText("");
    setPendingIdentityName("");
    await handleReply(name, emoji);
  };

  // -------- 子回复 --------
  const handleSubReply = async () => {
    if (!(view.kind === "replyPage")) return;
    if (!subReplyText.trim()) return;
    setLoading(true);
    try {
      const res = await apiPost({
        action: "create_sub_reply",
        token,
        postId: view.post.id,
        replyId: view.reply.id,
        content: subReplyText.trim(),
        replyToUsername: replyTo?.username,
        replyToDisplay: replyTo?.display,
      });
      if (res.success) {
        setSubReplyText("");
        setReplyTo(null);
        loadSubReplies(view.reply.id, 1);
      } else if (res.error && res.error.includes("演绎身份")) {
        alert(res.error);
      } else {
        alert(res.error);
      }
    } finally {
      setLoading(false);
    }
  };

  // -------- 举报 --------
  const handleReport = async () => {
    if (!reportTarget || !reportReason.trim()) return alert("请选择举报理由");
    setLoading(true);
    try {
      const res = await apiPost({
        action: "report",
        token,
        targetType: reportTarget.type,
        targetId: reportTarget.id,
        postId: reportTarget.postId,
        replyId: reportTarget.replyId,
        floorNo: reportTarget.floorNo,
        reason: reportReason.trim(),
        description: reportDesc.trim(),
      });
      if (res.success) {
        alert("举报已提交，管理员将尽快处理");
        setShowReportSheet(false);
        setReportTarget(null); setReportReason(""); setReportDesc("");
      } else {
        alert(res.error);
      }
    } finally {
      setLoading(false);
    }
  };

  // -------- 标签搜索 --------
  const searchTags = async (q: string) => {
    if (!q.trim()) { setTagSearchResults([]); return; }
    const res = await apiGet("tags", { q: q.trim() }, token);
    if (res.success) setTagSearchResults(res.tags || []);
  };

  const createTag = async (name: string) => {
    const res = await apiPost({ action: "create_tag", token, name });
    if (res.success) {
      if (res.exists) {
        alert("标签已存在");
      } else {
        alert("标签已提交，等待管理员审核");
      }
      searchTags(tagSearchQ);
    }
  };

  // -------- 我的帖子（推米） --------
  const loadMyPosts = async () => {
    const res = await apiGet("my_posts", {}, token);
    if (res.success) {
      setMyPosts(res.posts || []);
      setShowMyPosts(true);
    }
  };

  // -------- 通知中心 --------
  const loadNotifs = useCallback(async (page = 1) => {
    setNotifError("");
    const params = new URLSearchParams({ action: "list", page: String(page), pageSize: "20" });
    if (notifTab === "unread") params.set("type", "unread_only");
    try {
      const res = await notifGet(params.toString(), token);
      if (res.success) {
        setNotifications(res.data || []);
        setNotifTotal(res.total || 0);
        setNotifPage(page);
      } else if (res.code === "TABLE_NOT_FOUND") {
        setNotifError("通知功能暂未开启，请联系管理员初始化数据库");
      }
    } catch { /* ignore */ }
  }, [token, notifTab]);

  useEffect(() => {
    if (view.kind === "notif") loadNotifs(1);
  }, [view, loadNotifs]);

  const handleMarkAllRead = async () => {
    await notifPost({ action: "mark_all_read" }, token);
    setUnreadCount(0);
    setNotifications((prev) => prev.map((n) => ({ ...n, readAt: n.readAt || new Date().toISOString() })));
  };

  const handleNotifClick = async (notif: Notification) => {
    if (!notif.readAt) {
      await notifPost({ action: "mark_read", ids: [notif.id] }, token);
      setUnreadCount((c) => Math.max(0, c - 1));
      setNotifications((prev) => prev.map((n) => n.id === notif.id ? { ...n, readAt: new Date().toISOString() } : n));
    }
    if (notif.relatedPostId) {
      try {
        const res = await apiGet("get", { postId: notif.relatedPostId }, token);
        if (res.success && res.post) {
          setView({ kind: "post", post: res.post });
          loadReplies(notif.relatedPostId, 1);
          return;
        }
      } catch { /* ignore */ }
    }
  };

  const handleAdminSend = async () => {
    if (!notifSendTitle.trim()) return alert("请填写标题");
    if (!notifSendContent.trim()) return alert("请填写内容");
    const body: Record<string, string> = {
      action: "admin_send",
      type: notifSendType,
      title: notifSendTitle.trim(),
      content: notifSendContent.trim(),
    };
    if (notifSendTarget.trim()) body.targetUserId = notifSendTarget.trim();
    const res = await notifPost(body, token);
    if (res.success) {
      alert("通知已发送");
      setShowNotifSend(false);
      setNotifSendTarget(""); setNotifSendTitle(""); setNotifSendContent("");
      loadNotifs(1);
    } else {
      alert(res.error || "发送失败");
    }
  };

  // ============================================================
  // 渲染
  // ============================================================

  // --- 广场 ---
  if (view.kind === "home") {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#f7f9f9" }}>
        {/* 顶栏 */}
        <div style={{ padding: "12px 16px", background: "#fff", borderBottom: "1px solid #eff3f4", display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={onBack} style={{ fontSize: 22, background: "none", border: "none", color: "#0f1419", cursor: "pointer" }}>‹</button>
          <div style={{ flex: 1, fontSize: 18, fontWeight: 800, color: "#f91880" }}>米米请就位</div>
          <button onClick={() => setView({ kind: "notif" })} style={{ position: "relative", background: "none", border: "none", fontSize: 20, cursor: "pointer", padding: "4px 6px" }}>
            🔔
            {unreadCount > 0 && <span style={{ position: "absolute", top: -2, right: -4, background: "#ef4444", color: "#fff", fontSize: 10, fontWeight: 700, borderRadius: "50%", minWidth: 16, height: 16, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px" }}>{unreadCount > 99 ? "99+" : unreadCount}</span>}
          </button>
          <button onClick={() => setView({ kind: "create" })} style={{ background: "#f91880", color: "#fff", border: "none", borderRadius: 18, padding: "6px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>+ 开楼</button>
        </div>

        {/* 全局提示横幅 */}
        {homeNotice && (
          <div style={{ margin: "10px 14px 0", padding: "10px 12px", background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 12, color: "#9a3412", fontSize: 12, display: "flex", alignItems: "center", gap: 8 }}>
            <span>⏳</span>
            <span style={{ flex: 1 }}>{homeNotice}</span>
            <button onClick={() => setHomeNotice("")} style={{ background: "none", border: "none", color: "#9a3412", cursor: "pointer", fontSize: 14, padding: 0 }}>×</button>
          </div>
        )}

        {/* 搜索 + 排序 */}
        <div style={{ padding: "10px 16px", background: "#fff", display: "flex", gap: 8, alignItems: "center" }}>
          <input
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && loadPosts(1)}
            placeholder="搜索帖子..."
            style={{ flex: 1, background: "#eef1f3", border: "none", borderRadius: 18, padding: "8px 14px", fontSize: 13, outline: "none" }}
          />
          <button onClick={() => setSort(sort === "heat" ? "new" : "heat")} style={{ fontSize: 12, color: "#536471", background: "#eef1f3", border: "none", borderRadius: 12, padding: "6px 10px" }}>
            {sort === "heat" ? "🔥 热度" : "🕐 最新"}
          </button>
          <button onClick={loadMyPosts} style={{ fontSize: 12, color: "#f91880", background: "#fff0f6", border: "none", borderRadius: 12, padding: "6px 10px", fontWeight: 600 }}>
            🌽 推米
          </button>
        </div>

        {/* 标签条 */}
        <div style={{ padding: "8px 16px", background: "#fff", borderBottom: "1px solid #eff3f4", display: "flex", gap: 6, overflowX: "auto" }}>
          <button
            onClick={() => { setSelectedTag(null); loadPosts(1); }}
            style={{ fontSize: 12, padding: "4px 12px", borderRadius: 12, border: "none", background: !selectedTag ? "#f91880" : "#eef1f3", color: !selectedTag ? "#fff" : "#536471", fontWeight: !selectedTag ? 600 : 400, whiteSpace: "nowrap", cursor: "pointer" }}
          >全部</button>
          {tags.map((t) => (
            <button
              key={t.id}
              onClick={() => { setSelectedTag(t.id); loadPosts(1); }}
              style={{ fontSize: 12, padding: "4px 12px", borderRadius: 12, border: "none", background: selectedTag === t.id ? "#f91880" : "#eef1f3", color: selectedTag === t.id ? "#fff" : "#536471", fontWeight: selectedTag === t.id ? 600 : 400, whiteSpace: "nowrap", cursor: "pointer" }}
            >{t.name}</button>
          ))}
          <button onClick={() => setShowTagSearch(true)} style={{ fontSize: 12, padding: "4px 12px", borderRadius: 12, border: "none", background: "#e8f5fe", color: "#1d9bf0", whiteSpace: "nowrap", cursor: "pointer" }}>搜索/自建标签</button>
        </div>

        {/* 帖子列表 */}
        <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
          {loading ? (
            <div style={{ textAlign: "center", padding: 40, color: "#536471" }}>加载中...</div>
          ) : posts.length === 0 ? (
            <div style={{ textAlign: "center", padding: 60, color: "#536471" }}>还没有楼，快来开一栋！</div>
          ) : posts.map((p) => (
            <div
              key={p.id}
              onClick={() => { setView({ kind: "post", post: p }); loadReplies(p.id, 1); }}
              style={{ padding: "14px 16px", background: "#fff", borderBottom: "1px solid #eff3f4", cursor: "pointer" }}
            >
              <div style={{ display: "flex", gap: 10 }}>
                <div style={{ width: 40, height: 40, borderRadius: "50%", background: "#ffe4ec", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>{p.owner_emoji || "🐰"}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#0f1419" }}>{p.owner_display}</div>
                  <div style={{ fontSize: 11, color: "#8899a6", marginTop: 1 }}>{timeAgo(p.created_at)}</div>
                </div>
                <div style={{ display: "flex", gap: 16, fontSize: 12, color: "#8899a6", flexShrink: 0 }}>
                  <span>♡ {p.likes_count}</span>
                  <span>💬 {p.replies_count}</span>
                </div>
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#0f1419", marginTop: 8, lineHeight: 1.4 }}>{p.title}</div>
              <div style={{ fontSize: 13, color: "#536471", marginTop: 4, lineHeight: 1.5, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{p.content}</div>
              {p.pickup_tags && p.pickup_tags.length > 0 && (
                <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                  {p.pickup_tags.map((t) => <span key={t.id} style={{ fontSize: 11, color: "#1d9bf0", background: "#e8f5fe", padding: "2px 8px", borderRadius: 10 }}>{t.name}</span>)}
                </div>
              )}
            </div>
          ))}
          {postsTotal > PER_PAGE && (
            <div style={{ display: "flex", justifyContent: "center", gap: 16, padding: 14, fontSize: 13, color: "#536471" }}>
              {postsPage > 1 && <button onClick={() => loadPosts(postsPage - 1)} style={{ background: "none", border: "none", color: "#1d9bf0", cursor: "pointer" }}>‹ 上一页</button>}
              <span style={{ color: "#f91880", fontWeight: 700 }}>{postsPage}</span>
              {postsPage * PER_PAGE < postsTotal && <button onClick={() => loadPosts(postsPage + 1)} style={{ background: "none", border: "none", color: "#1d9bf0", cursor: "pointer" }}>下一页 ›</button>}
            </div>
          )}
        </div>

        {/* 推米弹层 */}
        {showMyPosts && (
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.3)", zIndex: 100, display: "flex", flexDirection: "column" }}>
            <div style={{ background: "#fff", borderRadius: "16px 16px 0 0", maxHeight: "80%", overflowY: "auto", marginTop: "auto" }}>
              <div style={{ padding: "14px 16px", borderBottom: "1px solid #eff3f4", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 16, fontWeight: 700 }}>🌽 我的推米</span>
                <button onClick={() => setShowMyPosts(false)} style={{ fontSize: 20, background: "none", border: "none", cursor: "pointer" }}>×</button>
              </div>
              {myPosts.length === 0 ? (
                <div style={{ padding: 40, textAlign: "center", color: "#536471" }}>你还没有开过楼</div>
              ) : myPosts.map((p) => (
                <div key={p.id} onClick={() => { setShowMyPosts(false); setView({ kind: "post", post: p }); loadReplies(p.id, 1); }} style={{ padding: "12px 16px", borderBottom: "1px solid #eff3f4", cursor: "pointer" }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#0f1419" }}>{p.title}</div>
                  <div style={{ fontSize: 11, color: "#8899a6", marginTop: 4 }}>{timeAgo(p.created_at)} · {p.replies_count} 回复</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 标签搜索弹层 */}
        {showTagSearch && (
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.3)", zIndex: 100, display: "flex", flexDirection: "column" }}>
            <div style={{ background: "#fff", borderRadius: "16px 16px 0 0", maxHeight: "80%", overflowY: "auto", marginTop: "auto" }}>
              <div style={{ padding: "14px 16px", borderBottom: "1px solid #eff3f4", display: "flex", alignItems: "center", gap: 10 }}>
                <button onClick={() => setShowTagSearch(false)} style={{ fontSize: 20, background: "none", border: "none", cursor: "pointer" }}>×</button>
                <input
                  value={tagSearchQ}
                  onChange={(e) => { setTagSearchQ(e.target.value); searchTags(e.target.value); }}
                  placeholder="搜索标签..."
                  style={{ flex: 1, background: "#eef1f3", border: "none", borderRadius: 16, padding: "8px 14px", fontSize: 13, outline: "none" }}
                />
              </div>
              <div style={{ padding: "8px 16px" }}>
                <div style={{ fontSize: 12, color: "#536471", marginBottom: 8 }}>搜索结果</div>
                {tagSearchResults.map((t) => (
                  <div key={t.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #f5f8fa" }}>
                    <span style={{ fontSize: 13, color: "#1d9bf0" }}>{t.name}</span>
                    <span style={{ fontSize: 11, color: "#8899a6" }}>{t.use_count} 栋</span>
                  </div>
                ))}
                {tagSearchQ.trim() && !tagSearchResults.find((t) => t.name === (tagSearchQ.startsWith("#") ? tagSearchQ : `#${tagSearchQ}`)) && (
                  <button onClick={() => createTag(tagSearchQ)} style={{ marginTop: 12, width: "100%", background: "#f91880", color: "#fff", border: "none", borderRadius: 20, padding: "10px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
                    创建标签「{tagSearchQ.startsWith("#") ? tagSearchQ : `#${tagSearchQ}`}」
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // --- 开楼页 ---
  if (view.kind === "create") {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#f7f9f9" }}>
        <div style={{ padding: "12px 16px", background: "#fff", borderBottom: "1px solid #eff3f4", display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={() => setView({ kind: "home" })} style={{ fontSize: 22, background: "none", border: "none", color: "#0f1419", cursor: "pointer" }}>‹</button>
          <div style={{ flex: 1, fontSize: 16, fontWeight: 700 }}>开楼</div>
          <button onClick={handleCreatePost} disabled={loading} style={{ background: "#f91880", color: "#fff", border: "none", borderRadius: 18, padding: "6px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: loading ? 0.6 : 1 }}>发布</button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
          {/* 身份预览 */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <div style={{ width: 44, height: 44, borderRadius: "50%", background: "#ffe4ec", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>{(user.emoji || "🐰")}</div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{user.name} <span style={{ background: "#f91880", color: "#fff", fontSize: 10, padding: "1px 6px", borderRadius: 4, fontWeight: 600 }}>楼主</span></div>
              <div style={{ fontSize: 11, color: "#8899a6" }}>你将作为楼主发帖</div>
            </div>
          </div>

          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="标题（最多 50 字）"
            maxLength={50}
            style={{ width: "100%", border: "1px solid #eff3f4", borderRadius: 12, padding: "12px 14px", fontSize: 15, fontWeight: 700, outline: "none", boxSizing: "border-box", marginBottom: 12 }}
          />
          <textarea
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            placeholder="首楼内容..."
            maxLength={20000}
            style={{ width: "100%", border: "1px solid #eff3f4", borderRadius: 12, padding: "12px 14px", fontSize: 14, outline: "none", minHeight: 160, resize: "vertical", boxSizing: "border-box", marginBottom: 12, lineHeight: 1.6 }}
          />

          {/* 标签 */}
          <div style={{ marginBottom: 12, background: "#fff", borderRadius: 12, padding: 14, border: "1px solid #eff3f4" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>标签 {newTagIds.length > 0 && <span style={{ color: "#f91880" }}>（已选 {newTagIds.length}）</span>}</span>
              <button
                onClick={() => { setCreateTagQ(""); setCreateTagResults([]); setShowCreateTagPicker(true); }}
                style={{ fontSize: 12, padding: "5px 12px", borderRadius: 14, border: "none", background: "#f91880", color: "#fff", fontWeight: 600, cursor: "pointer" }}
              >＋ 选择标签</button>
            </div>
            {newTagIds.length === 0 ? (
              <div style={{ fontSize: 12, color: "#8899a6" }}>暂未选择标签，点击右上角选择或自建（自建需审核，你本人可立即使用）</div>
            ) : (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {newTagIds.map((id) => {
                  const t = tags.find((x) => x.id === id);
                  return (
                    <span key={id} style={{ fontSize: 12, padding: "4px 6px 4px 12px", borderRadius: 12, background: "#ffe4ec", color: "#f91880", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 6 }}>
                      {t?.name || localTagNames[id] || "标签"}
                      <button onClick={() => setNewTagIds(newTagIds.filter((x) => x !== id))} style={{ background: "none", border: "none", color: "#f91880", cursor: "pointer", padding: 0, fontSize: 14, lineHeight: 1 }}>×</button>
                    </span>
                  );
                })}
              </div>
            )}
          </div>

          {/* 开楼页标签选择弹层 */}
          {showCreateTagPicker && (
            <div onClick={() => setShowCreateTagPicker(false)} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.4)", zIndex: 120, display: "flex" }}>
              <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: "18px 18px 0 0", maxHeight: "78%", width: "100%", marginTop: "auto", display: "flex", flexDirection: "column" }}>
                <div style={{ padding: "14px 16px", borderBottom: "1px solid #eff3f4", display: "flex", alignItems: "center", gap: 10 }}>
                  <button onClick={() => setShowCreateTagPicker(false)} style={{ fontSize: 20, background: "none", border: "none", cursor: "pointer" }}>×</button>
                  <input
                    value={createTagQ}
                    onChange={async (e) => {
                      const q = e.target.value;
                      setCreateTagQ(q);
                      if (q.trim()) {
                        const r = await apiGet("tags", { q: q.trim() }, token);
                        if (r.success) setCreateTagResults(r.tags || []);
                      } else setCreateTagResults([]);
                    }}
                    placeholder="搜索标签，没有可直接创建"
                    style={{ flex: 1, background: "#eef1f3", border: "none", borderRadius: 16, padding: "9px 14px", fontSize: 13, outline: "none" }}
                  />
                </div>
                <div style={{ flex: 1, overflowY: "auto", padding: "8px 16px 20px" }}>
                  {/* 已有标签（搜索时显示结果，不搜索时显示全部已审核） */}
                  {(createTagQ.trim()
                    ? createTagResults
                    : tags.filter((t) => t.approved || (myId && (t as any).creator_id === myId))
                  ).map((t) => {
                    const selected = newTagIds.includes(t.id);
                    return (
                      <div key={t.id} onClick={() => {
                        setNewTagIds(selected ? newTagIds.filter((x) => x !== t.id) : [...newTagIds, t.id]);
                      }} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 4px", borderBottom: "1px solid #f5f8fa", cursor: "pointer" }}>
                        <span style={{ fontSize: 14, color: selected ? "#f91880" : "#0f1419", fontWeight: selected ? 700 : 400 }}>
                          {t.name}
                          {!t.approved && <span style={{ fontSize: 10, color: "#f97316", marginLeft: 6 }}>待审核</span>}
                        </span>
                        <span style={{ fontSize: 13 }}>{selected ? "✓" : "＋"}</span>
                      </div>
                    );
                  })}
                  {/* 创建新标签 */}
                  {createTagQ.trim() && !createTagResults.some((t) => t.name === (createTagQ.startsWith("#") ? createTagQ : `#${createTagQ}`)) && (
                    <button
                      disabled={creatingTag}
                      onClick={async () => {
                        setCreatingTag(true);
                        const r = await apiPost({ action: "create_tag", token, name: createTagQ });
                        setCreatingTag(false);
                        if (r.success) {
                          if (r.exists) {
                            alert("该标签已存在，已为你勾选");
                          }
                          if (r.tag?.id && !newTagIds.includes(r.tag.id)) {
                            setNewTagIds([...newTagIds, r.tag.id]);
                            setLocalTagNames((prev) => ({ ...prev, [r.tag.id]: r.tag.name || (createTagQ.startsWith('#') ? createTagQ : '#' + createTagQ) }));
                          }
                          setCreateTagQ("");
                          setCreateTagResults([]);
                        } else alert(r.error || "创建失败");
                      }}
                      style={{ marginTop: 14, width: "100%", background: "#f91880", color: "#fff", border: "none", borderRadius: 20, padding: "11px", fontSize: 14, fontWeight: 600, cursor: "pointer", opacity: creatingTag ? 0.6 : 1 }}
                    >{creatingTag ? "提交中..." : `创建「${createTagQ.startsWith("#") ? createTagQ : "#" + createTagQ}」（需审核）`}</button>
                  )}
                </div>
                <div style={{ padding: "10px 16px", borderTop: "1px solid #eff3f4" }}>
                  <button onClick={() => setShowCreateTagPicker(false)} style={{ width: "100%", background: "#f91880", color: "#fff", border: "none", borderRadius: 18, padding: "11px", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>完成（已选 {newTagIds.length}）</button>
                </div>
              </div>
            </div>
          )}

          {/* 楼规 */}
          <div style={{ background: "#fff", borderRadius: 12, padding: 14, border: "1px solid #eff3f4" }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>楼规设置</div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: 10, cursor: "pointer" }}>
              <input type="checkbox" checked={newIdentityRequired} onChange={(e) => setNewIdentityRequired(e.target.checked)} />
              <span>本楼需要演绎身份</span>
            </label>
            <div style={{ fontSize: 12, color: "#536471", marginBottom: 6 }}>你在这栋楼的角色名</div>
            <div style={{ fontSize: 11, color: "#8899a6", marginBottom: 8 }}>默认为你的论坛昵称，也可以改成剧中角色名</div>
            <input
              value={newHostLabel}
              onChange={(e) => setNewHostLabel(e.target.value)}
              placeholder={me.name}
              maxLength={10}
              style={{ width: 140, border: "1px solid #eff3f4", borderRadius: 8, padding: "6px 10px", fontSize: 13, outline: "none" }}
            />
            <span style={{ marginLeft: 8, background: "#f91880", color: "#fff", fontSize: 10, padding: "2px 8px", borderRadius: 4, fontWeight: 600 }}>楼主</span>
            <div style={{ fontSize: 11, color: "#8899a6", marginTop: 6 }}>发帖后你将以「<b>{newHostLabel || me.name}</b>」的名字出现在楼内，旁边标注「楼主」</div>
          </div>
        </div>
      </div>
    );
  }

  // --- 帖子详情页 ---
  if (view.kind === "post") {
    const post = view.post;
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#f7f9f9" }}>
        <div style={{ padding: "12px 16px", background: "#fff", borderBottom: "1px solid #eff3f4", display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={() => setView({ kind: "home" })} style={{ fontSize: 22, background: "none", border: "none", color: "#0f1419", cursor: "pointer" }}>‹</button>
          <div style={{ flex: 1, fontSize: 15, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{post.title}</div>
          <button onClick={() => setView({ kind: "notif" })} style={{ position: "relative", background: "none", border: "none", fontSize: 18, cursor: "pointer", padding: "4px 6px" }}>
            🔔
            {unreadCount > 0 && <span style={{ position: "absolute", top: -2, right: -4, background: "#ef4444", color: "#fff", fontSize: 10, fontWeight: 700, borderRadius: "50%", minWidth: 16, height: 16, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px" }}>{unreadCount > 99 ? "99+" : unreadCount}</span>}
          </button>
        </div>

        {/* 首楼 */}
        <div style={{ padding: "14px 16px", background: "#fff", borderBottom: "1px solid #eff3f4" }}>
          <div style={{ fontSize: 17, fontWeight: 800, lineHeight: 1.4 }}>{post.title}</div>
          {post.pickup_tags && post.pickup_tags.length > 0 && (
            <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
              {post.pickup_tags.map((t) => <span key={t.id} style={{ fontSize: 11, color: "#1d9bf0", background: "#e8f5fe", padding: "2px 8px", borderRadius: 10 }}>{t.name}</span>)}
            </div>
          )}
          <div style={{ fontSize: 14, lineHeight: 1.6, marginTop: 10, whiteSpace: "pre-wrap" }}>{post.content}</div>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            {post.identity_required && <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, background: "#fff4e5", color: "#f08c00", fontWeight: 600 }}>本楼需要演绎身份</span>}
            {!post.identity_required && <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, background: "#ebfbee", color: "#2f9e44", fontWeight: 600 }}>本楼免身份</span>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, paddingTop: 10, borderTop: "1px solid #f5f8fa" }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#ffe4ec", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>{post.owner_emoji || "🐰"}</div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{post.host_label || post.owner_display} <span style={{ background: "#f91880", color: "#fff", fontSize: 10, padding: "1px 6px", borderRadius: 4, fontWeight: 600 }}>楼主</span></div>
              <div style={{ fontSize: 11, color: "#8899a6" }}>{timeAgo(post.created_at)}</div>
            </div>
          </div>
        </div>

        {/* 楼层排序 */}
        <div style={{ padding: "10px 16px", background: "#fff", borderBottom: "1px solid #eff3f4", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 13, color: "#536471" }}>{repliesTotal} 层楼</span>
          <div style={{ display: "flex", gap: 6 }}>
            {(["floor", "heat", "floor_desc"] as const).map((s) => (
              <button key={s} onClick={() => { setReplySort(s); loadReplies(post.id, 1); }} style={{ fontSize: 12, padding: "4px 10px", borderRadius: 12, border: "none", background: replySort === s ? "#f91880" : "#eef1f3", color: replySort === s ? "#fff" : "#536471", fontWeight: replySort === s ? 600 : 400, cursor: "pointer" }}>
                {s === "floor" ? "楼序 ↑" : s === "heat" ? "🔥 热度" : "楼序 ↓"}
              </button>
            ))}
          </div>
        </div>

        {/* 楼层列表 */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {loading ? (
            <div style={{ textAlign: "center", padding: 40, color: "#536471" }}>加载中...</div>
          ) : replies.length === 0 ? (
            <div style={{ textAlign: "center", padding: 60, color: "#536471" }}>还没有人回帖，抢沙发！</div>
          ) : replies.map((r) => (
            <div key={r.id} style={{ padding: "14px 16px", background: "#fff", borderBottom: "1px solid #eff3f4", display: "flex", gap: 10 }}>
              <div style={{ width: 40, height: 40, borderRadius: "50%", background: "#e7f5ff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>{r.author_emoji || ""}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "#0f1419" }}>{r.author_display}</span>
                  <span style={{ fontSize: 12, color: "#536471" }}>{r.floor_no}楼 · {timeAgo(r.created_at)}</span>
                </div>
                <div style={{ fontSize: 14, color: "#0f1419", lineHeight: 1.55, marginTop: 3, whiteSpace: "pre-wrap" }}>{r.content}</div>
                {r.sub_replies_count > 0 && (
                  <button
                    onClick={() => { setView({ kind: "replyPage", post, reply: r }); loadSubReplies(r.id, 1); loadIdentity(post.id); }}
                    style={{ marginTop: 10, background: "#eef1f3", border: "none", borderRadius: 16, padding: "7px 14px", fontSize: 13, color: "#536471", fontWeight: 500, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}
                  >
                    查看 <span style={{ color: "#f91880", fontWeight: 700 }}>{r.sub_replies_count}</span> 条回复 ›
                    {r.has_host_reply && <span style={{ color: "#f91880", fontSize: 11, fontWeight: 600, marginLeft: 2 }}>· 楼主</span>}
                  </button>
                )}
                <div style={{ display: "flex", gap: 16, marginTop: 8, fontSize: 12, color: "#8899a6" }}>
                  <button onClick={() => alert("点赞功能开发中")} style={{ background: "none", border: "none", color: "#8899a6", cursor: "pointer", padding: 0 }}>♡ {r.likes_count}</button>
                  <button onClick={() => { setReplyTo({ username: r.author_username, display: r.author_display }); }} style={{ background: "none", border: "none", color: "#8899a6", cursor: "pointer", padding: 0 }}>回复</button>
                  <button onClick={() => { setReportTarget({ type: "reply", id: r.id, postId: post.id, replyId: r.id, floorNo: r.floor_no }); setShowReportSheet(true); }} style={{ background: "none", border: "none", color: "#8899a6", cursor: "pointer", padding: 0 }}>举报</button>
                </div>
              </div>
            </div>
          ))}
          {repliesTotal > PER_PAGE && (
            <div style={{ display: "flex", justifyContent: "center", gap: 16, padding: 14, fontSize: 13, color: "#536471" }}>
              {repliesPage > 1 && <button onClick={() => loadReplies(post.id, repliesPage - 1)} style={{ background: "none", border: "none", color: "#1d9bf0", cursor: "pointer" }}>‹ 上一页</button>}
              <span style={{ color: "#f91880", fontWeight: 700 }}>{repliesPage}</span>
              {repliesPage * PER_PAGE < repliesTotal && <button onClick={() => loadReplies(post.id, repliesPage + 1)} style={{ background: "none", border: "none", color: "#1d9bf0", cursor: "pointer" }}>下一页 ›</button>}
            </div>
          )}
        </div>

        {/* 回复输入框 */}
        <div style={{ height: 56, borderTop: "1px solid #eff3f4", background: "#fff", display: "flex", alignItems: "center", padding: "0 14px", gap: 10 }}>
          {replyTo && (
            <div style={{ position: "absolute", bottom: 60, left: 14, right: 14, background: "#fff", border: "1px solid #eff3f4", borderRadius: 8, padding: "6px 10px", fontSize: 12, color: "#1d9bf0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span>回复 {replyTo.display}</span>
              <button onClick={() => setReplyTo(null)} style={{ background: "none", border: "none", cursor: "pointer" }}>×</button>
            </div>
          )}
          <input
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleReply()}
            placeholder={replyTo ? `回复 ${replyTo.display}...` : "说点什么..."}
            style={{ flex: 1, background: "#eef1f3", border: "none", borderRadius: 18, height: 38, padding: "0 14px", fontSize: 13, outline: "none" }}
          />
          <button onClick={() => handleReply()} disabled={loading || !replyText.trim()} style={{ width: 38, height: 38, borderRadius: "50%", background: "#f91880", color: "#fff", border: "none", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, cursor: "pointer", opacity: loading || !replyText.trim() ? 0.5 : 1 }}>↑</button>
        </div>

        {/* 首次身份弹层 */}
        {showIdentitySheet && (
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.3)", zIndex: 100, display: "flex", flexDirection: "column" }}>
            <div style={{ background: "#fff", borderRadius: "16px 16px 0 0", marginTop: "auto", padding: 20 }}>
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}>设置演绎身份</div>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: 14, cursor: "pointer" }}>
                <input type="checkbox" checked={useAccountName} onChange={(e) => setUseAccountName(e.target.checked)} />
                <span>与账号同名（{user.name}）</span>
              </label>
              {!useAccountName && (
                <>
                  <div style={{ fontSize: 12, color: "#536471", marginBottom: 6 }}>角色名</div>
                  <input
                    value={pendingIdentityName}
                    onChange={(e) => setPendingIdentityName(e.target.value)}
                    placeholder="起一个角色名（至少2字）"
                    style={{ width: "100%", border: "1px solid #eff3f4", borderRadius: 10, padding: "10px 12px", fontSize: 14, outline: "none", marginBottom: 12, boxSizing: "border-box" }}
                  />
                  <div style={{ fontSize: 12, color: "#536471", marginBottom: 6 }}>Emoji</div>
                  <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
                    {["🐰", "🦊", "🐱", "", "🌸", "", "⚡", "🔥"].map((e) => (
                      <button key={e} onClick={() => setPendingIdentityEmoji(e)} style={{ width: 36, height: 36, borderRadius: "50%", border: pendingIdentityEmoji === e ? "2px solid #f91880" : "1px solid #eff3f4", background: "#fff", fontSize: 18, cursor: "pointer" }}>{e}</button>
                    ))}
                  </div>
                </>
              )}
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => setShowIdentitySheet(false)} style={{ flex: 1, padding: 12, borderRadius: 20, border: "1px solid #eff3f4", background: "#fff", fontSize: 14, cursor: "pointer" }}>取消</button>
                <button onClick={handleConfirmIdentity} style={{ flex: 1, padding: 12, borderRadius: 20, border: "none", background: "#f91880", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>确认</button>
              </div>
            </div>
          </div>
        )}

        {/* 举报弹层 */}
        {showReportSheet && reportTarget && (
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.3)", zIndex: 100, display: "flex", flexDirection: "column" }}>
            <div style={{ background: "#fff", borderRadius: "16px 16px 0 0", marginTop: "auto", padding: 20 }}>
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}>举报</div>
              <div style={{ fontSize: 12, color: "#536471", marginBottom: 8 }}>选择理由</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
                {["引战", "涉黄", "剧透", "广告", "政治敏感", "其他"].map((r) => (
                  <button key={r} onClick={() => setReportReason(r)} style={{ fontSize: 12, padding: "6px 14px", borderRadius: 16, border: "none", background: reportReason === r ? "#f91880" : "#eef1f3", color: reportReason === r ? "#fff" : "#536471", fontWeight: reportReason === r ? 600 : 400, cursor: "pointer" }}>{r}</button>
                ))}
              </div>
              <textarea
                value={reportDesc}
                onChange={(e) => setReportDesc(e.target.value)}
                placeholder="补充说明（选填）"
                maxLength={500}
                style={{ width: "100%", border: "1px solid #eff3f4", borderRadius: 10, padding: "10px 12px", fontSize: 13, outline: "none", minHeight: 80, resize: "vertical", boxSizing: "border-box", marginBottom: 14 }}
              />
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => setShowReportSheet(false)} style={{ flex: 1, padding: 12, borderRadius: 20, border: "1px solid #eff3f4", background: "#fff", fontSize: 14, cursor: "pointer" }}>取消</button>
                <button onClick={handleReport} disabled={!reportReason} style={{ flex: 1, padding: 12, borderRadius: 20, border: "none", background: reportReason ? "#f91880" : "#ccc", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>提交</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // --- 楼层回复页 ---
  if (view.kind === "replyPage") {
    const { post, reply } = view;
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#f7f9f9" }}>
        <div style={{ padding: "12px 16px", background: "#fff", borderBottom: "1px solid #eff3f4", display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={() => setView({ kind: "post", post })} style={{ fontSize: 22, background: "none", border: "none", color: "#0f1419", cursor: "pointer" }}>‹</button>
          <div style={{ flex: 1, fontSize: 15, fontWeight: 700, textAlign: "center", marginRight: 30 }}>{reply.floor_no}楼 · {reply.author_display} 的回复</div>
          <button onClick={() => setView({ kind: "notif" })} style={{ position: "relative", background: "none", border: "none", fontSize: 18, cursor: "pointer", padding: "4px 6px" }}>
            🔔
            {unreadCount > 0 && <span style={{ position: "absolute", top: -2, right: -4, background: "#ef4444", color: "#fff", fontSize: 10, fontWeight: 700, borderRadius: "50%", minWidth: 16, height: 16, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px" }}>{unreadCount > 99 ? "99+" : unreadCount}</span>}
          </button>
        </div>

        {/* 父评论 */}
        <div style={{ padding: "14px 16px", background: "#fff", borderBottom: "6px solid #eef1f3", display: "flex", gap: 10 }}>
          <div style={{ width: 40, height: 40, borderRadius: "50%", background: "#e7f5ff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>{reply.author_emoji || "🐰"}</div>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 14, fontWeight: 700 }}>{reply.author_display}</span>
              <span style={{ fontSize: 12, color: "#536471" }}>{reply.floor_no}楼 · {timeAgo(reply.created_at)}</span>
            </div>
            <div style={{ fontSize: 14, lineHeight: 1.55, marginTop: 3, whiteSpace: "pre-wrap" }}>{reply.content}</div>
          </div>
        </div>

        {/* 子回复列表 */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          <div style={{ padding: "10px 16px", fontSize: 13, color: "#536471", fontWeight: 600, background: "#f7f9f9" }}>
            回复 {subRepliesTotal}
          </div>
          {subReplies.length === 0 ? (
            <div style={{ textAlign: "center", padding: 40, color: "#536471" }}>还没有人回复这条</div>
          ) : subReplies.map((sr) => (
            <div key={sr.id} style={{ padding: "12px 16px", background: sr.is_host_reply ? "#fff8fb" : "#fff", borderBottom: "1px solid #eff3f4", display: "flex", gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#fff9db", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>{sr.author_emoji || "🐰"}</div>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 700 }}>{sr.author_display}</span>
                  <span style={{ fontSize: 11.5, color: "#8899a6" }}>{timeAgo(sr.created_at)}</span>
                </div>
                <div style={{ fontSize: 13.5, lineHeight: 1.55, marginTop: 2 }}>
                  {sr.reply_to_display && <span style={{ color: "#1d9bf0" }}>@{sr.reply_to_display} </span>}
                  {sr.content}
                </div>
                {sr.is_host_reply && (
                  <div style={{ marginTop: 6 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: "#f91880", border: "1px solid #f91880", background: "#fff0f6", borderRadius: 4, padding: "1px 7px" }}>楼主回复</span>
                  </div>
                )}
                <div style={{ display: "flex", gap: 16, marginTop: 5, fontSize: 12, color: "#8899a6" }}>
                  <button onClick={() => alert("点赞开发中")} style={{ background: "none", border: "none", color: "#8899a6", cursor: "pointer", padding: 0 }}>♡ {sr.likes_count}</button>
                  <button onClick={() => setReplyTo({ username: sr.author_username, display: sr.author_display })} style={{ background: "none", border: "none", color: "#8899a6", cursor: "pointer", padding: 0 }}>回复</button>
                  <button onClick={() => { setReportTarget({ type: "sub_reply", id: sr.id, postId: post.id, replyId: reply.id, floorNo: reply.floor_no }); setShowReportSheet(true); }} style={{ background: "none", border: "none", color: "#8899a6", cursor: "pointer", padding: 0 }}>举报</button>
                </div>
              </div>
            </div>
          ))}
          {subRepliesTotal > PER_PAGE && (
            <div style={{ display: "flex", justifyContent: "center", gap: 16, padding: 14, fontSize: 13, color: "#536471" }}>
              {subRepliesPage > 1 && <button onClick={() => loadSubReplies(reply.id, subRepliesPage - 1)} style={{ background: "none", border: "none", color: "#1d9bf0", cursor: "pointer" }}>‹ 上一页</button>}
              <span style={{ color: "#f91880", fontWeight: 700 }}>{subRepliesPage}</span>
              {subRepliesPage * PER_PAGE < subRepliesTotal && <button onClick={() => loadSubReplies(reply.id, subRepliesPage + 1)} style={{ background: "none", border: "none", color: "#1d9bf0", cursor: "pointer" }}>下一页 ›</button>}
            </div>
          )}
        </div>

        {/* 子回复输入框 */}
        <div style={{ height: 56, borderTop: "1px solid #eff3f4", background: "#fff", display: "flex", alignItems: "center", padding: "0 14px", gap: 10 }}>
          <input
            value={subReplyText}
            onChange={(e) => setSubReplyText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubReply()}
            placeholder={replyTo ? `回复 ${replyTo.display}...` : `回复 ${reply.floor_no}楼...`}
            style={{ flex: 1, background: "#eef1f3", border: "none", borderRadius: 18, height: 38, padding: "0 14px", fontSize: 13, outline: "none" }}
          />
          <button onClick={handleSubReply} disabled={loading || !subReplyText.trim()} style={{ width: 38, height: 38, borderRadius: "50%", background: "#f91880", color: "#fff", border: "none", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, cursor: "pointer", opacity: loading || !subReplyText.trim() ? 0.5 : 1 }}>↑</button>
        </div>

        {/* 举报弹层（复用） */}
        {showReportSheet && reportTarget && (
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.3)", zIndex: 100, display: "flex", flexDirection: "column" }}>
            <div style={{ background: "#fff", borderRadius: "16px 16px 0 0", marginTop: "auto", padding: 20 }}>
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}>举报</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
                {["引战", "涉黄", "剧透", "广告", "政治敏感", "其他"].map((r) => (
                  <button key={r} onClick={() => setReportReason(r)} style={{ fontSize: 12, padding: "6px 14px", borderRadius: 16, border: "none", background: reportReason === r ? "#f91880" : "#eef1f3", color: reportReason === r ? "#fff" : "#536471", cursor: "pointer" }}>{r}</button>
                ))}
              </div>
              <textarea value={reportDesc} onChange={(e) => setReportDesc(e.target.value)} placeholder="补充说明" maxLength={500} style={{ width: "100%", border: "1px solid #eff3f4", borderRadius: 10, padding: "10px 12px", fontSize: 13, outline: "none", minHeight: 80, boxSizing: "border-box", marginBottom: 14 }} />
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => setShowReportSheet(false)} style={{ flex: 1, padding: 12, borderRadius: 20, border: "1px solid #eff3f4", background: "#fff", fontSize: 14, cursor: "pointer" }}>取消</button>
                <button onClick={handleReport} disabled={!reportReason} style={{ flex: 1, padding: 12, borderRadius: 20, border: "none", background: reportReason ? "#f91880" : "#ccc", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>提交</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // --- 通知中心 ---
  if (view.kind === "notif") {
    const totalPages = Math.ceil(notifTotal / 20);
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#f7f9f9" }}>
        {/* 顶栏 */}
        <div style={{ padding: "12px 16px", background: "#fff", borderBottom: "1px solid #eff3f4", display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={() => setView({ kind: "home" })} style={{ fontSize: 22, background: "none", border: "none", color: "#0f1419", cursor: "pointer" }}>‹</button>
          <div style={{ flex: 1, fontSize: 16, fontWeight: 700 }}>通知中心</div>
          <button onClick={handleMarkAllRead} style={{ fontSize: 12, color: "#1d9bf0", background: "none", border: "none", cursor: "pointer" }}>全部已读</button>
          {isAdmin && <button onClick={() => setShowNotifSend(true)} style={{ fontSize: 12, color: "#f91880", background: "#fff0f6", border: "none", borderRadius: 12, padding: "4px 10px", fontWeight: 600, cursor: "pointer" }}>📢 发通知</button>}
        </div>

        {/* Tab 切换 */}
        <div style={{ padding: "10px 16px", background: "#fff", borderBottom: "1px solid #eff3f4", display: "flex", gap: 8 }}>
          <button onClick={() => setNotifTab("all")} style={{ fontSize: 13, padding: "6px 16px", borderRadius: 16, border: "none", background: notifTab === "all" ? "#f91880" : "#eef1f3", color: notifTab === "all" ? "#fff" : "#536471", fontWeight: notifTab === "all" ? 600 : 400, cursor: "pointer" }}>全部</button>
          <button onClick={() => setNotifTab("unread")} style={{ fontSize: 13, padding: "6px 16px", borderRadius: 16, border: "none", background: notifTab === "unread" ? "#f91880" : "#eef1f3", color: notifTab === "unread" ? "#fff" : "#536471", fontWeight: notifTab === "unread" ? 600 : 400, cursor: "pointer" }}>未读</button>
        </div>

        {/* 通知列表 */}
        <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
          {notifError ? (
            <div style={{ textAlign: "center", padding: 40, color: "#536471", fontSize: 13 }}>{notifError}</div>
          ) : notifications.length === 0 ? (
            <div style={{ textAlign: "center", padding: 60, color: "#536471" }}>暂无通知</div>
          ) : notifications.map((n) => (
            <div
              key={n.id}
              onClick={() => handleNotifClick(n)}
              style={{ padding: "14px 16px", background: "#fff", borderBottom: "1px solid #eff3f4", cursor: "pointer", display: "flex", gap: 10 }}
            >
              <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#f0f4f7", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>
                {NOTIF_ICON[n.type] || "🔔"}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "#0f1419" }}>{n.title}</span>
                  {!n.readAt && <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#ef4444", flexShrink: 0 }} />}
                </div>
                <div style={{ fontSize: 13, color: "#536471", marginTop: 3, lineHeight: 1.5, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{n.content}</div>
                <div style={{ fontSize: 11, color: "#8899a6", marginTop: 4 }}>{timeAgo(n.createdAt)}</div>
              </div>
            </div>
          ))}
          {totalPages > 1 && (
            <div style={{ display: "flex", justifyContent: "center", gap: 16, padding: 14, fontSize: 13, color: "#536471" }}>
              {notifPage > 1 && <button onClick={() => loadNotifs(notifPage - 1)} style={{ background: "none", border: "none", color: "#1d9bf0", cursor: "pointer" }}>‹ 上一页</button>}
              <span style={{ color: "#f91880", fontWeight: 700 }}>{notifPage}</span>
              {notifPage < totalPages && <button onClick={() => loadNotifs(notifPage + 1)} style={{ background: "none", border: "none", color: "#1d9bf0", cursor: "pointer" }}>下一页 ›</button>}
            </div>
          )}
        </div>

        {/* 管理员发通知弹层 */}
        {showNotifSend && (
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.3)", zIndex: 100, display: "flex", flexDirection: "column" }}>
            <div style={{ background: "#fff", borderRadius: "16px 16px 0 0", marginTop: "auto", padding: 20, maxHeight: "80%", overflowY: "auto" }}>
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}>📢 发送通知</div>
              <div style={{ fontSize: 12, color: "#536471", marginBottom: 6 }}>目标用户ID（留空=全体）</div>
              <input
                value={notifSendTarget}
                onChange={(e) => setNotifSendTarget(e.target.value)}
                placeholder="留空发送给所有用户"
                style={{ width: "100%", border: "1px solid #eff3f4", borderRadius: 10, padding: "10px 12px", fontSize: 13, outline: "none", marginBottom: 12, boxSizing: "border-box" }}
              />
              <div style={{ fontSize: 12, color: "#536471", marginBottom: 6 }}>标题</div>
              <input
                value={notifSendTitle}
                onChange={(e) => setNotifSendTitle(e.target.value)}
                placeholder="通知标题"
                maxLength={50}
                style={{ width: "100%", border: "1px solid #eff3f4", borderRadius: 10, padding: "10px 12px", fontSize: 13, outline: "none", marginBottom: 12, boxSizing: "border-box" }}
              />
              <div style={{ fontSize: 12, color: "#536471", marginBottom: 6 }}>内容</div>
              <textarea
                value={notifSendContent}
                onChange={(e) => setNotifSendContent(e.target.value)}
                placeholder="通知内容"
                maxLength={500}
                style={{ width: "100%", border: "1px solid #eff3f4", borderRadius: 10, padding: "10px 12px", fontSize: 13, outline: "none", minHeight: 80, resize: "vertical", boxSizing: "border-box", marginBottom: 12 }}
              />
              <div style={{ fontSize: 12, color: "#536471", marginBottom: 6 }}>类型</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
                {[["admin_custom", "✉️ 自定义"], ["system_announce", "📢 公告"], ["admin_action", "🛡️ 管理操作"]].map(([val, label]) => (
                  <button key={val} onClick={() => setNotifSendType(val)} style={{ fontSize: 12, padding: "6px 12px", borderRadius: 12, border: "none", background: notifSendType === val ? "#f91880" : "#eef1f3", color: notifSendType === val ? "#fff" : "#536471", fontWeight: notifSendType === val ? 600 : 400, cursor: "pointer" }}>{label}</button>
                ))}
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => setShowNotifSend(false)} style={{ flex: 1, padding: 12, borderRadius: 20, border: "1px solid #eff3f4", background: "#fff", fontSize: 14, cursor: "pointer" }}>取消</button>
                <button onClick={handleAdminSend} style={{ flex: 1, padding: 12, borderRadius: 20, border: "none", background: "#f91880", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>发送</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return null;
}
