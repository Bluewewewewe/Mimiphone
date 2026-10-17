import { useState, useEffect, useRef } from "react";

// ============================================================
// 米米相册管理（gallery_manage 权限）
// ============================================================

interface Album {
  id: string;
  title: string;
  description: string | null;
  cover_url: string | null;
  status: string;
  sort_order: number;
}
interface Photo {
  id: string;
  album_id: string;
  title: string | null;
  thumb_url: string | null;
  image_url: string;
  status: string;
  sort_order: number;
}

export function GalleryAdmin({ onClose }: { onClose: () => void; loginUsername: string }) {
  const token = typeof window !== "undefined" ? localStorage.getItem("auth_token") || "" : "";
  const auth = { Authorization: "Bearer " + token, "Content-Type": "application/json" };

  const [albums, setAlbums] = useState<Album[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [currentAlbumId, setCurrentAlbumId] = useState<string | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  function diagErr(e: unknown, stage: string): string {
    if (e instanceof DOMException) return `${stage}：浏览器拦截 [${e.name}] ${e.message}`;
    if (e instanceof Error) {
      const msg = e.message;
      if (/string did not match|Failed to fetch|NetworkError/i.test(msg)) {
        const tokOk = token && token.length > 20 ? `token长度${token.length}` : `token异常("${token.slice(0, 10)}")`;
        return `${stage}：${msg}；${tokOk}；请试试退出重新登录`;
      }
      return `${stage}：${msg}`;
    }
    return `${stage}：未知错误`;
  }
  async function authGet(url: string, stage: string) {
    if (!token) throw new Error(stage + "：未登录，请退出重新进");
    const res = await fetch(url, { headers: { Authorization: "Bearer " + token.trim() } });
    const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    if (!res.ok || !data.success) throw new Error(`${stage}：${data.error || ("HTTP " + res.status)}`);
    return data;
  }


  async function loadAlbums() {
    setLoading(true);
    setError("");
    try {
      const data = await authGet("/api/admin/gallery", "相册列表");
      setAlbums(data.albums || []);
    } catch (e) {
      setError(diagErr(e, "相册列表"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadAlbums(); /* eslint-disable-next-line */ }, []);

  async function postJson(body: object) {
    const res = await fetch("/api/admin/gallery", { method: "POST", headers: auth, body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || "操作失败");
    return data;
  }

  async function createAlbum() {
    const title = newTitle.trim();
    if (!title) { setError("先输入相册标题再点新建"); return; }
    try {
      await postJson({ action: "create_album", title });
      setNewTitle("");
      loadAlbums();
    } catch (e) {
      setError(diagErr(e, "新建相册"));
    }
  }

  async function toggleAlbum(a: Album) {
    try {
      await postJson({ action: "update_album", id: a.id, status: a.status === "active" ? "hidden" : "active" });
      loadAlbums();
    } catch (e) { setError(e instanceof Error ? e.message : "操作失败"); }
  }

  async function deleteAlbum(a: Album) {
    if (!confirm(`确定删除相册「${a.title}」？里面所有图片都会从 R2 删除，不可恢复。`)) return;
    try {
      await postJson({ action: "delete_album", id: a.id });
      loadAlbums();
    } catch (e) { setError(e instanceof Error ? e.message : "删除失败"); }
  }

  async function openAlbum(a: Album) {
    setCurrentAlbumId(a.id);
    setLoading(true);
    try {
      const data = await authGet(`/api/admin/gallery?action=photos&albumId=${encodeURIComponent(a.id)}`, "图片列表");
      setPhotos(data.photos || []);
    } catch (e) {
      setError(diagErr(e, "进入相册"));
    } finally {
      setLoading(false);
    }
  }

  async function onPickFiles(picked: FileList | null) {
    if (!picked || picked.length === 0 || !currentAlbumId) return;
    setUploading(true);
    setError("");
    const total = picked.length;
    setUploadMsg(`准备 0/${total}`);
    try {
      // 重建为安全文件名（iOS HEIC 在选图时已被系统自动转 JPEG）
      const allFiles: File[] = [];
      for (let i = 0; i < total; i++) {
        const f = picked[i];
        if (!f.type.startsWith("image/") || f.size === 0) {
          throw new Error(`第 ${i + 1} 张图片无效（可能 iCloud 原图还没下载下来，先在相册里点开加载完再选）`);
        }
        const ext = ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" } as Record<string, string>)[f.type] || "jpg";
        const buf = await f.arrayBuffer();
        const safe = new File([buf], `upload_${Date.now()}_${i}.${ext}`, { type: f.type });
        (safe as File & { originalName?: string }).originalName = f.name;
        allFiles.push(safe);
      }
      // 分批，每批 6 张
      const batch = 6;
      for (let i = 0; i < allFiles.length; i += batch) {
        const chunk = allFiles.slice(i, i + batch);
        const fd = new FormData();
        fd.append("albumId", currentAlbumId);
        chunk.forEach((f) => fd.append("files", f));
        fd.append("names", JSON.stringify(chunk.map((f) => (f as File & { originalName?: string }).originalName || f.name)));
        setUploadMsg(`上传 ${i + 1}-${Math.min(i + batch, total)}/${total}`);
        const res = await fetch("/api/admin/gallery", {
          method: "POST",
          headers: { Authorization: "Bearer " + token.trim() },
          body: fd,
        });
        const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        if (!res.ok || !data.success) throw new Error(data.error || "上传失败");
      }
      setUploadMsg("上传完成 ✓");
      const a = albums.find((x) => x.id === currentAlbumId);
      if (a) await openAlbum(a);
      loadAlbums();
      setTimeout(() => setUploadMsg(""), 2500);
    } catch (e) {
      setUploadMsg("");
      setError(diagErr(e, "上传图片"));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function togglePhoto(p: Photo) {
    try {
      await postJson({ action: "update_photo", id: p.id, status: p.status === "active" ? "hidden" : "active" });
      const a = albums.find((x) => x.id === currentAlbumId);
      if (a) openAlbum(a);
    } catch (e) { setError(e instanceof Error ? e.message : "操作失败"); }
  }

  async function deletePhoto(p: Photo) {
    if (!confirm("确定删除这张图？R2 上的文件也会删掉。")) return;
    try {
      await postJson({ action: "delete_photo", id: p.id });
      const a = albums.find((x) => x.id === currentAlbumId);
      if (a) { openAlbum(a); loadAlbums(); }
    } catch (e) { setError(e instanceof Error ? e.message : "删除失败"); }
  }

  const currentAlbum = albums.find((a) => a.id === currentAlbumId);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#f7f9f9" }}>
      <div style={{ padding: "12px 14px", background: "#fff", borderBottom: "1px solid #eff3f4", display: "flex", alignItems: "center", gap: 10 }}>
        {currentAlbumId && (
          <button onClick={() => { setCurrentAlbumId(null); setPhotos([]); loadAlbums(); }} style={{ fontSize: 22, background: "none", border: "none", cursor: "pointer" }}>‹</button>
        )}
        {!currentAlbumId && (
          <button onClick={onClose} style={{ fontSize: 22, background: "none", border: "none", cursor: "pointer" }}>‹</button>
        )}
        <div style={{ fontSize: 16, fontWeight: 800 }}>🖼️ 相册管理</div>
      </div>

      {error && (
        <div style={{ margin: 10, padding: "8px 12px", background: "#fef2f2", color: "#dc2626", borderRadius: 8, fontSize: 12, display: "flex", justifyContent: "space-between" }}>
          <span>{error}</span>
          <button onClick={() => setError("")} style={{ background: "none", border: "none", cursor: "pointer" }}>×</button>
        </div>
      )}

      <div style={{ flex: 1, overflowY: "auto", padding: 12 }}>
        {!currentAlbumId ? (
          <>
            <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && createAlbum()}
                placeholder="新相册标题，如：官方壁纸第一弹"
                style={{ flex: 1, border: "1px solid #d8dee4", borderRadius: 10, padding: "9px 12px", fontSize: 13, outline: "none" }}
              />
              <button onClick={createAlbum} disabled={!newTitle.trim()} style={{ background: newTitle.trim() ? "#f91880" : "#cbd5e1", color: "#fff", border: "none", borderRadius: 10, padding: "0 16px", fontSize: 13, fontWeight: 700, cursor: newTitle.trim() ? "pointer" : "default" }}>新建</button>
            </div>

            {loading ? <div style={{ textAlign: "center", padding: 40, color: "#8899a6" }}>加载中…</div>
              : albums.length === 0 ? <div style={{ textAlign: "center", padding: 60, color: "#8899a6", fontSize: 13 }}>还没有相册，先建一个吧</div>
                : albums.map((a) => (
                  <div key={a.id} style={{ background: "#fff", borderRadius: 12, padding: 12, marginBottom: 10, display: "flex", gap: 12, alignItems: "center" }}>
                    <div onClick={() => openAlbum(a)} style={{
                      width: 56, height: 56, borderRadius: 10, flexShrink: 0, cursor: "pointer",
                      background: a.cover_url ? `#eef1f3 center/cover url(${a.cover_url})` : "linear-gradient(135deg,#ffe4ec,#e7f5ff)",
                      display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22,
                    }}>{!a.cover_url && "🖼️"}</div>
                    <div onClick={() => openAlbum(a)} style={{ flex: 1, minWidth: 0, cursor: "pointer" }}>
                      <div style={{ fontSize: 14, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
                        {a.title}
                        {a.status === "hidden" && <span style={{ fontSize: 10, background: "#fef3c7", color: "#92400e", padding: "1px 6px", borderRadius: 4 }}>隐藏中</span>}
                      </div>
                      <div style={{ fontSize: 11, color: "#8899a6", marginTop: 3 }}>点击进入上传/管理图片</div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                      <button onClick={() => toggleAlbum(a)} style={{ fontSize: 11, border: "none", borderRadius: 6, padding: "4px 10px", background: a.status === "active" ? "#fef3c7" : "#dcfce7", color: a.status === "active" ? "#92400e" : "#166534", cursor: "pointer" }}>{a.status === "active" ? "隐藏" : "上架"}</button>
                      <button onClick={() => deleteAlbum(a)} style={{ fontSize: 11, border: "none", borderRadius: 6, padding: "4px 10px", background: "#fee2e2", color: "#991b1b", cursor: "pointer" }}>删除</button>
                    </div>
                  </div>
                ))}
          </>
        ) : (
          <>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>{currentAlbum?.title}</div>

            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple style={{ display: "none" }} onChange={(e) => onPickFiles(e.target.files)} />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              style={{ width: "100%", padding: "14px", borderRadius: 12, border: "2px dashed #f9a8d4", background: "#fff0f6", color: "#be185d", fontSize: 14, fontWeight: 700, cursor: uploading ? "default" : "pointer", marginBottom: 8 }}
            >{uploading ? (uploadMsg || "上传中…") : "📤 选择图片上传（可多选，自动压缩高清 WebP）"}</button>
            <div style={{ fontSize: 11, color: "#8899a6", marginBottom: 12, lineHeight: 1.6 }}>
              单张原图 ≤25MB；长边压到 2048px、质量 82，同时自动生成缩略图。GIF 保留原样。
            </div>

            {loading ? <div style={{ textAlign: "center", padding: 40, color: "#8899a6" }}>加载中…</div>
              : photos.length === 0 ? <div style={{ textAlign: "center", padding: 50, color: "#8899a6", fontSize: 13 }}>还没有图</div>
                : (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                    {photos.map((p) => (
                      <div key={p.id} style={{ position: "relative", borderRadius: 8, overflow: "hidden" }}>
                        <div style={{
                          aspectRatio: "1/1",
                          background: `#1c2733 center/cover url(${p.thumb_url || p.image_url})`,
                          filter: p.status === "active" ? "none" : "grayscale(1) opacity(0.5)",
                        }} />
                        {p.status === "hidden" && (
                          <div style={{ position: "absolute", top: 4, left: 4, background: "#92400e", color: "#fff", fontSize: 9, padding: "1px 5px", borderRadius: 4 }}>隐藏</div>
                        )}
                        <div style={{ display: "flex" }}>
                          <button onClick={() => togglePhoto(p)} style={{ flex: 1, border: "none", background: "#334155", color: "#fff", fontSize: 10, padding: "5px 0", cursor: "pointer" }}>{p.status === "active" ? "隐藏" : "上架"}</button>
                          <button onClick={() => deletePhoto(p)} style={{ flex: 1, border: "none", background: "#991b1b", color: "#fff", fontSize: 10, padding: "5px 0", cursor: "pointer" }}>删除</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
          </>
        )}
      </div>
    </div>
  );
}
