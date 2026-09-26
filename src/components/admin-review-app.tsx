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

export function AdminReviewApp({ loginUsername, onClose }: { loginUsername: string; onClose?: () => void }) {
    const [tab, setTab] = useState<"admin" | "user">("admin");
    const [users, setUsers] = useState<ReviewUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [rejectUser, setRejectUser] = useState<ReviewUser | null>(null);
    const [rejectReason, setRejectReason] = useState("");

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

    useEffect(() => {
        fetchPending();
    }, []);

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
                        <div style={{ fontSize: 14, fontWeight: 800, color: "#2e5c33" }}>用户审核</div>
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
                gap: 8,
                padding: "10px 14px",
                borderBottom: "1px solid rgba(46,92,51,0.06)"
            }}>
                <button onClick={() => setTab("admin")} style={{
                    flex: 1,
                    padding: "8px 0",
                    borderRadius: 12,
                    border: "none",
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: "pointer",
                    background: tab === "admin" ? "linear-gradient(135deg, #f59e0b, #d97706)" : "rgba(0,0,0,0.04)",
                    color: tab === "admin" ? "#fff" : "#666"
                }}>管理员审核 ({adminQueue.length})</button>
                <button onClick={() => setTab("user")} style={{
                    flex: 1,
                    padding: "8px 0",
                    borderRadius: 12,
                    border: "none",
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: "pointer",
                    background: tab === "user" ? "linear-gradient(135deg, #2e7d32, #5a9e6a)" : "rgba(0,0,0,0.04)",
                    color: tab === "user" ? "#fff" : "#666"
                }}>普通用户审核 ({userQueue.length})</button>
            </div>

            {error && (
                <div style={{ margin: "10px 14px", padding: "10px 12px", background: "rgba(239,83,80,0.08)", borderRadius: 10, color: "#c62828", fontSize: 13 }}>
                    {error}
                </div>
            )}

            <div style={{ flex: 1, overflowY: "auto", padding: "10px 14px" }}>
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
                                        <div style={{ fontSize: 11, color: "#4a7c50", marginBottom: 2 }}>邀请码：{user.invite_code_used || "-"}{user.referrer_name ? `（邀请人：${user.referrer_name}）` : ""}</div>
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
