"use client";

import { useEffect, useState } from "react";
import { X, Copy, Plus, Trash2, Crown, User } from "lucide-react";

interface InviteCode {
  code: string;
  role_type: "admin" | "user";
  used_by: string | null;
  used_by_username: string | null;
  created_at: string;
  revoked_at: string | null;
}

interface InviteAppProps {
  onClose?: () => void;
  loginUsername?: string;
  isAdmin?: boolean;
}

export function InviteApp({ onClose, loginUsername = "", isAdmin = false }: InviteAppProps = {}) {
  const [codes, setCodes] = useState<InviteCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [count, setCount] = useState(1);
  const [roleType, setRoleType] = useState<"admin" | "user">("user");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  const token = typeof window !== "undefined" ? localStorage.getItem("auth_token") || "" : "";
  const isSuperAdmin = loginUsername === "admin";

  useEffect(() => {
    loadCodes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadCodes() {
    setLoading(true);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "list_my_invite_codes", authToken: token }),
      });
      const result = await res.json();
      if (result.success) {
        setCodes(result.data || []);
      } else {
        setError(result.error || "获取失败");
      }
    } catch (e) {
      setError("网络错误");
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerate() {
    setGenerating(true);
    setMessage("");
    setError("");
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "generate_invite_codes",
          authToken: token,
          count: Math.min(Math.max(count, 1), 20),
          roleType: isSuperAdmin ? roleType : "user",
        }),
      });
      const result = await res.json();
      if (result.success) {
        setMessage(`成功生成 ${(result.data || []).length} 个邀请码`);
        await loadCodes();
      } else {
        setError(result.error || "生成失败");
      }
    } catch (e) {
      setError("网络错误");
    } finally {
      setGenerating(false);
    }
  }

  async function handleRevoke(code: string) {
    if (!confirm(`确定作废邀请码 ${code} 吗？`)) return;
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "revoke_invite_code", authToken: token, code }),
      });
      const result = await res.json();
      if (result.success) {
        setMessage("已作废");
        await loadCodes();
      } else {
        setError(result.error || "作废失败");
      }
    } catch (e) {
      setError("网络错误");
    }
  }

  function copyCode(code: string) {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(code);
      setTimeout(() => setCopied(null), 1500);
    });
  }

  function getStatus(code: InviteCode) {
    if (code.revoked_at) return { label: "已作废", className: "bg-muted text-muted-foreground" };
    if (code.used_by) return { label: "已使用", className: "bg-primary/15 text-primary" };
    return { label: "未使用", className: "bg-green-500/15 text-green-600" };
  }

  const unusedCount = codes.filter((c) => !c.used_by && !c.revoked_at).length;

  return (
    <div className="h-full flex flex-col bg-background text-foreground">
      <div className="flex items-center justify-between px-4 pt-6 pb-2 border-b border-border bg-card/50 backdrop-blur-sm">
        <div>
          <h2 className="text-lg font-semibold text-foreground">我的邀请码</h2>
          <p className="text-xs text-muted-foreground">未使用: {unusedCount} / 总数: {codes.length}</p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-muted active:scale-90 transition-colors"
            aria-label="关闭"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {isAdmin && (
          <div className="bg-card rounded-xl p-4 border border-border space-y-3">
            <h3 className="text-sm font-medium flex items-center gap-2">
              <Plus className="w-4 h-4 text-primary" />
              生成新邀请码
            </h3>
            <div className="flex gap-3">
              {isSuperAdmin && (
                <select
                  value={roleType}
                  onChange={(e) => setRoleType(e.target.value as "admin" | "user")}
                  className="bg-muted border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="user">普通用户邀请码</option>
                  <option value="admin">管理员邀请码</option>
                </select>
              )}
              <input
                type="number"
                min={1}
                max={20}
                value={count}
                onChange={(e) => setCount(parseInt(e.target.value, 10) || 1)}
                className="w-20 bg-muted border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="flex-1 bg-primary text-primary-foreground rounded-lg px-4 py-2 text-sm font-medium active:scale-95 disabled:opacity-50 transition-transform"
              >
                {generating ? "生成中..." : "生成"}
              </button>
            </div>
            {!isSuperAdmin && (
              <p className="text-xs text-muted-foreground">普通管理员只能生成普通用户邀请码，且总数不超过 10 个</p>
            )}
          </div>
        )}

        {message && (
          <div className="bg-green-500/10 text-green-600 text-sm px-3 py-2 rounded-lg">{message}</div>
        )}
        {error && (
          <div className="bg-destructive/10 text-destructive text-sm px-3 py-2 rounded-lg">{error}</div>
        )}

        {loading ? (
          <div className="text-center text-sm text-muted-foreground py-8">加载中...</div>
        ) : codes.length === 0 ? (
          <div className="text-center text-sm text-muted-foreground py-12 bg-card rounded-xl border border-border">
            暂无邀请码
          </div>
        ) : (
          <div className="space-y-3">
            {codes.map((code) => {
              const status = getStatus(code);
              return (
                <div
                  key={code.code}
                  className="bg-card rounded-xl p-4 border border-border flex items-center justify-between gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-base font-semibold tracking-wide text-foreground">
                        {code.code}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${status.className}`}>
                        {status.label}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground space-y-0.5">
                      <div className="flex items-center gap-1">
                        {code.role_type === "admin" ? (
                          <Crown className="w-3 h-3 text-amber-500" />
                        ) : (
                          <User className="w-3 h-3" />
                        )}
                        {code.role_type === "admin" ? "管理员邀请码" : "普通用户邀请码"}
                      </div>
                      {code.used_by && (
                        <div>使用人: {code.used_by_username || code.used_by}</div>
                      )}
                      <div>生成于: {new Date(code.created_at).toLocaleString()}</div>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <button
                      onClick={() => copyCode(code.code)}
                      className="p-2 rounded-lg bg-muted hover:bg-muted/80 active:scale-90 transition-colors"
                      aria-label="复制"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                    {!code.used_by && !code.revoked_at && (
                      <button
                        onClick={() => handleRevoke(code.code)}
                        className="p-2 rounded-lg bg-destructive/10 text-destructive hover:bg-destructive/20 active:scale-90 transition-colors"
                        aria-label="作废"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  {copied === code.code && (
                    <span className="absolute right-14 text-xs text-green-600 bg-green-500/10 px-2 py-1 rounded">
                      已复制
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
