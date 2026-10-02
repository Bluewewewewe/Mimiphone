"use client";

import { useRef, useState } from "react";

// 小手机内置浏览器：输入网址回车加载；非网址则走搜索
export function BrowserApp({ onClose }: { onClose: () => void }) {
  const [input, setInput] = useState("");
  const [current, setCurrent] = useState("");
  const [loading, setLoading] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  function resolveTarget(raw: string): { url: string; isSearch: boolean } {
    const q = raw.trim();
    if (!q) return { url: "", isSearch: false };
    // 已经是完整网址
    if (/^https?:\/\//i.test(q)) return { url: q, isSearch: false };
    // 看起来像域名：xxx.xxx（不含空格）
    if (!/\s/.test(q) && /^[\w-]+(\.[\w-]+)+(:\d+)?(\/.*)?$/.test(q)) {
      return { url: "https://" + q, isSearch: false };
    }
    // 其他一律当搜索词
    return { url: "https://html.duckduckgo.com/html/?q=" + encodeURIComponent(q), isSearch: true };
  }

  function go() {
    const { url } = resolveTarget(input);
    if (!url) return;
    setLoading(true);
    setCurrent(url);
  }

  function reload() {
    if (!current) return;
    setLoading(true);
    // 强制重新加载
    if (iframeRef.current) iframeRef.current.src = current;
  }

  function openExternal() {
    if (current) window.open(current, "_blank", "noopener,noreferrer");
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#f2f3f7" }}>
      {/* 顶部工具栏 */}
      <div style={{
        flexShrink: 0, padding: "18px 10px 8px",
        background: "rgba(255,255,255,0.9)", backdropFilter: "blur(20px)",
        borderBottom: "1px solid rgba(0,0,0,0.06)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button onClick={onClose} style={{
            background: "none", border: "none", fontSize: 18,
            color: "#555", cursor: "pointer", padding: "4px 6px",
          }}>‹</button>
          <div style={{
            flex: 1, display: "flex", alignItems: "center", gap: 6,
            background: "#eef0f4", borderRadius: 16, padding: "7px 12px",
          }}>
            <span style={{ fontSize: 12 }}>🔒</span>
            <input
              id="mimi-browser-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") go(); }}
              placeholder="输入网址或搜索关键词"
              style={{
                flex: 1, border: "none", background: "none", outline: "none",
                fontSize: 13, color: "#111",
              }}
            />
            {loading && <span className="browser-spin" style={{
              width: 12, height: 12, borderRadius: "50%",
              border: "2px solid #ccc", borderTopColor: "#555",
              display: "inline-block", animation: "mimi-spin 0.8s linear infinite",
            }} />}
          </div>
          <button onClick={go} style={{
            background: "#111", color: "#fff", border: "none",
            borderRadius: 14, padding: "7px 12px", fontSize: 12,
            fontWeight: 700, cursor: "pointer",
          }}>前往</button>
        </div>
        {current && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 4px 0" }}>
            <button onClick={reload} style={{
              background: "none", border: "none", fontSize: 12,
              color: "#555", cursor: "pointer",
            }}>🔄 刷新</button>
            <button onClick={openExternal} style={{
              background: "none", border: "none", fontSize: 12,
              color: "#0a66c2", cursor: "pointer",
            }}>↗ 新窗口打开</button>
            <span style={{
              fontSize: 10, color: "#999", marginLeft: "auto",
              maxWidth: "55%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>{current}</span>
          </div>
        )}
      </div>

      {/* 页面区域 */}
      {current ? (
        <div style={{ flex: 1, position: "relative", background: "#fff" }}>
          <iframe
            ref={iframeRef}
            src={current}
            title="浏览器"
            onLoad={() => setLoading(false)}
            style={{ width: "100%", height: "100%", border: "none" }}
            sandbox="allow-forms allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
          />
        </div>
      ) : (
        <div style={{
          flex: 1, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", color: "#999",
        }}>
          <div style={{ fontSize: 44, marginBottom: 10 }}>🌐</div>
          <div style={{ fontSize: 13 }}>输入网址开始浏览</div>
          <div style={{ fontSize: 11, marginTop: 6, color: "#bbb" }}>
            部分网站禁止被嵌入，显示空白时可点「新窗口打开」
          </div>
        </div>
      )}
    </div>
  );
}
