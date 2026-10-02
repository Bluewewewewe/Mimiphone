"use client";
import { useState, useEffect } from "react";

interface VersionData {
  version: string;
  title: string;
  content: string;
  type: "feature" | "fix" | "announce";
  popupText?: string;
  publishedAt: string;
}

const TYPE_ICON: Record<string, string> = {
  feature: "🆕",
  fix: "🐛",
  announce: "📢",
};

export function VersionPopup({ onOpenChangelog }: { onOpenChangelog: () => void }) {
  const [data, setData] = useState<VersionData | null>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    fetch("/api/notifications?action=latest_version")
      .then((r) => r.json())
      .then((json: { success?: boolean; data?: VersionData | null; code?: string }) => {
        if (!json.success || !json.data || json.code === "TABLE_NOT_FOUND") return;
        const v = json.data;
        const seen = localStorage.getItem("seen_version");
        if (v.version !== seen) {
          setData(v);
          setShow(true);
        }
      })
      .catch(() => {});
  }, []);

  const handleOk = () => {
    if (data) localStorage.setItem("seen_version", data.version);
    setShow(false);
  };

  if (!show || !data) return null;

  const displayText = data.popupText || (data.content.length > 100 ? data.content.slice(0, 100) + "..." : data.content);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) handleOk(); }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 20,
          padding: 24,
          width: "85%",
          maxWidth: 340,
          boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
        }}
      >
        <div style={{ fontSize: 32, textAlign: "center", marginBottom: 8 }}>
          {TYPE_ICON[data.type] || "🆕"}
        </div>
        <div style={{ fontSize: 18, fontWeight: 700, textAlign: "center", color: "#78350f", marginBottom: 4 }}>
          {data.title}
        </div>
        <div style={{ fontSize: 12, textAlign: "center", color: "#92400e", marginBottom: 12 }}>
          v{data.version}
        </div>
        <div
          style={{
            fontSize: 14,
            lineHeight: 1.6,
            color: "#444",
            textAlign: "center",
            marginBottom: 16,
          }}
        >
          {displayText}
        </div>
        <div style={{ fontSize: 11, color: "#999", textAlign: "center", marginBottom: 16 }}>
          更多更新可在「设置」→ 更新日志中查看
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <button
            onClick={handleOk}
            style={{
              flex: 1,
              padding: "10px 0",
              borderRadius: 12,
              border: "none",
              background: "linear-gradient(135deg, #f59e0b, #d97706)",
              color: "#fff",
              fontWeight: 600,
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            知道了
          </button>
          <button
            onClick={() => {
              handleOk();
              onOpenChangelog();
            }}
            style={{
              flex: 1,
              padding: "10px 0",
              borderRadius: 12,
              border: "2px solid #f59e0b",
              background: "transparent",
              color: "#d97706",
              fontWeight: 600,
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            查看详情
          </button>
        </div>
      </div>
    </div>
  );
}
