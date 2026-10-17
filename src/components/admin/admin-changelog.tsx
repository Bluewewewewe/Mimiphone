"use client";
import { useCallback, useEffect, useState } from "react";

interface VersionRow {
  version: string;
  title: string;
  content: string;
  type: string;
  show_in_popup: boolean;
  popup_text: string | null;
  published_at: string;
}

export default function AdminChangelog({ token }: { token: string }) {
  const today = () => {
    const d = new Date();
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}01`;
  };
  const [version, setVersion] = useState(today());
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [popupText, setPopupText] = useState("");
  const [type, setType] = useState("feature");
  const [showPopup, setShowPopup] = useState(true);
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  const loadVersions = useCallback(async () => {
    try {
      const r = await fetch("/api/notifications?action=versions_list&page=1&pageSize=30");
      const j = await r.json();
      if (j.success) setVersions(j.data || []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadVersions(); }, [loadVersions]);

  const submit = async () => {
    setMsg(null);
    if (!version.trim()) return setMsg({ ok: false, text: "请填写版本号" });
    if (!title.trim()) return setMsg({ ok: false, text: "请填写标题" });
    if (!content.trim()) return setMsg({ ok: false, text: "请填写更新内容" });
    setSending(true);
    try {
      const res = await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          action: "admin_create_version",
          version: version.trim(),
          title: title.trim(),
          content: content.trim(),
          type,
          showInPopup: showPopup,
          popupText: popupText.trim() || null,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setMsg({ ok: true, text: "已发布，全体用户下次打开会看到弹窗" });
        setTitle(""); setContent(""); setPopupText("");
        loadVersions();
      } else {
        setMsg({ ok: false, text: json.error || "发布失败" });
      }
    } catch {
      setMsg({ ok: false, text: "网络错误，发布失败" });
    } finally {
      setSending(false);
    }
  };

  const inp: React.CSSProperties = { width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 10, padding: "10px 12px", color: "#e5e7eb", fontSize: 14, outline: "none", marginBottom: 12 };
  const lab: React.CSSProperties = { fontSize: 12, color: "#9ca3af", marginBottom: 6 };

  return (
    <div className="admin-section">
      <h2>📋 发布更新日志</h2>
      <p style={{ fontSize: 12, color: "#9ca3af", marginTop: -8 }}>发布后全员下次打开会看到弹窗，历史对所有用户显示在「我的 → 设置 → 更新日志」</p>

      <div style={lab}>版本号（同一天发多次就把末尾 01 改成 02）</div>
      <input style={inp} value={version} onChange={(e) => setVersion(e.target.value)} inputMode="numeric" placeholder="如 2026101701" />

      <div style={lab}>标题</div>
      <input style={inp} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={50} placeholder="如 📸 米米相册开张啦" />

      <div style={lab}>弹窗一句话（留空则自动截取内容开头）</div>
      <input style={inp} value={popupText} onChange={(e) => setPopupText(e.target.value)} maxLength={100} placeholder="弹窗里给用户看的简短介绍" />

      <div style={lab}>完整更新内容（支持换行）</div>
      <textarea style={{ ...inp, minHeight: 150, resize: "vertical", fontFamily: "inherit" }} value={content} onChange={(e) => setContent(e.target.value)} placeholder={"这次更新了什么？\n\n📸 新功能\n· ..."} />

      <div style={lab}>类型</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        {[["feature", "🆕 新功能"], ["fix", "🐛 修复"], ["announce", "📢 公告"]].map(([val, labTxt]) => (
          <button key={val} type="button" className="admin-btn" onClick={() => setType(val)}
            style={{ background: type === val ? "#2563eb" : "rgba(255,255,255,0.08)", borderColor: type === val ? "#2563eb" : "rgba(255,255,255,0.15)", color: "#e5e7eb" }}>
            {labTxt}
          </button>
        ))}
      </div>

      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#d1d5db", marginBottom: 12 }}>
        <input type="checkbox" checked={showPopup} onChange={(e) => setShowPopup(e.target.checked)} />
        发布后向全体用户弹出更新提示
      </label>

      {msg && (
        <div style={{ background: msg.ok ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)", color: msg.ok ? "#4ade80" : "#f87171", border: `1px solid ${msg.ok ? "rgba(34,197,94,.3)" : "rgba(239,68,68,.3)"}`, fontSize: 13, borderRadius: 8, padding: "8px 10px", marginBottom: 12 }}>{msg.text}</div>
      )}

      <button type="button" className="admin-btn admin-btn-primary" onClick={submit} disabled={sending} style={{ opacity: sending ? 0.6 : 1 }}>
        {sending ? "发布中..." : "发布更新日志"}
      </button>

      <h2 style={{ marginTop: 28 }}>历史版本</h2>
      {versions.length === 0 && <div className="admin-empty">还没有发布过更新日志</div>}
      <div className="admin-list">
        {versions.map((v) => (
          <div key={v.version} className="admin-card" onClick={() => setExpanded(expanded === v.version ? null : v.version)} style={{ cursor: "pointer" }}>
            <div className="admin-card-body">
              <div className="admin-card-title">
                <span style={{ fontSize: 11, background: "rgba(255,255,255,0.1)", padding: "2px 8px", borderRadius: 8, marginRight: 6 }}>v{v.version}</span>
                {v.title}
              </div>
              <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>
                {new Date(v.published_at).toLocaleString("zh-CN")}
                {v.show_in_popup ? " · 弹窗" : " · 仅历史"}
              </div>
              {expanded === v.version && (
                <div style={{ fontSize: 13, color: "#d1d5db", whiteSpace: "pre-wrap", lineHeight: 1.7, marginTop: 8 }}>{v.content}</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
