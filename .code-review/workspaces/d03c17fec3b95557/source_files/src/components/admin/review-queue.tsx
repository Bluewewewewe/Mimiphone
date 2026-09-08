"use client";

import { useEffect, useMemo, useState } from "react";

type ReviewResult = "approved" | "rejected" | "grace_period";

type QueueUser = {
  id: string;
  username: string;
  weibo_nickname?: string;
  weibo_link?: string;
  weibo_level?: number;
  weibo_screenshot_url?: string;
  referrer_id?: string;
  referrer_name?: string;
  referrer_verify_status?: string;
  referrer_ban_status?: string;
  created_at: string;
  assignment_id?: number;
  assigned_to?: string;
  assigned_to_name?: string;
  assigned_at?: string;
  deadline?: string;
  priority: number;
  priority_color: "red" | "orange" | "yellow" | "gray";
  countdown_text: string;
  reviewed_by?: string;
  reviewed_by_name?: string;
  reviewed_at?: string;
  review_result?: ReviewResult;
};

type QueueStats = {
  total_pending: number;
  unassigned: number;
  reviewed_today: number;
  approval_rate: number;
  overdue_count: number;
};

type HistoryItem = {
  user_id: string;
  username: string;
  weibo_nickname?: string;
  weibo_link?: string;
  review_result: ReviewResult;
  reviewed_by: string;
  reviewed_by_name?: string;
  reviewed_at: string;
  notes?: string;
};

const API_URL = "/api/admin/review-queue";
const AUTH_URL = "/api/auth";

