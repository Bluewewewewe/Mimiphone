"use client";

import { useEffect, useState } from "react";

interface RedeemCode {
  code: string;
  reward_amount: number;
  max_uses: number;
  used_count: number;
  status: string;
  expires_at: string | null;
  created_at: string;
}

interface RedeemLog {
  id: string;
  code: string;
  user_id: string;
  username?: string;
  amount: number;
  redeemed_at: string;
}

interface AdminRedeemProps {
  token: string;
}

export function AdminRedeem({ token }: AdminRedeemProps) {
  const [tab, setTab] = useState<"codes" | "logs">("codes");
  const [codes, setCodes] = useState<RedeemCode[]>([]);
  const [logs, setLogs] = useState<RedeemLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [newReward, setNewReward] = useState("50");
  const [newMaxUses, setNewMaxUses] = useState("1");
  const [newExpires, setNewExpires] = useState("");

  async function callApi(action: string, extra?: Record<string, unknown>) {
    const res = await fetch("/api/admin/redeem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, authToken: token, ...extra }),
    });
    return res.json();
  }

  const fetchCodes = async () => {
    setLoading(true);
    try {
      const json = await callApi("list_codes");
      if (json.success) setCodes(json.data || []);
      else setMessage(json.error || "加载失败");
    } catch {
      setMessage("网络错误");
    } finally {
      setLoading(false);
    }
  };

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const json = await callApi("list_logs");
      if (json.success) setLogs(json.data || []);
      else setMessage(json.error || "加载失败");
    } catch {
      setMessage("网络错误");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCodes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreate = async () => {
    setMessage("");
    const json = await callApi("create", {
      customCode: newCode.trim() || undefined,
      rewardAmount: parseInt(newReward, 10) || 50,
      maxUses: parseInt(newMaxUses, 10) || 1,
      expiresInDays: newExpires ? parseInt(newExpires, 10) : undefined,
    });
    if (json.success) {
      setMessage(`创建成功！兑换码: ${json.data.code}`);
      setShowCreate(false);
      setNewCode("");
      setNewExpires("");
      fetchCodes();
    } else {
      setMessage(json.error || "创建失败");
    }
  };

  const handleToggleStatus = async (code: string, currentStatus: string) => {
    const newStatus = currentStatus === "active" ? "disabled" : "active";
    await callApi("toggle_status", { code, status: newStatus });
    fetchCodes();
  };

  const handleDelete = async (code: string) => {
    if (!window.confirm(`确定删除兑换码 ${code}？`)) return;
    await callApi("delete", { code });
    fetchCodes();
  };

  return (
    <div className="admin-section">
      <h2>🎁 兑换码管理</h2>

      <div className="admin-toolbar">
        <button
          className={`admin-btn ${tab === "codes" ? "" : ""}`}
          style={{ background: tab === "codes" ? "#7c3aed" : "#374151", color: "#fff" }}
          onClick={() => { setTab("codes"); fetchCodes(); }}
        >
          兑换码列表
        </button>
        <button
          className="admin-btn"
          style={{ background: tab === "logs" ? "#7c3aed" : "#374151", color: "#fff" }}
          onClick={() => { setTab("logs"); fetchLogs(); }}
        >
          兑换记录
        </button>
      </div>

      {message && <div className="admin-message" style={{ color: message.includes("成功") ? "#4ade80" : "#f87171" }}>{message}</div>}

      {tab === "codes" && (
        <>
          <div className="admin-toolbar">
            <button className="admin-btn" onClick={() => setShowCreate(!showCreate)}>
              {showCreate ? "取消创建" : "+ 创建兑换码"}
            </button>
          </div>

          {showCreate && (
            <div className="admin-card">
              <div className="admin-card-body" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <input
                  className="admin-input"
                  placeholder="自定义兑换码（留空自动生成）"
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value)}
                />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                  <input
                    className="admin-input"
                    type="number"
                    placeholder="奖励米米币"
                    value={newReward}
                    onChange={(e) => setNewReward(e.target.value)}
                  />
                  <input
                    className="admin-input"
                    type="number"
                    placeholder="可兑换总次数"
                    value={newMaxUses}
                    onChange={(e) => setNewMaxUses(e.target.value)}
                  />
                  <input
                    className="admin-input"
                    type="number"
                    placeholder="有效天数（选填）"
                    value={newExpires}
                    onChange={(e) => setNewExpires(e.target.value)}
                  />
                </div>
                <button className="admin-btn" style={{ background: "#16a34a", color: "#fff" }} onClick={handleCreate}>
                  确认创建
                </button>
              </div>
            </div>
          )}

          {loading ? (
            <div className="admin-loading">加载中...</div>
          ) : codes.length === 0 ? (
            <div className="admin-empty">暂无兑换码</div>
          ) : (
            <div className="admin-list">
              {codes.map((c) => (
                <div className="admin-card" key={c.code}>
                  <div className="admin-card-title" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontFamily: "monospace", fontSize: 16 }}>{c.code}</span>
                    <span
                      style={{
                        fontSize: 12,
                        padding: "2px 10px",
                        borderRadius: 999,
                        background: c.status === "active" ? "#14532d" : "#7f1d1d",
                        color: c.status === "active" ? "#86efac" : "#fca5a5",
                      }}
                    >
                      {c.status === "active" ? "启用" : "禁用"}
                    </span>
                  </div>
                  <div className="admin-card-meta" style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 6 }}>
                    <span>💰 奖励 {c.reward_amount} 米米币</span>
                    <span>📦 已用/总量 {c.used_count}/{c.max_uses}</span>
                    {c.expires_at && <span>⏰ 过期 {new Date(c.expires_at).toLocaleDateString()}</span>}
                  </div>
                  <div className="admin-card-actions" style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <button
                      className="admin-btn"
                      style={{ background: c.status === "active" ? "#854d0e" : "#166534", color: "#fff", fontSize: 13 }}
                      onClick={() => handleToggleStatus(c.code, c.status)}
                    >
                      {c.status === "active" ? "禁用" : "启用"}
                    </button>
                    <button
                      className="admin-btn danger"
                      style={{ background: "#991b1b", color: "#fff", fontSize: 13 }}
                      onClick={() => handleDelete(c.code)}
                    >
                      删除
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {tab === "logs" && (
        <>
          {loading ? (
            <div className="admin-loading">加载中...</div>
          ) : logs.length === 0 ? (
            <div className="admin-empty">暂无兑换记录</div>
          ) : (
            <div className="admin-list">
              {logs.map((log) => (
                <div className="admin-card" key={log.id}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontFamily: "monospace" }}>{log.code}</div>
                      <div className="admin-card-meta">
                        用户: {log.username || log.user_id?.slice(0, 8)}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ color: "#c084fc", fontWeight: 700 }}>+{log.amount} 米米币</div>
                      <div className="admin-card-meta">{new Date(log.redeemed_at).toLocaleString()}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
