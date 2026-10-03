// 统一内容审核队列：论坛发言 + 米米请就位 待审楼
// 两个来源分开展示；支持 全部/我的/未分配 视图、认领、指派、通过、拒绝
import { useEffect, useState } from "react";

type QueueItem = {
  id: string;
  kind: "forum" | "pickup";
  title: string;
  content?: string;
  author_name: string;
  section?: string;
  tags?: { id: string; name: string }[];
  created_at: string;
  assigned_to?: string | null;
  assigned_to_name?: string | null;
  raw?: any;
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = Date.now();
  const diff = now - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "刚刚";
  if (mins < 60) return mins + "分钟前";
  const hours = Math.floor(mins / 60);
  if (hours < 24) return hours + "小时前";
  return d.getMonth() + 1 + "月" + d.getDate() + "日";
}

export function ContentQueue({ token,  }: { token: string; loginUsername: string }) {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState<"all" | "mine" | "unassigned">("all");
  const [admins, setAdmins] = useState<{ id: string; username: string; nickname: string }[]>([]);
  const [assignFor, setAssignFor] = useState<QueueItem | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [fRes, pRes] = await Promise.all([
        fetch("/api/forum", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "admin_pending_list", scope, token }),
        }).then((r) => r.json()),
        fetch("/api/pickup?action=admin_pending_posts&scope=" + scope, {
          headers: { Authorization: "Bearer " + token },
        }).then((r) => r.json()),
      ]);

      const fItems: QueueItem[] = (fRes.data || []).map((p: any) => ({
        id: p.id,
        kind: "forum",
        title: p.title,
        content: p.content,
        author_name: p.author_name,
        section: p.section,
        created_at: p.created_at,
        assigned_to: p.assigned_to,
        assigned_to_name: p.assigned_to_name,
        raw: p,
      }));
      const pItems: QueueItem[] = (pRes.posts || []).map((p: any) => ({
        id: p.id,
        kind: "pickup",
        title: p.title,
        content: p.content,
        author_name: p.owner_display || p.owner_username || "—",
        tags: p.pickup_tags,
        created_at: p.created_at,
        assigned_to: p.assigned_to,
        assigned_to_name: p.assigned_to_name,
        raw: p,
      }));
      const merged = [...fItems, ...pItems];
      merged.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      setItems(merged);
    } catch {
      alert("加载审核队列失败");
    } finally {
      setLoading(false);
    }
  }

  async function loadAdmins() {
    try {
      const res = await fetch("/api/admin/permissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "list_admins", token }),
      }).then((r) => r.json());
      if (res.success) setAdmins(res.data.list || []);
    } catch { /* 静默 */ }
  }

  useEffect(() => { load(); }, [scope]);
  useEffect(() => { loadAdmins(); }, []);

  async function claim(it: QueueItem) {
    const res = await fetch(it.kind === "forum" ? "/api/forum" : "/api/pickup?action=admin_assign_post", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(it.kind === "forum"
        ? { action: "admin_assign_post", postId: it.id, token }
        : { action: "admin_assign_post", postId: it.id, token }),
    }).then((r) => r.json());
    if (res.success) load();
    else alert(res.error || "认领失败");
  }

  async function assign(it: QueueItem, adminId: string) {
    const res = await fetch(it.kind === "forum" ? "/api/forum" : "/api/pickup?action=admin_assign_post", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "admin_assign_post", postId: it.id, adminId, token }),
    }).then((r) => r.json());
    if (res.success) { setAssignFor(null); load(); }
    else alert(res.error || "指派失败");
  }

  async function review(it: QueueItem, decision: "approve" | "reject") {
    let reason = "";
    if (decision === "reject") {
      reason = window.prompt("拒绝理由（可选，会通知作者）") || "";
    }
    let res;
    if (it.kind === "forum") {
      res = await fetch("/api/forum", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "admin_review_post", postId: it.id, decision, reason, token }),
      }).then((r) => r.json());
    } else {
      res = await fetch("/api/pickup?action=admin_review_post", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({ action: "admin_review_post", postId: it.id, decision, reason, token }),
      }).then((r) => r.json());
    }
    if (res.success) load();
    else alert(res.error || "操作失败");
  }

  const kindMeta = {
    forum: { label: "论坛", bg: "#eff6ff", color: "#1d4ed8", border: "#bfdbfe", emoji: "💬" },
    pickup: { label: "请就位", bg: "#fdf2f8", color: "#be185d", border: "#fbcfe8", emoji: "🎭" },
  };

  return (
    <div>
      {/* 视图切换 */}
      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        {([["all", "全部"], ["mine", "我负责的"], ["unassigned", "未分配"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setScope(k)} style={{
            flex: 1, padding: "8px 0", borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: "pointer",
            border: scope === k ? "none" : "1px solid #ddd",
            background: scope === k ? "#111" : "#fff",
            color: scope === k ? "#fff" : "#666",
          }}>{l}</button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: "#888", fontSize: 13 }}>加载中...</div>
      ) : items.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40, color: "#888", fontSize: 13 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🎉</div>
          这里没有待审核内容
        </div>
      ) : (
        items.map((it) => {
          const m = kindMeta[it.kind];
          return (
            <div key={it.kind + it.id} style={{
              background: "#fff", borderRadius: 14, padding: 12, marginBottom: 10,
              border: "1px solid #eee", boxShadow: "0 1px 4px rgba(0,0,0,0.03)",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 8,
                  background: m.bg, color: m.color, border: "1px solid " + m.border,
                }}>{m.emoji} {m.label}</span>
                {it.section && <span style={{ fontSize: 10, color: "#999" }}>#{it.section}</span>}
                <span style={{ fontSize: 10, color: "#bbb", marginLeft: "auto" }}>{formatTime(it.created_at)}</span>
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#111", marginBottom: 4 }}>{it.title}</div>
              <div style={{ fontSize: 11, color: "#888", marginBottom: 6 }}>作者：{it.author_name}</div>
              {it.content && (
                <div style={{
                  fontSize: 12, color: "#555", marginBottom: 8, lineHeight: 1.5,
                  display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden",
                }}>{it.content}</div>
              )}
              {it.tags && it.tags.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
                  {it.tags.map((t) => (
                    <span key={t.id} style={{
                      fontSize: 10, background: "#fdf2f8", color: "#be185d",
                      borderRadius: 8, padding: "2px 8px", border: "1px solid #fbcfe8",
                    }}>{t.name}</span>
                  ))}
                </div>
              )}
              <div style={{ fontSize: 10, color: it.assigned_to ? "#666" : "#c2410c", marginBottom: 8 }}>
                {it.assigned_to ? "👤 已指派给：" + (it.assigned_to_name || "管理员") : "⚡ 还没有人认领"}
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => review(it, "approve")} style={{
                  flex: 1, padding: "7px 0", borderRadius: 10, border: "none",
                  background: "#16a34a", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer",
                }}>✓ 通过</button>
                <button onClick={() => review(it, "reject")} style={{
                  flex: 1, padding: "7px 0", borderRadius: 10, border: "none",
                  background: "rgba(239,68,68,0.1)", color: "#dc2626",
                  fontSize: 12, fontWeight: 700, cursor: "pointer",
                }}>✕ 拒绝</button>
                <button onClick={() => claim(it)} style={{
                  padding: "7px 12px", borderRadius: 10, border: "1px solid #ddd",
                  background: "#fff", color: "#333", fontSize: 12, fontWeight: 700, cursor: "pointer",
                }}>🙋 认领</button>
                <button onClick={() => setAssignFor(it)} style={{
                  padding: "7px 12px", borderRadius: 10, border: "1px solid #ddd",
                  background: "#fff", color: "#333", fontSize: 12, fontWeight: 700, cursor: "pointer",
                }}>👥 指派</button>
              </div>
            </div>
          );
        })
      )}

      {/* 指派弹层 */}
      {assignFor && (
        <div onClick={() => setAssignFor(null)} style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
          display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 200,
        }}>
          <div onClick={(e) => e.stopPropagation()} style={{
            background: "#fff", borderRadius: "20px 20px 0 0", padding: 20, width: "100%", maxWidth: 420,
            maxHeight: "70vh", overflowY: "auto",
          }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>指派给哪位管理员？</div>
            <div style={{ fontSize: 11, color: "#999", marginBottom: 14 }}>
              只有拥有「{assignFor.kind === "forum" ? "论坛管理" : "请就位审核"}」权限的管理员才能处理
            </div>
            {admins.map((a) => (
              <button key={a.id} onClick={() => assign(assignFor, a.id)} style={{
                width: "100%", textAlign: "left", padding: "12px 14px", borderRadius: 12,
                border: "1px solid #eee", background: "#fafafa", marginBottom: 8, cursor: "pointer",
                fontSize: 13, color: "#111",
              }}>
                {a.nickname || a.username}
                <span style={{ color: "#999", fontSize: 11, marginLeft: 8 }}>@{a.username}</span>
              </button>
            ))}
            <button onClick={() => setAssignFor(null)} style={{
              width: "100%", padding: "12px 0", borderRadius: 12, border: "none",
              background: "#f3f4f6", color: "#666", fontSize: 13, fontWeight: 700, cursor: "pointer", marginTop: 4,
            }}>取消</button>
          </div>
        </div>
      )}
    </div>
  );
}