export default function ReviewQueue({ currentAdminId, token: tokenProp }: { currentAdminId?: string; token?: string }) {
  const token = tokenProp || (typeof window !== "undefined" ? localStorage.getItem("auth_token") || "" : "");

  const authFetch = async (url: string, body: Record<string, unknown>) => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, authToken: token }),
    });
    return res.json() as Promise<{ success: boolean; data?: unknown; error?: string }>;
  };
  const [users, setUsers] = useState<QueueUser[]>([]);
  const [stats, setStats] = useState<QueueStats | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [filter, setFilter] = useState<"all" | "mine" | "unassigned" | "overdue" | "my_reviews">("all");
  const [subTab, setSubTab] = useState<"queue" | "history">("queue");
  const [loading, setLoading] = useState(false);
  const [autoAssigning, setAutoAssigning] = useState(false);
  const [error, setError] = useState("");
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyKeyword, setHistoryKeyword] = useState("");
  const [historyResultFilter, setHistoryResultFilter] = useState<"all" | ReviewResult>("all");
  const [modal, setModal] = useState<{ type: ReviewResult | null; user: QueueUser | null; note: string }>({
    type: null,
    user: null,
    note: "",
  });
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [skipping, setSkipping] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState("");

  const loadQueue = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await authFetch(API_URL, { action: "list_pending" });
      if (res.success && res.data && typeof res.data === "object") {
        const data = res.data as { list: QueueUser[]; users?: QueueUser[]; stats: QueueStats };
        setUsers((data.list || data.users) as QueueUser[]);
        setStats(data.stats || null);
      } else {
        setError(res.error || "加载审核队列失败");
      }
    } catch (e) {
      setError("网络错误，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  const autoAssign = async () => {
    setAutoAssigning(true);
    try {
      await authFetch(API_URL, { action: "auto_assign" });
    } finally {
      setAutoAssigning(false);
    }
  };

  const loadHistory = async (page = historyPage) => {
    setLoading(true);
    try {
      const res = await authFetch(API_URL, {
        action: "review_history",
        page,
        page_size: 20,
        keyword: historyKeyword,
        review_result: historyResultFilter === "all" ? undefined : historyResultFilter,
        reviewed_by: filter === "my_reviews" ? currentAdminId : undefined,
      });
      if (res.success && res.data && typeof res.data === "object") {
        const data = res.data as { list: HistoryItem[]; total: number; page: number };
        setHistory(data.list || []);
        setHistoryTotal(data.total || 0);
        setHistoryPage(data.page || page);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      await autoAssign();
      if (mounted) await loadQueue();
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (subTab === "history" || filter === "my_reviews") {
      loadHistory(1);
    }
  }, [subTab, historyKeyword, historyResultFilter, filter]);

  const handleClaim = async (userId: string) => {
    setLoading(true);
    const res = await authFetch(API_URL, { action: "claim", user_id: userId });
    if (res.success) {
      setMessage("认领成功");
      setTimeout(() => setMessage(""), 2000);
      await loadQueue();
    } else {
      setError(res.error || "认领失败");
    }
    setLoading(false);
  };

  const submitReview = async (type: ReviewResult, note: string) => {
    if (!modal.user) return;
    setLoading(true);
    const action = type === "approved" ? "approve_user" : type === "rejected" ? "reject_user" : "grace_period";
    const res = await authFetch(AUTH_URL, {
      action,
      targetUserId: modal.user.id,
      reason: note,
    });
    if (res.success) {
      setMessage(type === "approved" ? "已通过" : type === "rejected" ? "已拒绝" : "已设置宽限期");
      setTimeout(() => setMessage(""), 2000);
      setModal({ type: null, user: null, note: "" });
      await loadQueue();
    } else {
      setError(res.error || "操作失败");
    }
    setLoading(false);
  };

  const skipUser = (userId: string) => {
    setSkipping((prev) => new Set(prev).add(userId));
  };

  const filteredUsers = useMemo(() => {
    let list = users;
    if (filter === "mine") {
      list = list.filter((u) => u.assigned_to === currentAdminId);
    } else if (filter === "unassigned") {
      list = list.filter((u) => !u.assigned_to);
    } else if (filter === "overdue") {
      list = list.filter((u) => u.priority === 1);
    }
    list = list.filter((u) => !skipping.has(u.id));
    return list;
  }, [users, filter, skipping, currentAdminId]);

  const formatDate = (iso?: string) => {
    if (!iso) return "-";
    const d = new Date(iso);
    const now = new Date();
    const sameYear = d.getFullYear() === now.getFullYear();
    if (sameYear) {
      return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    }
    return d.toLocaleString("zh-CN");
  };

  const priorityDot = (color: QueueUser["priority_color"]) => {
    const map = {
      red: "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]",
      orange: "bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.7)]",
      yellow: "bg-yellow-400 shadow-[0_0_8px_rgba(250,204,21,0.7)]",
      gray: "bg-slate-500",
    };
    return <span className={`inline-block h-3 w-3 rounded-full ${map[color]}`} />;
  };

  const resultBadge = (result?: ReviewResult) => {
    if (!result) return null;
    const map: Record<ReviewResult, string> = {
      approved: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
      rejected: "bg-rose-500/20 text-rose-300 border-rose-500/30",
      grace_period: "bg-amber-500/20 text-amber-300 border-amber-500/30",
    };
    const text = { approved: "已通过", rejected: "已拒绝", grace_period: "宽限期" };
    return (
      <span className={`rounded border px-2 py-0.5 text-xs ${map[result]}`}>
        {text[result]}
      </span>
    );
  };

  return (
    <div className="admin-section">
      <h2 className="mb-4 text-xl font-bold text-white">用户审核队列</h2>

      {error && <div className="mb-4 rounded border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{error}</div>}
      {message && <div className="mb-4 rounded border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">{message}</div>}

      {/* Stats */}
      {stats && (
        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
          {[
            { label: "待审核总数", value: stats.total_pending },
            { label: "未分配数", value: stats.unassigned },
            { label: "今日已审数", value: stats.reviewed_today },
            { label: "通过率", value: `${stats.approval_rate}%` },
            { label: "超时待回收", value: stats.overdue_count, danger: true },
          ].map((s) => (
            <div
              key={s.label}
              className={`rounded-xl border p-4 text-center ${
                s.danger
                  ? "border-rose-500/30 bg-rose-500/10"
                  : "border-indigo-500/20 bg-indigo-500/10"
              }`}
            >
              <div className={`text-2xl font-bold ${s.danger ? "text-rose-400" : "text-indigo-300"}`}>{s.value}</div>
              <div className="mt-1 text-xs text-slate-400">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="mb-4 flex flex-wrap gap-2 border-b border-indigo-500/20 pb-3">
        {[
          { key: "queue", label: "待审队列" },
          { key: "history", label: "审核记录" },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => {
              setSubTab(t.key as "queue" | "history");
              if (t.key === "queue") setFilter("all");
            }}
            className={`min-h-[44px] rounded-lg px-4 py-2 text-sm font-medium transition ${
              subTab === t.key
                ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/30"
                : "text-slate-300 hover:bg-white/5"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {subTab === "queue" && (
        <>
          <div className="mb-4 flex flex-wrap gap-2">
            {[
              { key: "all", label: "全部" },
              { key: "mine", label: "分配给我" },
              { key: "unassigned", label: "未分配" },
              { key: "overdue", label: "超时" },
              { key: "my_reviews", label: "我审过的" },
            ].map((f) => (
              <button
                key={f.key}
                onClick={() => {
                  if (f.key === "my_reviews") {
                    setSubTab("history");
                    setFilter("my_reviews");
                  } else {
                    setFilter(f.key as typeof filter);
                  }
                }}
                className={`min-h-[44px] rounded-lg px-3 py-2 text-xs transition ${
                  filter === f.key
                    ? "bg-violet-600 text-white"
                    : "border border-indigo-500/20 bg-slate-800/50 text-slate-300 hover:bg-slate-700/50"
                }`}
              >
                {f.label}
              </button>
            ))}
            <button
              onClick={loadQueue}
              disabled={loading}
              className="ml-auto min-h-[44px] rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-2 text-xs text-indigo-300 transition hover:bg-indigo-500/20 disabled:opacity-50"
            >
              {loading ? "加载中..." : "刷新"}
            </button>
          </div>

          {filteredUsers.length === 0 ? (
            <div className="rounded-xl border border-dashed border-indigo-500/20 bg-slate-900/50 p-8 text-center text-slate-400">
              暂无待审核用户
            </div>
          ) : (
            <div className="space-y-3">
              {filteredUsers.map((u) => (
                <div
                  key={u.id}
                  className="relative overflow-hidden rounded-xl border border-indigo-500/20 bg-slate-900/70 p-4 backdrop-blur-sm transition hover:border-indigo-500/40"
                >
                  {u.referrer_ban_status && u.referrer_ban_status !== "none" && (
                    <div className="mb-3 rounded bg-rose-500/20 px-2 py-1 text-xs text-rose-300">
                      ⚠️ 邀请人已封禁
                    </div>
                  )}
                  <div className="flex flex-col gap-4 md:flex-row md:items-start">
                    <div className="flex items-center gap-3 pt-1">
                      {priorityDot(u.priority_color)}
                      <div>
                        <div className="font-semibold text-white">{u.username}</div>
                        <div className="text-xs text-slate-400">ID: {u.id}</div>
                      </div>
                    </div>

                    <div className="flex-1 space-y-1 text-sm">
                      <div className="text-slate-300">
                        微博：<span className="text-white">{u.weibo_nickname || "-"}</span>
                        {u.weibo_level ? ` · LV.${u.weibo_level}` : ""}
                      </div>
                      {u.weibo_link && (
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-slate-400">链接：</span>
                          <a
                            href={u.weibo_link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="max-w-[200px] truncate text-indigo-300 underline hover:text-indigo-200"
                            title={u.weibo_link}
                          >
                            {u.weibo_link}
                          </a>
                          <button
                            onClick={async () => {
                              try {
                                await navigator.clipboard.writeText(u.weibo_link || "");
                              } catch {
                                // fallback
                              }
                            }}
                            className="rounded border border-indigo-500/30 bg-indigo-500/10 px-2 py-0.5 text-indigo-300 transition hover:bg-indigo-500/20"
                          >
                            复制
                          </button>
                        </div>
                      )}
                      {u.weibo_screenshot_url && (
                        <div>
                          <button
                            onClick={() => setLightboxUrl(u.weibo_screenshot_url || null)}
                            className="text-xs text-indigo-300 underline hover:text-indigo-200"
                          >
                            查看截图
                          </button>
                        </div>
                      )}
                      {u.referrer_name && (
                        <div className="text-slate-400">
                          邀请人：{u.referrer_name}
                          {u.referrer_verify_status === "verified" && " ✅"}
                          {u.referrer_verify_status === "pending" && " ⏳"}
                          {(u.referrer_ban_status === "temp_banned" || u.referrer_ban_status === "perma_banned") && " ❌"}
                        </div>
                      )}
                      <div className="text-xs text-slate-500">注册时间：{formatDate(u.created_at)}</div>
                      {u.assigned_to ? (
                        <div
                          className={`text-xs ${
                            u.priority === 1 ? "text-rose-400" : u.priority === 2 ? "text-orange-400" : "text-slate-400"
                          }`}
                        >
                          分配给 {u.assigned_to_name || u.assigned_to} · {u.countdown_text}
                        </div>
                      ) : (
                        <div className="text-xs text-slate-500">待分配</div>
                      )}
                      {u.reviewed_by && (
                        <div className="text-xs text-slate-500">
                          审核人：{u.reviewed_by_name || u.reviewed_by} · {formatDate(u.reviewed_at)}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2 md:flex-col md:items-end">
                      {!u.assigned_to && (
                        <button
                          onClick={() => handleClaim(u.id)}
                          disabled={loading}
                          className="min-h-[44px] rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-2 text-xs text-indigo-300 transition hover:bg-indigo-500/20 disabled:opacity-50"
                        >
                          认领
                        </button>
                      )}
                      <div className="flex gap-2">
                        <button
                          onClick={() => setModal({ type: "approved", user: u, note: "" })}
                          disabled={loading}
                          className="min-h-[44px] rounded-lg bg-emerald-600 px-3 py-2 text-xs text-white transition hover:bg-emerald-500 disabled:opacity-50"
                        >
                          通过
                        </button>
                        <button
                          onClick={() => setModal({ type: "rejected", user: u, note: "" })}
                          disabled={loading}
                          className="min-h-[44px] rounded-lg bg-rose-600 px-3 py-2 text-xs text-white transition hover:bg-rose-500 disabled:opacity-50"
                        >
                          拒绝
                        </button>
                        <button
                          onClick={() => setModal({ type: "grace_period", user: u, note: "" })}
                          disabled={loading}
                          className="min-h-[44px] rounded-lg bg-amber-600 px-3 py-2 text-xs text-white transition hover:bg-amber-500 disabled:opacity-50"
                        >
                          宽限期30天
                        </button>
                        <button
                          onClick={() => skipUser(u.id)}
                          className="min-h-[44px] rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-xs text-slate-300 transition hover:bg-slate-700"
                        >
                          跳过
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {subTab === "history" && (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row">
            <input
              type="text"
              placeholder="搜索用户名 / 微博昵称 / 审核人"
              value={historyKeyword}
              onChange={(e) => setHistoryKeyword(e.target.value)}
              className="admin-input flex-1"
            />
            <select
              value={historyResultFilter}
              onChange={(e) => setHistoryResultFilter(e.target.value as "all" | ReviewResult)}
              className="admin-input"
            >
              <option value="all">全部结果</option>
              <option value="approved">已通过</option>
              <option value="rejected">已拒绝</option>
              <option value="grace_period">宽限期</option>
            </select>
          </div>

          {history.length === 0 ? (
            <div className="rounded-xl border border-dashed border-indigo-500/20 bg-slate-900/50 p-8 text-center text-slate-400">
              暂无审核记录
            </div>
          ) : (
            <>
              <div className="hidden overflow-hidden rounded-xl border border-indigo-500/20 md:block">
                <table className="w-full text-left text-sm">
                  <thead className="bg-indigo-500/10 text-indigo-200">
                    <tr>
                      <th className="px-4 py-3">用户</th>
                      <th className="px-4 py-3">微博昵称</th>
                      <th className="px-4 py-3">结果</th>
                      <th className="px-4 py-3">审核人</th>
                      <th className="px-4 py-3">审核时间</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-indigo-500/10">
                    {history.map((h) => (
                      <tr key={`${h.user_id}-${h.reviewed_at}`} className="hover:bg-white/5">
                        <td className="px-4 py-3 text-white">{h.username}</td>
                        <td className="px-4 py-3 text-slate-300">{h.weibo_nickname || "-"}</td>
                        <td className="px-4 py-3">{resultBadge(h.review_result)}</td>
                        <td className="px-4 py-3 text-slate-300">{h.reviewed_by_name || h.reviewed_by}</td>
                        <td className="px-4 py-3 text-slate-400">{formatDate(h.reviewed_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="space-y-3 md:hidden">
                {history.map((h) => (
                  <div key={`${h.user_id}-${h.reviewed_at}`} className="rounded-xl border border-indigo-500/20 bg-slate-900/70 p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-white">{h.username}</span>
                      {resultBadge(h.review_result)}
                    </div>
                    <div className="mt-1 text-slate-400">微博：{h.weibo_nickname || "-"}</div>
                    <div className="mt-1 text-slate-500">
                      审核人：{h.reviewed_by_name || h.reviewed_by} · {formatDate(h.reviewed_at)}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between text-sm">
                <button
                  onClick={() => loadHistory(historyPage - 1)}
                  disabled={historyPage <= 1}
                  className="rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-2 text-indigo-300 disabled:opacity-50"
                >
                  上一页
                </button>
                <span className="text-slate-400">
                  第 {historyPage} 页 / 共 {Math.max(1, Math.ceil(historyTotal / 20))} 页
                </span>
                <button
                  onClick={() => loadHistory(historyPage + 1)}
                  disabled={historyPage >= Math.ceil(historyTotal / 20)}
                  className="rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-2 text-indigo-300 disabled:opacity-50"
                >
                  下一页
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Modal */}
      {modal.user && modal.type && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-indigo-500/30 bg-[#16133a] p-6 shadow-2xl">
            <h3 className="mb-2 text-lg font-bold text-white">
              {modal.type === "approved" ? "确认通过" : modal.type === "rejected" ? "确认拒绝" : "确认宽限期"}
            </h3>
            <p className="mb-4 text-sm text-slate-300">
              用户：{modal.user.username}
              {modal.user.weibo_nickname ? `（${modal.user.weibo_nickname}）` : ""}
            </p>
            <textarea
              value={modal.note}
              onChange={(e) => setModal({ ...modal, note: e.target.value })}
              placeholder={modal.type === "rejected" ? "填写拒绝原因（可选）" : "备注（可选）"}
              className="admin-input mb-4 min-h-[100px] w-full resize-none"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setModal({ type: null, user: null, note: "" })}
                className="min-h-[44px] rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 text-sm text-slate-300 transition hover:bg-slate-700"
              >
                取消
              </button>
              <button
                onClick={() => modal.type && submitReview(modal.type, modal.note)}
                disabled={loading}
                className={`min-h-[44px] rounded-lg px-4 py-2 text-sm text-white transition disabled:opacity-50 ${
                  modal.type === "approved"
                    ? "bg-emerald-600 hover:bg-emerald-500"
                    : modal.type === "rejected"
                      ? "bg-rose-600 hover:bg-rose-500"
                      : "bg-amber-600 hover:bg-amber-500"
                }`}
              >
                {loading ? "处理中..." : "确认"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={() => setLightboxUrl(null)}
        >
          <img src={lightboxUrl} alt="截图" className="max-h-[90vh] max-w-full rounded-lg object-contain" />
        </div>
      )}
    </div>
  );
}
