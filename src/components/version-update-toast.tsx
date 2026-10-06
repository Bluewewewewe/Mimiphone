"use client";

import { useEffect, useRef, useState } from "react";

export function VersionUpdateToast() {
  const [show, setShow] = useState(false);
  const currentVersionRef = useRef<string | null>(null);
  const dismissedRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function checkVersion() {
      try {
        const res = await fetch(`/api/version?t=${Date.now()}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        const latest: string = data.version;
        if (!currentVersionRef.current) {
          currentVersionRef.current = latest;
          return;
        }
        if (
          latest !== currentVersionRef.current &&
          latest !== dismissedRef.current
        ) {
          if (!cancelled) setShow(true);
        }
      } catch {
        // 网络错误静默
      }
    }

    // 首次检查
    checkVersion();
    // 每 60 秒轮询一次
    const timer = setInterval(checkVersion, 60_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  if (!show) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: "max(12px, env(safe-area-inset-top))",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 9999,
        background: "rgba(15, 20, 25, 0.92)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        color: "#fff",
        borderRadius: 20,
        padding: "9px 6px 9px 16px",
        fontSize: 13,
        fontWeight: 600,
        display: "flex",
        alignItems: "center",
        gap: 10,
        boxShadow: "0 8px 24px rgba(0,0,0,0.2)",
        maxWidth: "calc(100vw - 32px)",
      }}
    >
      <span>✨ 发现新版本</span>
      <button
        onClick={() => {
          window.location.reload();
        }}
        style={{
          background: "#f91880",
          color: "#fff",
          border: "none",
          borderRadius: 14,
          padding: "6px 14px",
          fontSize: 12,
          fontWeight: 700,
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        刷新
      </button>
      <button
        onClick={() => {
          setShow(false);
        }}
        style={{
          background: "none",
          color: "rgba(255,255,255,0.6)",
          border: "none",
          fontSize: 18,
          cursor: "pointer",
          padding: "0 4px",
          lineHeight: 1,
        }}
        aria-label="稍后"
      >
        ×
      </button>
    </div>
  );
}
