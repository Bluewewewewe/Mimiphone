"use client";

import { useState, useEffect } from "react";

interface AdminUsersProps {
  token: string;
}

interface UserItem {
  id: string;
  username: string;
  display_name?: string;
  weibo_name?: string;
  weibo_level?: number;
  status: string;
  verify_status?: string;
  ban_status?: string;
  ban_until?: string;
  referrer_id?: string;
  referrer_name?: string | null;
  reviewed_by?: string | null;
  reviewer_name?: string | null;
  reviewed_at?: string | null;
  review_result?: string | null;
  invite_count: number;
  violation_count: number;
  role?: string;
  created_at: string;
}

interface UserListResponse {
  list: UserItem[];
  total: number;
  page: number;
  pageSize: number;
}

const banStatusMap: Record<string, string> = {
  none: "正常",
  warning: "警告",
  muted: "禁言",
  restricted: "限制功能",
  temp_banned: "临时封禁",
  perma_banned: "永久封禁",
};

const statusEmoji: Record<string, string> = {
  approved: "✅",
  pending: "⏳",
  rejected: "❌",
};

export default function AdminUsers({ token }: AdminUsersProps) {
  const [data, setData] = useState<UserListResponse | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [violationFilter, setViolationFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [detailUser, setDetailUser] = useState<UserItem | null>(null);
  const [banModal, setBanModal] = useState<{
    user: UserItem;
    status: string;
  } | null>(null);
  const [banReason, setBanReason] = useState("");
  const [banDuration, setBanDuration] = useState("7");
  const [message, setMessage] = useState("");

  const load = async (p = page) => {
    setLoading(true);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "list_users",
          authToken: token,
          search,
          status: statusFilter,
          violation: violationFilter,
          page: p,
          pageSize: 20,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setData(json.data);
      } else {
        showMessage(json.error || "加载失败");
      }
    } catch {
      showMessage("网络错误");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setPage(1);
    load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, statusFilter, violationFilter, token]);

  useEffect(() => {
    load(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, token]);

  const showMessage = (msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(""), 3000);
  };

  const handleBan = async () => {
    if (!banModal) return;
    const body: Record<string, unknown> = {
      action: "ban_user",
      authToken: token,
      targetUserId: banModal.user.id,
      banStatus: banModal.status,
      reason: banReason,
    };
    if (banModal.status === "temp_banned") {
      body.duration = parseInt(banDuration, 10);
    }
    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    showMessage(json.success ? json.message : json.error || "操作失败");
    if (json.success) {
      setBanModal(null);
      setBanReason("");
      load();
    }
  };

  const handleSetRole = async (targetUserId: string, role: string) => {
    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "set_role", authToken: token, targetUserId, role }),
    });
    const json = await res.json();
    showMessage(json.success ? json.message || "角色已更新" : json.error || "操作失败");
    if (json.success) {
      setDetailUser(null);
      load();
    }
  };

  const renderBanModal = () => {
    if (!banModal) return null;
    const isLift = banModal.status === "none";
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur">
        <div className="w-full max-w-md rounded-2xl border border-purple-500/30 bg-slate-900/95 p-5 shadow-2xl">
          <h3 className="mb-3 text-lg font-bold text-cyan-300">
            {isLift ? "解除处罚" : `执行处罚：${banStatusMap[banModal.status]}`}
          </h3>
          <div className="mb-3 text-sm text-slate-300">
            用户：{banModal.user.username}
          </div>
          {!isLift && banModal.status === "temp_banned" && (
            <div className="mb-3">
              <label className="mb-1 block text-sm text-cyan-200">封禁时长</label>
              <select
                value={banDuration}
                onChange={(e) => setBanDuration(e.target.value)}
                className="w-full rounded-lg border border-cyan-500/30 bg-slate-800 p-2 text-white outline-none focus:border-cyan-400"
              >
                <option value="7">7天</option>
                <option value="30">30天</option>
                <option value="custom">自定义</option>
              </select>
              {banDuration === "custom" && (
                <input
                  type="number"
                  min={1}
                  placeholder="天数"
                  onChange={(e) => setBanDuration(e.target.value)}
                  className="mt-2 w-full rounded-lg border border-cyan-500/30 bg-slate-800 p-2 text-white outline-none"
                />
              )}
            </div>
          )}
          {!isLift && (
            <div className="mb-4">
              <label className="mb-1 block text-sm text-cyan-200">原因</label>
              <textarea
                value={banReason}
                onChange={(e) => setBanReason(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-cyan-500/30 bg-slate-800 p-2 text-white outline-none focus:border-cyan-400"
              />
            </div>
          )}
          <div className="flex gap-3">
            <button
              onClick={() => setBanModal(null)}
              className="flex-1 rounded-lg border border-slate-600 bg-slate-800 py-3 text-sm text-white transition hover:bg-slate-700"
            >
              取消
            </button>
            <button
              onClick={handleBan}
              className="flex-1 rounded-lg bg-gradient-to-r from-purple-600 to-blue-600 py-3 text-sm font-semibold text-white shadow-lg transition hover:from-purple-500 hover:to-blue-500"
            >
              确认
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderDetail = () => {
    if (!detailUser) return null;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur">
        <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-cyan-500/30 bg-slate-900/95 p-5 shadow-2xl">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-bold text-cyan-300">用户详情</h3>
            <button
              onClick={() => setDetailUser(null)}
              className="text-2xl text-slate-400 hover:text-white"
            >
              ×
            </button>
          </div>
          <div className="space-y-3 text-sm text-slate-200">
            <div><span className="text-cyan-200/70">ID：</span>{detailUser.id}</div>
            <div><span className="text-cyan-200/70">用户名：</span>{detailUser.username}</div>
            <div><span className="text-cyan-200/70">微博昵称：</span>{detailUser.weibo_name || "-"}</div>
            <div><span className="text-cyan-200/70">超话等级：</span>{detailUser.weibo_level || "-"}</div>
            <div><span className="text-cyan-200/70">验证状态：</span>{statusEmoji[detailUser.status] || "-"} {detailUser.status}</div>
            <div><span className="text-cyan-200/70">当前角色：</span>{detailUser.role || "user"}</div>
            <div><span className="text-cyan-200/70">封禁状态：</span>{banStatusMap[detailUser.ban_status || "none"]}</div>
            {detailUser.ban_until && (
              <div><span className="text-cyan-200/70">解封时间：</span>{new Date(detailUser.ban_until).toLocaleString()}</div>
            )}
            <div><span className="text-cyan-200/70">邀请人：</span>{detailUser.referrer_name || "-"}</div>
            {detailUser.reviewer_name && (
              <>
                <div><span className="text-cyan-200/70">审核人：</span>{detailUser.reviewer_name}</div>
                <div><span className="text-cyan-200/70">审核时间：</span>{new Date(detailUser.reviewed_at || "").toLocaleString()}</div>
                <div><span className="text-cyan-200/70">审核结果：</span>{detailUser.review_result || "-"}</div>
              </>
            )}
            <div><span className="text-cyan-200/70">邀请人数：</span>{detailUser.invite_count}</div>
            <div><span className="text-cyan-200/70">违规次数：</span>{detailUser.violation_count}</div>
            <div><span className="text-cyan-200/70">注册时间：</span>{new Date(detailUser.created_at).toLocaleString()}</div>
          </div>
          <div className="mt-4">
            <div className="mb-2 text-sm font-semibold text-cyan-200">🎭 角色任命</div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: "👤 用户", role: "user" },
                { label: "🔧 管理员", role: "admin" },
                { label: "👑 超管", role: "super_admin" },
              ].map((btn) => (
                <button
                  key={btn.role}
                  onClick={() => handleSetRole(detailUser.id, btn.role)}
                  className="min-h-[40px] rounded-lg border border-purple-500/30 bg-purple-600/20 text-xs text-purple-200 transition hover:bg-purple-600/40"
                >
                  {btn.label}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-2 md:grid-cols-3">
            {[
              { label: "⚠️ 警告", status: "warning" },
              { label: "🔇 禁言", status: "muted" },
              { label: "🔒 限制功能", status: "restricted" },
              { label: "🚫 临时封禁", status: "temp_banned" },
              { label: "⛔ 永久封禁", status: "perma_banned" },
              { label: "✅ 解除", status: "none" },
            ].map((btn) => (
              <button
                key={btn.status}
                onClick={() => {
                  setDetailUser(null);
                  setBanModal({ user: detailUser, status: btn.status });
                }}
                className="min-h-[44px] rounded-lg border border-cyan-500/30 bg-slate-800 py-2 text-xs text-white transition hover:border-cyan-400 hover:bg-slate-700"
              >
                {btn.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const renderFilters = () => (
    <div className="mb-4 flex flex-col gap-3 md:flex-row">
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="搜索用户名/ID"
        className="flex-1 rounded-lg border border-cyan-500/30 bg-slate-800/80 p-3 text-white placeholder-cyan-200/40 outline-none focus:border-cyan-400"
      />
      <select
        value={statusFilter}
        onChange={(e) => setStatusFilter(e.target.value)}
        className="rounded-lg border border-cyan-500/30 bg-slate-800/80 p-3 text-white outline-none focus:border-cyan-400"
      >
        <option value="all">全部状态</option>
        <option value="pending">待审核</option>
        <option value="approved">已通过</option>
        <option value="rejected">已拒绝</option>
        <option value="banned">已封禁</option>
      </select>
      <select
        value={violationFilter}
        onChange={(e) => setViolationFilter(e.target.value)}
        className="rounded-lg border border-cyan-500/30 bg-slate-800/80 p-3 text-white outline-none focus:border-cyan-400"
      >
        <option value="all">全部违规</option>
        <option value=">0">违规&gt;0</option>
        <option value=">=3">违规≥3</option>
      </select>
    </div>
  );

  const renderTable = () => (
    <div className="overflow-x-auto rounded-xl border border-cyan-500/20">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-800/80 text-cyan-200">
          <tr>
            <th className="p-3">用户名</th>
            <th className="p-3">微博</th>
            <th className="p-3">状态</th>
            <th className="p-3">邀请人</th>
            <th className="p-3">审核人</th>
            <th className="p-3">邀请数</th>
            <th className="p-3">违规</th>
            <th className="p-3">注册时间</th>
            <th className="p-3">操作</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-cyan-500/10">
          {data?.list.map((u) => (
            <tr key={u.id} className="bg-slate-900/40 hover:bg-slate-800/60">
              <td className="p-3 text-white">{u.username}</td>
              <td className="p-3 text-slate-300">{u.weibo_name || "-"}</td>
              <td className="p-3">
                <span className="text-xs">
                  {statusEmoji[u.status] || "-"} {u.status}
                </span>
                {u.ban_status && u.ban_status !== "none" && (
                  <div className="text-xs text-red-400">
                    {banStatusMap[u.ban_status]}
                  </div>
                )}
              </td>
              <td className="p-3 text-slate-300">{u.referrer_name || "-"}</td>
              <td className="p-3 text-slate-300">{u.reviewer_name || "-"}</td>
              <td className="p-3 text-slate-300">{u.invite_count}</td>
              <td className="p-3">
                {u.violation_count > 0 ? (
                  <span className="text-red-400">{u.violation_count}</span>
                ) : (
                  <span className="text-slate-500">0</span>
                )}
              </td>
              <td className="p-3 text-slate-400">
                {new Date(u.created_at).toLocaleDateString()}
              </td>
              <td className="p-3">
                <button
                  onClick={() => setDetailUser(u)}
                  className="min-h-[36px] rounded bg-cyan-600/20 px-3 py-1 text-xs text-cyan-300 transition hover:bg-cyan-600/30"
                >
                  详情
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const renderMobileCards = () => (
    <div className="space-y-3 md:hidden">
      {data?.list.map((u) => (
        <button
          key={u.id}
          onClick={() => setDetailUser(u)}
          className="w-full rounded-xl border border-cyan-500/20 bg-slate-900/60 p-4 text-left"
        >
          <div className="flex items-center justify-between">
            <div className="font-semibold text-white">{u.username}</div>
            <div className="text-xs text-slate-400">
              {statusEmoji[u.status] || ""} {u.status}
            </div>
          </div>
          <div className="mt-2 text-xs text-slate-300">
            微博：{u.weibo_name || "-"} · 邀请人：{u.referrer_name || "-"}
          </div>
          <div className="mt-1 text-xs text-slate-400">
            邀请 {u.invite_count} 人 · 违规{" "}
            {u.violation_count > 0 ? (
              <span className="text-red-400">{u.violation_count}</span>
            ) : (
              "0"
            )}
          </div>
        </button>
      ))}
    </div>
  );

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-cyan-300">👥 用户管理</h2>
      {message && (
        <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-sm text-cyan-200">
          {message}
        </div>
      )}
      {renderFilters()}
      {loading ? (
        <div className="py-10 text-center text-cyan-300">加载中...</div>
      ) : (
        <>
          <div className="hidden md:block">{renderTable()}</div>
          {renderMobileCards()}
          <div className="flex items-center justify-between pt-2 text-sm text-slate-300">
            <div>
              共 {data?.total || 0} 条 · 第 {data?.page || 1} /{" "}
              {Math.ceil((data?.total || 0) / (data?.pageSize || 20)) || 1} 页
            </div>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
                className="min-h-[44px] rounded-lg border border-cyan-500/30 bg-slate-800 px-4 py-2 text-white disabled:opacity-40"
              >
                上一页
              </button>
              <button
                disabled={
                  !data || page >= Math.ceil(data.total / data.pageSize)
                }
                onClick={() => setPage(page + 1)}
                className="min-h-[44px] rounded-lg border border-cyan-500/30 bg-slate-800 px-4 py-2 text-white disabled:opacity-40"
              >
                下一页
              </button>
            </div>
          </div>
        </>
      )}
      {renderDetail()}
      {renderBanModal()}
    </div>
  );
}
