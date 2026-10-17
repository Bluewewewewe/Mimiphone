"use client";
import { useState } from "react";

// 管理员发布更新日志（全员弹窗 + 设置内历史）
export function VersionAdminPage({ authToken, onClose }: { authToken: string; onClose: () => void }) {
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
  const [err, setErr] = useState("");

  const submit = async () => {
    setErr("");
    if (!version.trim()) return setErr("请填写版本号");
    if (!title.trim()) return setErr("请填写标题");
    if (!content.trim()) return setErr("请填写更新内容");
    setSending(true);
    try {
      const res = await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
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
        alert("更新日志已发布，用户下次打开会看到弹窗");
        onClose();
      } else {
        setErr(json.error || "发布失败");
      }
    } catch {
      setErr("网络错误，发布失败");
    } finally {
      setSending(false);
    }
  };

  const input: React.CSSProperties = { width: "100%", border: "1px solid #b8dcc4", borderRadius: 10, padding: "10px 12px", fontSize: 14, outline: "none", marginBottom: 12, boxSizing: "border-box", background: "rgba(255,255,255,0.85)", color: "#2e5c33" };
  const label: React.CSSProperties = { fontSize: 12, color: "#4a7c50", marginBottom: 6 };

  return (
    <div style={{ padding: 16 }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: "#92400e", marginBottom: 4 }}>📋 发布更新日志</div>
      <div style={{ fontSize: 12, color: "#8a9a8d", marginBottom: 16 }}>发布后全员下次打开会看到弹窗，历史保存在「设置 → 更新日志」</div>

      <div style={label}>版本号（同一天发多次就把末尾 01 改成 02）</div>
      <input style={input} value={version} onChange={(e) => setVersion(e.target.value)} inputMode="numeric" placeholder="如 2026101701" />

      <div style={label}>标题</div>
      <input style={input} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={50} placeholder="如 📸 米米相册开张啦" />

      <div style={label}>弹窗一句话（留空则自动截取内容开头）</div>
      <input style={input} value={popupText} onChange={(e) => setPopupText(e.target.value)} maxLength={100} placeholder="弹窗里给用户看的简短介绍" />

      <div style={label}>完整更新内容（支持换行，会显示在更新日志历史里）</div>
      <textarea
        style={{ ...input, minHeight: 160, resize: "vertical" }}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder={"这次更新了什么？\n\n📸 新功能\n· ..."}
      />

      <div style={label}>类型</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        {[["feature", "🆕 新功能"], ["fix", "🐛 修复"], ["announce", "📢 公告"]].map(([val, lab]) => (
          <button key={val} onClick={() => setType(val)} style={{ fontSize: 12, padding: "6px 12px", borderRadius: 12, border: "none", background: type === val ? "#2e7d32" : "#eef1f3", color: type === val ? "#fff" : "#536471", fontWeight: type === val ? 600 : 400, cursor: "pointer" }}>{lab}</button>
        ))}
      </div>

      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#4a7c50", marginBottom: err ? 8 : 16 }}>
        <input type="checkbox" checked={showPopup} onChange={(e) => setShowPopup(e.target.checked)} />
        发布后向全体用户弹出更新提示
      </label>

      {err && <div style={{ background: "#fef2f2", color: "#dc2626", fontSize: 12, borderRadius: 8, padding: "8px 10px", marginBottom: 12 }}>{err}</div>}

      <button onClick={submit} disabled={sending} style={{ width: "100%", padding: "13px", borderRadius: 12, border: "none", background: "#2e7d32", color: "#fff", fontWeight: 700, fontSize: 15, opacity: sending ? 0.6 : 1 }}>{sending ? "发布中..." : "发布"}</button>
      <button onClick={onClose} style={{ marginTop: 10, width: "100%", padding: "10px", borderRadius: 10, border: "none", background: "#e5e7eb", color: "#78350f", fontWeight: 500, fontSize: 13 }}>← 返回设置</button>
    </div>
  );
}
