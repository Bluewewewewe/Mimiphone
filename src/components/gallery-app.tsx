import { useState, useEffect, useCallback } from "react";
import JSZip from "jszip";

// ============================================================
// 米米相册（gallery）官方图库 App
// 只读：图片只有官方能上传，用户浏览 + 单张保存 / 多选 / 全量打包
// ============================================================


interface Album {
  id: string;
  title: string;
  description: string | null;
  cover_url: string | null;
  photo_count?: number;
  created_at: string;
}
interface Photo {
  id: string;
  title: string | null;
  image_url: string;
  thumb_url: string | null;
  width: number | null;
  height: number | null;
  file_size: number | null;
}

function formatSize(n: number | null) {
  if (!n) return "";
  if (n < 1024 * 1024) return `${Math.round(n / 1024)}KB`;
  return `${(n / 1024 / 1024).toFixed(1)}MB`;
}

// 触发浏览器下载（fetch 成 blob，绕开跨域直接导航）
async function downloadOne(url: string, filename: string, onDone?: () => void) {
  const res = await fetch(url, { mode: "cors" });
  if (!res.ok) throw new Error("下载失败");
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 10000);
  onDone?.();
}

export function GalleryApp({ onClose }: { onClose: () => void; loginUsername: string }) {
  const [view, setView] = useState<{ kind: "albums" } | { kind: "photos"; album: Album }>({ kind: "albums" });
  const [albums, setAlbums] = useState<Album[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [zipping, setZipping] = useState(false);
  const [zipProgress, setZipProgress] = useState("");
  const [toast, setToast] = useState("");

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2600);
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/gallery?action=albums");
        const data = await res.json();
        if (data.success) setAlbums(data.albums || []);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const openAlbum = async (album: Album) => {
    setView({ kind: "photos", album });
    setSelectMode(false);
    setSelected(new Set());
    setLoading(true);
    try {
      const res = await fetch(`/api/gallery?action=photos&albumId=${album.id}`);
      const data = await res.json();
      if (data.success) {
        setPhotos(data.photos || []);
      }
    } finally {
      setLoading(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const safeFilename = (p: Photo) => {
    const ext = p.image_url.includes(".gif") ? "gif" : "webp";
    return `${(p.title || "mimi").replace(/[\\/:*?"<>|]/g, "_").slice(0, 40)}.${ext}`;
  };

  const handleSaveOne = async (p: Photo) => {
    try {
      showToast("开始保存…");
      await downloadOne(p.image_url, safeFilename(p));
      showToast("已保存，若未弹窗请长按图片保存");
    } catch {
      window.open(p.image_url, "_blank");
      showToast("已在新页打开，长按图片可存相册");
    }
  };

  const handleZip = async () => {
    const list = selected.size > 0
      ? photos.filter((p) => selected.has(p.id))
      : photos;
    if (list.length === 0) return;
    if (list.length > 150) {
      showToast("一次最多打包 150 张，分批来哦");
      return;
    }
    setZipping(true);
    try {
      const zip = new JSZip();
      let done = 0;
      for (const p of list) {
        setZipProgress(`打包中 ${done + 1}/${list.length}`);
        try {
          const res = await fetch(p.image_url, { mode: "cors" });
          const buf = await res.arrayBuffer();
          zip.file(safeFilename(p), buf);
        } catch {
          // 单张失败跳过
        }
        done += 1;
        // 让出主线程，避免界面卡死
        if (done % 5 === 0) await new Promise((r) => setTimeout(r, 0));
      }
      setZipProgress("压缩中…");
      const blob = await zip.generateAsync({ type: "blob" }, (meta) => {
        setZipProgress(`压缩中 ${Math.round(meta.percent)}%`);
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const albumName = view.kind === "photos" ? view.album.title : "米米相册";
      a.download = `${albumName.replace(/[\\/:*?"<>|]/g, "_")}_${list.length}张.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      showToast("打包完成，去下载/文件里查看");
    } catch {
      showToast("打包失败，网络不稳，试试少选几张");
    } finally {
      setZipping(false);
      setZipProgress("");
    }
  };

  // ---------------- 相册列表页 ----------------
  if (view.kind === "albums") {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#f7f9f9" }}>
        <Header title="米米相册" onClose={onClose} />
        <div style={{ flex: 1, overflowY: "auto", padding: "12px" }}>
          <div style={{ fontSize: 12, color: "#536471", margin: "2px 4px 12px" }}>🌽 官方图库 · 图都能免费保存到手机</div>
          {loading ? (
            <Loading />
          ) : albums.length === 0 ? (
            <Empty text="相册还在布置中，过几天再来看看~" />
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {albums.map((a) => (
                <div
                  key={a.id}
                  onClick={() => openAlbum(a)}
                  style={{ background: "#fff", borderRadius: 14, overflow: "hidden", cursor: "pointer", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}
                >
                  <div style={{
                    aspectRatio: "1 / 1",
                    background: a.cover_url ? `#eef1f3 center/cover no-repeat url(${a.cover_url})` : "linear-gradient(135deg,#ffe4ec,#e7f5ff)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 34,
                  }}>
                    {!a.cover_url && "🖼️"}
                  </div>
                  <div style={{ padding: "8px 10px 10px" }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#0f1419", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.title}</div>
                    <div style={{ fontSize: 11, color: "#8899a6", marginTop: 2 }}>{a.photo_count ?? 0} 张</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <Toast text={toast} />
      </div>
    );
  }

  // ---------------- 图片网格页 ----------------
  const album = view.album;
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#0f1419" }}>
      <div style={{ padding: "12px 14px", background: "#16202a", borderBottom: "1px solid #2f3b47", display: "flex", alignItems: "center", gap: 10 }}>
        <button onClick={() => { setView({ kind: "albums" }); setViewerIndex(null); }} style={{ fontSize: 22, background: "none", border: "none", color: "#fff", cursor: "pointer", lineHeight: 1 }}>‹</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{album.title}</div>
          <div style={{ fontSize: 11, color: "#8899a6" }}>{photos.length} 张{selected.size > 0 ? ` · 已选 ${selected.size}` : ""}</div>
        </div>
        {photos.length > 0 && (
          <button
            onClick={() => { setSelectMode((v) => !v); setSelected(new Set()); }}
            style={{ fontSize: 12, padding: "5px 12px", borderRadius: 14, border: "none", background: selectMode ? "#f91880" : "#2f3b47", color: "#fff", cursor: "pointer", fontWeight: 600 }}
          >{selectMode ? "完成" : "选择"}</button>
        )}
      </div>

      <div style={{ flex: 1, overflowY: "auto" }}>
        {loading ? (
          <Loading dark />
        ) : photos.length === 0 ? (
          <Empty dark text="这本相册还没有图" />
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 2 }}>
            {photos.map((p, idx) => {
              const checked = selected.has(p.id);
              return (
                <div
                  key={p.id}
                  onClick={() => {
                    if (selectMode) toggleSelect(p.id);
                    else setViewerIndex(idx);
                  }}
                  style={{
                    position: "relative",
                    aspectRatio: "1 / 1",
                    background: `#1c2733 center/cover no-repeat url(${p.thumb_url || p.image_url})`,
                    cursor: "pointer",
                    outline: checked ? "3px solid #f91880" : "none",
                    outlineOffset: -3,
                  }}
                >
                  {selectMode && (
                    <div style={{
                      position: "absolute", top: 6, right: 6,
                      width: 22, height: 22, borderRadius: "50%",
                      background: checked ? "#f91880" : "rgba(0,0,0,0.45)",
                      border: "1.5px solid #fff",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      color: "#fff", fontSize: 13, fontWeight: 700,
                    }}>{checked ? "✓" : ""}</div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {selectMode && photos.length > 0 && (
        <div style={{ padding: "10px 14px", background: "#16202a", borderTop: "1px solid #2f3b47", display: "flex", gap: 8, paddingBottom: 14 }}>
          <button
            onClick={() => setSelected(selected.size === photos.length ? new Set() : new Set(photos.map((p) => p.id)))}
            style={{ flex: 1, height: 40, borderRadius: 20, border: "1px solid #3d4a57", background: "transparent", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
          >{selected.size === photos.length ? "取消全选" : "全选"}</button>
          <button
            onClick={handleZip}
            disabled={zipping}
            style={{ flex: 2, height: 40, borderRadius: 20, border: "none", background: "#f91880", color: "#fff", fontSize: 14, fontWeight: 700, cursor: zipping ? "default" : "pointer", opacity: zipping ? 0.6 : 1 }}
          >{zipping ? (zipProgress || "打包中…") : selected.size > 0 ? `保存选中的 ${selected.size} 张` : `一键打包全部 ${photos.length} 张`}</button>
        </div>
      )}

      {/* 大图查看器 */}
      {viewerIndex !== null && photos[viewerIndex] && (
        <div
          onClick={() => setViewerIndex(null)}
          style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.96)", zIndex: 50, display: "flex", flexDirection: "column" }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px" }}>
            <button onClick={() => setViewerIndex(null)} style={{ fontSize: 24, background: "none", border: "none", color: "#fff", cursor: "pointer" }}>×</button>
            <span style={{ flex: 1, color: "#8899a6", fontSize: 12 }}>{viewerIndex + 1} / {photos.length} · {formatSize(photos[viewerIndex].file_size)}</span>
            <button
              onClick={(e) => { e.stopPropagation(); handleSaveOne(photos[viewerIndex]); }}
              style={{ fontSize: 13, padding: "7px 16px", borderRadius: 16, border: "none", background: "#f91880", color: "#fff", fontWeight: 700, cursor: "pointer" }}
            >保存</button>
          </div>
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", position: "relative", padding: 8 }}
          >
            <img
              src={photos[viewerIndex].image_url}
              alt=""
              style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", borderRadius: 4 }}
            />
            {viewerIndex > 0 && (
              <button onClick={(e) => { e.stopPropagation(); setViewerIndex(viewerIndex - 1); }} style={{ position: "absolute", left: 4, top: "50%", transform: "translateY(-50%)", width: 36, height: 36, borderRadius: "50%", background: "rgba(255,255,255,0.12)", border: "none", color: "#fff", fontSize: 18, cursor: "pointer" }}>‹</button>
            )}
            {viewerIndex < photos.length - 1 && (
              <button onClick={(e) => { e.stopPropagation(); setViewerIndex(viewerIndex + 1); }} style={{ position: "absolute", right: 4, top: "50%", transform: "translateY(-50%)", width: 36, height: 36, borderRadius: "50%", background: "rgba(255,255,255,0.12)", border: "none", color: "#fff", fontSize: 18, cursor: "pointer" }}>›</button>
            )}
          </div>
          {photos[viewerIndex].title && (
            <div style={{ color: "#bbb", fontSize: 12, textAlign: "center", padding: "0 20px 14px" }}>{photos[viewerIndex].title}</div>
          )}
        </div>
      )}

      <Toast text={toast} dark />
    </div>
  );
}

function Header({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div style={{ padding: "12px 14px", background: "#fff", borderBottom: "1px solid #eff3f4", display: "flex", alignItems: "center", gap: 10 }}>
      <button onClick={onClose} style={{ fontSize: 22, background: "none", border: "none", color: "#0f1419", cursor: "pointer", lineHeight: 1 }}>‹</button>
      <div style={{ fontSize: 16, fontWeight: 800, color: "#0f1419" }}>{title}</div>
    </div>
  );
}
function Loading({ dark }: { dark?: boolean }) {
  return <div style={{ textAlign: "center", padding: 60, color: dark ? "#8899a6" : "#536471", fontSize: 13 }}>加载中…</div>;
}
function Empty({ text, dark }: { text: string; dark?: boolean }) {
  return <div style={{ textAlign: "center", padding: 60, color: dark ? "#8899a6" : "#536471", fontSize: 13 }}>{text}</div>;
}
function Toast({ text, dark }: { text: string; dark?: boolean }) {
  if (!text) return null;
  return (
    <div style={{
      position: "absolute", bottom: 30, left: "50%", transform: "translateX(-50%)",
      background: dark ? "rgba(255,255,255,0.92)" : "rgba(15,20,25,0.9)",
      color: dark ? "#0f1419" : "#fff",
      fontSize: 12, padding: "8px 16px", borderRadius: 18, zIndex: 80, whiteSpace: "nowrap",
      maxWidth: "86%", overflow: "hidden", textOverflow: "ellipsis",
    }}>{text}</div>
  );
}
