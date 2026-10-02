"use client";

import { useEffect, useMemo, useState } from "react";

type ReviewUser = {
    id: string;
    username: string;
    weibo_name: string;
    weibo_link?: string;
    invite_code_used: string;
    referrer_name?: string | null;
    role: "admin" | "user";
    status: "pending" | "approved" | "rejected";
    created_at: string;
    reviewed_by?: string | null;
    reviewed_at?: string | null;
};

type PickupPost = {
    id: string;
    title: string;
    owner_username: string;
    owner_display?: string;
    status: string;
    replies_count: number;
    likes_count: number;
    created_at: string;
    pickup_tags?: { id: string; name: string }[];
    tag_ids?: string[];
};

type PickupReport = {
    id: string;
    reporter_id: string;
    target_type: string;
    target_id: string;
    reason: string;
    description?: string;
    status: string;
    handled_by?: string;
    handled_at?: string;
    created_at: string;
    post_id?: string;
    reply_id?: string;
    floor_no?: number;
};

type PendingTag = {
    id: string;
    name: string;
    created_at: string;
    use_count?: number;
    approved?: boolean;
};

type TabType = "admin" | "user" | "posts" | "reports" | "tags";

export function AdminReviewApp({ loginUsername, onClose }: { loginUsername: string; onClose?: () => void }) {
    const [tab, setTab] = useState<TabType>("admin");
    const [users, setUsers] = useState<ReviewUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [rejectUser, setRejectUser] = useState<ReviewUser | null>(null);
    const [rejectReason, setRejectReason] = useState("");

    const [posts, setPosts] = useState<PickupPost[]>([]);
    const [postsLoading, setPostsLoading] = useState(false);
    const [reports, setReports] = useState<PickupReport[]>([]);
    const [reportsLoading, setReportsLoading] = useState(false);
    const [tags, setTags] = useState<PendingTag[]>([]);
    const [tagsLoading, setTagsLoading] = useState(false);

    const token = typeof window !== "undefined" ? localStorage.getItem("auth_token") || "" : "";

    async function fetchPending() {
        setLoading(true);
        setError("");
        try {
            const res = await fetch("/api/auth", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "list_pending_users", authToken: token })
            });
            const result = await res.json();
            if (result.success && Array.isArray(result.data)) {
                setUsers(result.data);
            } else {
                setError(result.error || "获取审核列表失败");
            }
        } catch (err) {
            setError("网络错误，请重试");
        } finally {
            setLoading(false);
        }
    }

    async function fetchPosts() {
        setPostsLoading(true);
        try {
            const res = await fetch("/api/pickup?action=list&sort=newest", {
                headers: { Authorization: "Bearer " + token }
            });
            const result = await res.json();
            if (result.success) setPosts(result.posts || []);
            else alert(result.error || "获取帖子列表失败");
        } catch {
            alert("网络错误");
        } finally {
            setPostsLoading(false);
        }
    }

    async function fetchReports() {
        setReportsLoading(true);
        try {
            const types = ["post", "reply", "sub_reply", "tag"];
            const statuses = ["pending", "approved", "rejected"];
            const all: PickupReport[] = [];
            for (const t of types) {
                for (const s of statuses) {
                    const res = await fetch(
                        "/api/pickup?action=admin_reports&target=" + t + "&status=" + s,
                        { headers: { Authorization: "Bearer " + token } }
                    );
                    const result = await res.json();
                    if (result.success) all.push(...(result.reports || []));
                }
            }
            all.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
            setReports(all);
        } catch {
            alert("网络错误");
        } finally {
            setReportsLoading(false);
        }
    }

    async function fetchTags() {
        setTagsLoading(true);
        try {
            const res = await fetch("/api/pickup?action=admin_tags_pending", {
                headers: { Authorization: "Bearer " + token }
            });
            const result = await res.json();
            if (result.success) setTags(result.tags || []);
            else alert(result.error || "获取标签列表失败");
        } catch {
            alert("网络错误");
        } finally {
            setTagsLoading(false);
        }
    }

    async function handlePostAction(postId: string, postAction: string) {
        try {
            const res = await fetch("/api/pickup", {
                method: "POST",
                headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
                body: JSON.stringify({ action: "admin_post_action", postId, postAction, token })
            });
            const result = await res.json();
            if (result.success) {
                await fetchPosts();
            } else {
                alert(result.error || "操作失败");
            }
        } catch {
            alert("网络错误");
        }
    }

    async function handleReport(reportId: string, handleAction: string) {
        try {
            const res = await fetch("/api/pickup", {
                method: "POST",
                headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
                body: JSON.stringify({ action: "admin_handle_report", reportId, handleAction, token })
            });
            const result = await res.json();
            if (result.success) {
                await fetchReports();
            } else {
                alert(result.error || "操作失败");
            }
        } catch {
            alert("网络错误");
        }
    }

    async function handleTag(tagId: string, approved: boolean) {
        try {
            const res = await fetch("/api/pickup", {
                method: "POST",
                headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
                body: JSON.stringify({ action: "admin_approve_tag", tagId, approved, token })
            });
            const result = await res.json();
            if (result.success) {
                await fetchTags();
            } else {
                alert(result.error || "操作失败");
            }
        } catch {
            alert("网络错误");
        }
    }

    useEffect(() => {
        fetchPending();
    }, []);

    useEffect(() => {
        if (tab === "posts") fetchPosts();
        else if (tab === "reports") fetchReports();
        else if (tab === "tags") fetchTags();
    }, [tab]);

    const adminQueue = useMemo(() => users.filter(u => u.role === "admin" && u.status === "pending"), [users]);
    const userQueue = useMemo(() => users.filter(u => u.role === "user" && u.status === "pending"), [users]);
    const currentQueue = tab === "admin" ? adminQueue : userQueue;

    async function approve(ids: string[]) {
        if (!ids.length) return;
        try {
            const res = await fetch("/api/auth", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "batch_approve_users", targetUserIds: ids, reviewedBy: loginUsername, authToken: token })
            });
            const result = await res.json();
            if (result.success) {
                await fetchPending();
                setSelected(prev => {
                    const next = new Set(prev);
                    ids.forEach(id => next.delete(id));
                    return next;
                });
            } else {
                alert(result.error || "通过失败");
            }
        } catch {
            alert("网络错误");
        }
    }

    async function reject(user: ReviewUser) {
        if (!rejectReason.trim()) {
            alert("请填写拒绝理由");
            return;
        }
        try {
            const res = await fetch("/api/auth", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "reject_user",
                    targetUserId: user.id,
                    reason: rejectReason.trim(),
                    reviewedBy: loginUsername,
                    authToken: token
                })
            });
            const result = await res.json();
            if (result.success) {
                setRejectUser(null);
                setRejectReason("");
                await fetchPending();
            } else {
                alert(result.error || "拒绝失败");
            }
        } catch {
            alert("网络错误");
        }
    }

    function toggleSelect(id: string) {
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }

    function toggleSelectAll() {
        const ids = currentQueue.map(u => u.id);
        const allSelected = ids.every(id => selected.has(id));
        setSelected(prev => {
            const next = new Set(prev);
            if (allSelected) {
                ids.forEach(id => next.delete(id));
            } else {
                ids.forEach(id => next.add(id));
            }
            return next;
        });
    }

    function normalizeUrl(link?: string) {
        const v = (link || "").trim();
        if (!v) return "";
        return /^https?:\/\//i.test(v) ? v : "https://" + v;
    }

    async function copyLink(link: string) {
        try {
            await navigator.clipboard.writeText(link);
            alert("微博主页链接已复制");
        } catch {
            prompt("复制此链接：", link);
        }
    }

    function formatTime(iso: string) {
        try {
            return new Date(iso).toLocaleString("zh-CN");
        } catch {
            return iso;
        }
    }

    function reportStatusStyle(status: string) {
        if (status === "pending") return { background: "rgba(239,83,80,0.12)", color: "#c62828" };
        if (status === "approved") return { background: "rgba(46,125,50,0.12)", color: "#2e7d32" };
        return { background: "rgba(0,0,0,0.06)", color: "#888" };
    }

    function reportStatusLabel(status: string) {
        if (status === "pending") return "待处理";
        if (status === "approved") return "已通过";
        return "已驳回";
    }

    function targetTypeLabel(t: string) {
        if (t === "post") return "帖子";
        if (t === "reply") return "回复";
        if (t === "sub_reply") return "子回复";
        if (t === "tag") return "标签";
        return t;
    }

    const tabDefs: { key: TabType; label: string; color: string }[] = [
        { key: "admin", label: "管理员审核", color: "linear-gradient(135deg, #f59e0b, #d97706)" },
        { key: "user", label: "普通用户审核", color: "linear-gradient(135deg, #2e7d32, #5a9e6a)" },
        { key: "posts", label: "演绎帖子", color: "linear-gradient(135deg, #2e7d32, #5a9e6a)" },
        { key: "reports", label: "举报", color: "linear-gradient(135deg, #2e7d32, #5a9e6a)" },
        { key: "tags", label: "标签审核", color: "linear-gradient(135deg, #2e7d32, #5a9e6a)" },
    ];

    return (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "linear-gradient(180deg, #f7faf7 0%, #eef5ee 100%)" }}>
            <div style={{
                flexShrink: 0,
                background: "rgba(255,255,255,0.8)",
                backdropFilter: "blur(20px)",
                borderBottom: "1px solid rgba(46,92,51,0.08)",
                padding: "24px 14px 10px 14px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between"
            }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{
                        width: 28,
                        height: 28,
                        borderRadius: 10,
                        background: "linear-gradient(135deg, #2e7d32, #5a9e6a)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center"
                    }}>✅</div>
                    <div>
                        <div style={{ fontSize: 14, fontWeight: 800, color: "#2e5c33" }}>管理中心</div>
                        <div style={{ fontSize: 9, color: "#4a7c50", opacity: 0.7 }}>管理员专属</div>
                    </div>
                </div>
                <button onClick={onClose} style={{
                    fontSize: 12,
                    padding: "6px 12px",
                    borderRadius: 10,
                    background: "rgba(0,0,0,0.04)",
                    border: "1px solid rgba(0,0,0,0.06)",
                    color: "#666",
                    cursor: "pointer"
                }}>返回</button>
            </div>

            <div style={{
                flexShrink: 0,
                display: "flex",
                flexWrap: "wrap",
                gap: 6,
                padding: "10px 14px",
                borderBottom: "1px solid rgba(46,92,51,0.06)"
            }}>
                {tabDefs.map(td => (
                    <button key={td.key} onClick={() => setTab(td.key)} style={{
                        width: "calc(20% - 5px)",
                        padding: "8px 0",
                        borderRadius: 12,
                        border: "none",
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: "pointer",
                        background: tab === td.key ? td.color : "rgba(0,0,0,0.04)",
                        color: tab === td.key ? "#fff" : "#666",
                    }}>{td.label}{td.key === "admin" ? " (" + adminQueue.length + ")" : ""}{td.key === "user" ? " (" + userQueue.length + ")" : ""}</button>
                ))}
            </div>

            {error && (tab === "admin" || tab === "user") && (
                <div style={{ margin: "10px 14px", padding: "10px 12px", background: "rgba(239,83,80,0.08)", borderRadius: 10, color: "#c62828", fontSize: 13 }}>
                    {error}
                </div>
            )}

            <div style={{ flex: 1, overflowY: "auto", padding: "10px 14px" }}>
                {(tab === "admin" || tab === "user") && (
                    <>
                        {loading ? (
                            <div style={{ textAlign: "center", padding: 40, color: "#4a7c50", fontSize: 13 }}>加载中...</div>
                        ) : currentQueue.length === 0 ? (
                            <div style={{ textAlign: "center", padding: 40, color: "#4a7c50", fontSize: 13 }}>
                                <div style={{ fontSize: 32, marginBottom: 8 }}>🎉</div>
                                {tab === "admin" ? "暂无待审核管理员" : "暂无待审核普通用户"}
                            </div>
                        ) : (
                            <>
                                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                                    <button onClick={toggleSelectAll} style={{
                                        fontSize: 12,
                                        padding: "6px 10px",
                                        borderRadius: 8,
                                        border: "1px solid rgba(46,92,51,0.15)",
                                        background: "rgba(255,255,255,0.6)",
                                        color: "#2e5c33",
                                        cursor: "pointer"
                                    }}>全选</button>
                                    {selected.size > 0 && (
                                        <button onClick={() => approve(Array.from(selected))} style={{
                                            fontSize: 12,
                                            padding: "6px 12px",
                                            borderRadius: 8,
                                            border: "none",
                                            background: "linear-gradient(135deg, #2e7d32, #5a9e6a)",
                                            color: "#fff",
                                            fontWeight: 700,
                                            cursor: "pointer"
                                        }}>批量通过 ({selected.size})</button>
                                    )}
                                </div>
                                {currentQueue.map(user => (
                                    <div key={user.id} style={{
                                        background: "rgba(255,255,255,0.75)",
                                        backdropFilter: "blur(16px)",
                                        borderRadius: 16,
                                        padding: 12,
                                        marginBottom: 10,
                                        border: "1px solid rgba(255,255,255,0.6)",
                                        boxShadow: "0 2px 8px rgba(46,92,51,0.04)"
                                    }}>
                                        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                                            <input
                                                type="checkbox"
                                                checked={selected.has(user.id)}
                                                onChange={() => toggleSelect(user.id)}
                                                style={{ marginTop: 4, accentColor: "#2e7d32" }}
                                            />
                                            <div style={{ flex: 1 }}>
                                                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                                                    <span style={{ fontSize: 13, fontWeight: 800, color: "#2e5c33" }}>{user.username}</span>
                                                    <span style={{
                                                        fontSize: 10,
                                                        padding: "2px 6px",
                                                        borderRadius: 6,
                                                        background: user.role === "admin" ? "rgba(245,158,11,0.12)" : "rgba(46,125,50,0.1)",
                                                        color: user.role === "admin" ? "#92400e" : "#2e7d32"
                                                    }}>{user.role === "admin" ? "管理员" : "普通用户"}</span>
                                                </div>
                                                {(() => {
                                                    const full = normalizeUrl(user.weibo_link);
                                                    return (
                                                        <div style={{ fontSize: 11, color: "#4a7c50", marginBottom: 4, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                                                            <span style={{ flexShrink: 0 }}>微博主页：</span>
                                                            {full ? (
                                                                <>
                                                                    <a href={full} target="_blank" rel="noreferrer"
                                                                        style={{ color: "#1e88e5", textDecoration: "none", maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                                                                        title={full}>
                                                                        🔗 点击查看
                                                                    </a>
                                                                    <button onClick={() => copyLink(full)}
                                                                        style={{ fontSize: 10, padding: "2px 8px", borderRadius: 6, border: "1px solid rgba(30,136,229,0.3)", background: "rgba(30,136,229,0.08)", color: "#1e88e5", cursor: "pointer" }}>
                                                                        复制
                                                                    </button>
                                                                </>
                                                            ) : <span>-</span>}
                                                        </div>
                                                    );
                                                })()}
                                                <div style={{ fontSize: 11, color: "#4a7c50", marginBottom: 2 }}>邀请码：{user.invite_code_used || "-"}{user.referrer_name ? "（邀请人：" + user.referrer_name + "）" : ""}</div>
                                                <div style={{ fontSize: 10, color: "#5a9e6a", opacity: 0.8 }}>注册时间：{formatTime(user.created_at)}</div>
                                            </div>
                                        </div>
                                        <div style={{ display: "flex", gap: 8, marginTop: 10, marginLeft: 22 }}>
                                            <button onClick={() => approve([user.id])} style={{
                                                flex: 1,
                                                padding: "7px 0",
                                                borderRadius: 10,
                                                border: "none",
                                                background: "linear-gradient(135deg, #2e7d32, #5a9e6a)",
                                                color: "#fff",
                                                fontSize: 12,
                                                fontWeight: 700,
                                                cursor: "pointer"
                                            }}>通过</button>
                                            <button onClick={() => setRejectUser(user)} style={{
                                                flex: 1,
                                                padding: "7px 0",
                                                borderRadius: 10,
                                                border: "none",
                                                background: "rgba(239,83,80,0.1)",
                                                color: "#c62828",
                                                fontSize: 12,
                                                fontWeight: 700,
                                                cursor: "pointer"
                                            }}>拒绝</button>
                                        </div>
                                    </div>
                                ))}
                            </>
                        )}
                    </>
                )}

                {tab === "posts" && (
                    <>
                        {postsLoading ? (
                            <div style={{ textAlign: "center", padding: 40, color: "#4a7c50", fontSize: 13 }}>加载中...</div>
                        ) : posts.length === 0 ? (
                            <div style={{ textAlign: "center", padding: 40, color: "#4a7c50", fontSize: 13 }}>
                                <div style={{ fontSize: 32, marginBottom: 8 }}>🎉</div>
                                暂无演绎帖子
                            </div>
                        ) : (
                            posts.map(post => (
                                <div key={post.id} style={{
                                    background: "rgba(255,255,255,0.75)",
                                    backdropFilter: "blur(16px)",
                                    borderRadius: 16,
                                    padding: 12,
                                    marginBottom: 10,
                                    border: "1px solid rgba(255,255,255,0.6)",
                                    boxShadow: "0 2px 8px rgba(46,92,51,0.04)"
                                }}>
                                    <div style={{ fontSize: 14, fontWeight: 700, color: "#2e5c33", marginBottom: 6 }}>{post.title}</div>
                                    <div style={{ fontSize: 11, color: "#4a7c50", marginBottom: 4 }}>
                                        作者：{post.owner_display || post.owner_username}
                                    </div>
                                    {post.pickup_tags && post.pickup_tags.length > 0 && (
                                        <div style={{ fontSize: 11, color: "#5a9e6a", marginBottom: 4 }}>
                                            标签：{post.pickup_tags.map(function(t) { return t.name; }).join(", ")}
                                        </div>
                                    )}
                                    <div style={{ fontSize: 10, color: "#5a9e6a", opacity: 0.8, marginBottom: 4 }}>
                                        回复 {post.replies_count ?? 0} · 点赞 {post.likes_count ?? 0} · {formatTime(post.created_at)}
                                    </div>
                                    <div style={{ fontSize: 10, color: "#888", marginBottom: 8 }}>
                                        状态：{post.status === "active" ? "正常" : post.status === "deleted" ? "已删除" : post.status === "hidden" ? "已隐藏" : post.status}
                                    </div>
                                    <div style={{ display: "flex", gap: 6 }}>
                                        <button onClick={() => {
                                            if (confirm("确认删除帖子「" + post.title + "」？")) {
                                                handlePostAction(post.id, "delete");
                                            }
                                        }} style={{
                                            flex: 1,
                                            padding: "7px 0",
                                            borderRadius: 10,
                                            border: "none",
                                            background: "rgba(239,83,80,0.1)",
                                            color: "#c62828",
                                            fontSize: 12,
                                            fontWeight: 700,
                                            cursor: "pointer"
                                        }}>删除</button>
                                        <button onClick={() => {
                                            if (confirm("确认隐藏帖子「" + post.title + "」？")) {
                                                handlePostAction(post.id, "hide");
                                            }
                                        }} style={{
                                            flex: 1,
                                            padding: "7px 0",
                                            borderRadius: 10,
                                            border: "none",
                                            background: "rgba(245,158,11,0.1)",
                                            color: "#92400e",
                                            fontSize: 12,
                                            fontWeight: 700,
                                            cursor: "pointer"
                                        }}>隐藏</button>
                                    </div>
                                </div>
                            ))
                        )}
                    </>
                )}

                {tab === "reports" && (
                    <>
                        {reportsLoading ? (
                            <div style={{ textAlign: "center", padding: 40, color: "#4a7c50", fontSize: 13 }}>加载中...</div>
                        ) : reports.length === 0 ? (
                            <div style={{ textAlign: "center", padding: 40, color: "#4a7c50", fontSize: 13 }}>
                                <div style={{ fontSize: 32, marginBottom: 8 }}>🎉</div>
                                暂无举报记录
                            </div>
                        ) : (
                            reports.map(report => {
                                const stStyle = reportStatusStyle(report.status);
                                return (
                                    <div key={report.id} style={{
                                        background: "rgba(255,255,255,0.75)",
                                        backdropFilter: "blur(16px)",
                                        borderRadius: 16,
                                        padding: 12,
                                        marginBottom: 10,
                                        border: "1px solid rgba(255,255,255,0.6)",
                                        boxShadow: "0 2px 8px rgba(46,92,51,0.04)"
                                    }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
                                            <span style={{
                                                fontSize: 10,
                                                padding: "2px 8px",
                                                borderRadius: 6,
                                                background: stStyle.background,
                                                color: stStyle.color,
                                                fontWeight: 700
                                            }}>{reportStatusLabel(report.status)}</span>
                                            <span style={{
                                                fontSize: 10,
                                                padding: "2px 8px",
                                                borderRadius: 6,
                                                background: "rgba(46,125,50,0.08)",
                                                color: "#2e7d32"
                                            }}>{targetTypeLabel(report.target_type)}</span>
                                        </div>
                                        <div style={{ fontSize: 12, color: "#2e5c33", marginBottom: 4 }}>
                                            举报人：{report.reporter_id}
                                        </div>
                                        <div style={{ fontSize: 12, color: "#4a7c50", marginBottom: 2 }}>
                                            原因：{report.reason}
                                        </div>
                                        {report.description && (
                                            <div style={{ fontSize: 11, color: "#666", marginBottom: 2 }}>
                                                补充：{report.description}
                                            </div>
                                        )}
                                        <div style={{ fontSize: 10, color: "#5a9e6a", opacity: 0.8, marginBottom: 2 }}>
                                            目标ID：{report.target_id}
                                        </div>
                                        <div style={{ fontSize: 10, color: "#5a9e6a", opacity: 0.8, marginBottom: 8 }}>
                                            {formatTime(report.created_at)}
                                        </div>
                                        {report.status === "pending" && (
                                            <div style={{ display: "flex", gap: 8 }}>
                                                <button onClick={() => handleReport(report.id, "reject")} style={{
                                                    flex: 1,
                                                    padding: "7px 0",
                                                    borderRadius: 10,
                                                    border: "none",
                                                    background: "rgba(0,0,0,0.06)",
                                                    color: "#666",
                                                    fontSize: 12,
                                                    fontWeight: 700,
                                                    cursor: "pointer"
                                                }}>忽略</button>
                                                <button onClick={() => {
                                                    if (confirm("确认删除该举报目标？此操作不可逆。")) {
                                                        handleReport(report.id, "approve");
                                                    }
                                                }} style={{
                                                    flex: 1,
                                                    padding: "7px 0",
                                                    borderRadius: 10,
                                                    border: "none",
                                                    background: "rgba(239,83,80,0.1)",
                                                    color: "#c62828",
                                                    fontSize: 12,
                                                    fontWeight: 700,
                                                    cursor: "pointer"
                                                }}>删除目标</button>
                                            </div>
                                        )}
                                    </div>
                                );
                            })
                        )}
                    </>
                )}

                {tab === "tags" && (
                    <>
                        {tagsLoading ? (
                            <div style={{ textAlign: "center", padding: 40, color: "#4a7c50", fontSize: 13 }}>加载中...</div>
                        ) : tags.length === 0 ? (
                            <div style={{ textAlign: "center", padding: 40, color: "#4a7c50", fontSize: 13 }}>
                                <div style={{ fontSize: 32, marginBottom: 8 }}>🎉</div>
                                暂无待审核标签
                            </div>
                        ) : (
                            tags.map(tag => (
                                <div key={tag.id} style={{
                                    background: "rgba(255,255,255,0.75)",
                                    backdropFilter: "blur(16px)",
                                    borderRadius: 16,
                                    padding: 12,
                                    marginBottom: 10,
                                    border: "1px solid rgba(255,255,255,0.6)",
                                    boxShadow: "0 2px 8px rgba(46,92,51,0.04)"
                                }}>
                                    <div style={{ fontSize: 14, fontWeight: 700, color: "#2e5c33", marginBottom: 6 }}>
                                        {tag.name}
                                    </div>
                                    <div style={{ fontSize: 10, color: "#5a9e6a", opacity: 0.8, marginBottom: 8 }}>
                                        创建时间：{formatTime(tag.created_at)}
                                        {tag.use_count !== undefined && " · 使用 " + tag.use_count + " 次"}
                                    </div>
                                    <div style={{ display: "flex", gap: 8 }}>
                                        <button onClick={() => handleTag(tag.id, true)} style={{
                                            flex: 1,
                                            padding: "7px 0",
                                            borderRadius: 10,
                                            border: "none",
                                            background: "linear-gradient(135deg, #2e7d32, #5a9e6a)",
                                            color: "#fff",
                                            fontSize: 12,
                                            fontWeight: 700,
                                            cursor: "pointer"
                                        }}>通过</button>
                                        <button onClick={() => handleTag(tag.id, false)} style={{
                                            flex: 1,
                                            padding: "7px 0",
                                            borderRadius: 10,
                                            border: "none",
                                            background: "rgba(239,83,80,0.1)",
                                            color: "#c62828",
                                            fontSize: 12,
                                            fontWeight: 700,
                                            cursor: "pointer"
                                        }}>拒绝</button>
                                    </div>
                                </div>
                            ))
                        )}
                    </>
                )}
            </div>

            {rejectUser && (
                <div style={{
                    position: "absolute",
                    inset: 0,
                    background: "rgba(0,0,0,0.45)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    zIndex: 100,
                    padding: 20
                }}>
                    <div style={{
                        background: "white",
                        borderRadius: 20,
                        padding: 20,
                        width: "100%",
                        maxWidth: 320,
                        boxShadow: "0 10px 40px rgba(0,0,0,0.2)"
                    }}>
                        <div style={{ fontSize: 16, fontWeight: 800, color: "#2e5c33", marginBottom: 8 }}>拒绝 {rejectUser.username}</div>
                        <textarea
                            value={rejectReason}
                            onChange={e => setRejectReason(e.target.value)}
                            placeholder="填写拒绝理由"
                            style={{
                                width: "100%",
                                minHeight: 80,
                                padding: 10,
                                borderRadius: 10,
                                border: "1.5px solid rgba(165,214,167,0.5)",
                                fontSize: 13,
                                outline: "none",
                                boxSizing: "border-box",
                                resize: "none"
                            }}
                        />
                        <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
                            <button onClick={() => { setRejectUser(null); setRejectReason(""); }} style={{
                                flex: 1,
                                padding: "9px 0",
                                borderRadius: 10,
                                border: "none",
                                background: "#f0f0f0",
                                color: "#666",
                                fontSize: 13,
                                fontWeight: 600,
                                cursor: "pointer"
                            }}>取消</button>
                            <button onClick={() => reject(rejectUser)} style={{
                                flex: 1,
                                padding: "9px 0",
                                borderRadius: 10,
                                border: "none",
                                background: "linear-gradient(135deg, #ef4444, #dc2626)",
                                color: "#fff",
                                fontSize: 13,
                                fontWeight: 600,
                                cursor: "pointer"
                            }}>确认拒绝</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
