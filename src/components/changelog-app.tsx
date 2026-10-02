"use client";
import { useState, useEffect } from "react";

interface Version {
  version: string;
  title: string;
  content: string;
  type: string;
  publishedAt: string;
}

const typeColor: Record<string, string> = { feature: "#16a34a", fix: "#ea580c", announce: "#2563eb" };
const typeLabel: Record<string, string> = { feature: "新功能", fix: "修复", announce: "公告" };

export function ChangelogContent() {
  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/notifications?action=versions_list&page=1&pageSize=50")
      .then((r) => r.json())
      .then((json: { success?: boolean; data?: Version[]; code?: string }) => {
        if (json.code === "TABLE_NOT_FOUND") { setError("暂无更新记录"); return; }
        if (json.success && json.data) setVersions(json.data);
        else setError("暂无更新记录");
      })
      .catch(() => setError("加载失败"))
      .finally(() => setLoading(false));
  }, []);

  const seen = typeof window !== "undefined" ? localStorage.getItem("seen_version") : null;

  if (loading) return <div style={{ textAlign: "center", color: "#999", padding: 24 }}>加载中...</div>;
  if (error) return <div style={{ textAlign: "center", color: "#999", padding: 24 }}>{error}</div>;
  if (!versions.length) return <div style={{ textAlign: "center", color: "#999", padding: 24 }}>暂无更新记录</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {versions.map((v) => (
        <div
          key={v.version}
          onClick={() => setExpanded(expanded === v.version ? null : v.version)}
          style={{
            background: v.version === seen ? "#fffbeb" : "#f9fafb",
            border: v.version === seen ? "1px solid #fbbf24" : "1px solid #e5e7eb",
            borderRadius: 12,
            padding: 14,
            cursor: "pointer",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span style={{ background: "#e5e7eb", color: "#555", fontSize: 11, padding: "2px 8px", borderRadius: 8, fontWeight: 600 }}>v{v.version}</span>
            <span style={{ fontSize: 11, padding: "2px 6px", borderRadius: 6, background: typeColor[v.type] + "20", color: typeColor[v.type], fontWeight: 600 }}>{typeLabel[v.type] || v.type}</span>
            {v.version === seen && <span style={{ fontSize: 10, color: "#d97706" }}>● 当前版本</span>}
          </div>
          <div style={{ fontSize: 15, fontWeight: 600, color: "#333" }}>{v.title}</div>
          <div style={{ fontSize: 11, color: "#999", marginTop: 2 }}>{new Date(v.publishedAt).toLocaleDateString("zh-CN")}</div>
          {expanded === v.version && (
            <div style={{ fontSize: 13, color: "#555", lineHeight: 1.7, marginTop: 8, whiteSpace: "pre-wrap" }}>{v.content}</div>
          )}
        </div>
      ))}
    </div>
  );
}
