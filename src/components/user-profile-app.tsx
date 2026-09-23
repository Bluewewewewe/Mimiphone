"use client";

import { useEffect, useMemo, useState } from "react";

interface InviteCodeItem {
  code: string;
  status: string;
  used_by?: string;
  used_by_username?: string;
  used_at?: string;
  revoked_at?: string;
}

interface ForumPost {
  id: string;
  title: string;
  content: string;
  author: string;
  authorAvatar: string;
  section: string;
  sectionName?: string;
  replyCount: number;
  viewCount: number;
  likes: number;
  favorites: number;
  createdAt: string;
  lastReplyAt: string;
  isEssence: boolean;
  isPinned: boolean;
}

interface UserProfileAppProps {
  username: string;
  isSelf?: boolean;
  bio?: string;
  onClose: () => void;
}

function loadForumPosts(): ForumPost[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem("forum_posts");
    if (!raw) return [];
    return JSON.parse(raw) as ForumPost[];
  } catch {
    return [];
  }
}

interface ApiForumPost {
  id: string;
  title: string;
  content: string;
  section: string;
  author_name: string;
  created_at: string;
  is_pinned: boolean;
  is_essence: boolean;
  replyCount?: number;
  likes?: number;
  favorites?: number;
  forum_replies?: { count: number }[];
  forum_likes?: { count: number }[];
}

async function fetchAllForumPosts(): Promise<ForumPost[]> {
  try {
    const res = await fetch("/api/forum", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "list", section: "all" })
    });
    const json = await res.json() as { success: boolean; data?: ApiForumPost[]; error?: string };
    if (!json.success || !Array.isArray(json.data)) return loadForumPosts();
    return json.data.map((p) => ({
      id: p.id,
      title: p.title,
      content: p.content,
      author: p.author_name,
      authorAvatar: p.section === "announce" ? "📢" : "🌽",
      section: p.section,
      sectionName: p.section,
      replyCount: p.replyCount ?? p.forum_replies?.[0]?.count ?? 0,
      viewCount: 0,
      likes: p.likes ?? p.forum_likes?.[0]?.count ?? 0,
      favorites: p.favorites ?? 0,
      createdAt: new Date(p.created_at).toLocaleString("zh-CN"),
      lastReplyAt: new Date(p.created_at).toLocaleString("zh-CN"),
      isEssence: p.is_essence,
      isPinned: p.is_pinned
    }));
  } catch {
    return loadForumPosts();
  }
}

function loadUserSet(keyBase: string, username: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(`${keyBase}_${username}`);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

function loadCoins(username: string): number {
  if (typeof window === "undefined") return 1000;
  try {
    const raw = localStorage.getItem(`mimi_coins_${username}`);
    return raw ? Number(raw) : 1000;
  } catch {
    return 1000;
  }
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  return `${date.getMonth() + 1}/${date.getDate()} ${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`;
}

export default function UserProfileApp({ username, isSelf = false, bio = "", onClose }: UserProfileAppProps) {
  const [activeTab, setActiveTab] = useState<"posts" | "likes" | "favorites" | "invites">("posts");
  const [posts, setPosts] = useState<ForumPost[]>([]);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [favoritedIds, setFavoritedIds] = useState<Set<string>>(new Set());
  const [coins, setCoins] = useState<number>(1000);
  const [inviteCodes, setInviteCodes] = useState<InviteCodeItem[]>([]);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string>("");
  const [uploading, setUploading] = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/auth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "get_profile", username }),
        });
        const json = await res.json() as { success?: boolean; profile?: { avatarUrl?: string } };
        if (!cancelled && json.success && json.profile) setAvatarUrl(json.profile.avatarUrl || "");
      } catch {
        // ignore
      }
      const data = await fetchAllForumPosts();
      const token = typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;
      let codes: InviteCodeItem[] = [];
      if (token) {
        try {
          const res = await fetch("/api/auth", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "list_my_invite_codes", authToken: token }),
          });
          const json = await res.json() as { success?: boolean; data?: InviteCodeItem[] };
          if (json.success) codes = json.data || [];
        } catch {
          // ignore
        }
      }
      if (!cancelled) {
        setPosts(data);
        setLikedIds(loadUserSet("forum_likes", username));
        setFavoritedIds(loadUserSet("forum_favorites", username));
        setCoins(loadCoins(username));
        setInviteCodes(codes);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [username]);

  const userPosts = useMemo(
    () => posts.filter((p) => p.author === username).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [posts, username]
  );

  const likedPosts = useMemo(
    () => posts.filter((p) => likedIds.has(p.id)).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [posts, likedIds]
  );

  const favoritePosts = useMemo(
    () => posts.filter((p) => favoritedIds.has(p.id)).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [posts, favoritedIds]
  );

  const isTeacher = false; // TODO: 后续接入真实身份系统

  const handlePickAvatar = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/jpeg,image/png,image/webp,image/gif";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) { alert("图片不能超过 5MB"); return; }
      const token = localStorage.getItem("auth_token");
      if (!token) { alert("请先登录"); return; }
      setUploading(true);
      try {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("kind", "avatar");
        fd.append("token", token);
        const up = await fetch("/api/upload", { method: "POST", body: fd });
        const upj = await up.json() as { success?: boolean; url?: string; error?: string };
        if (!upj.success || !upj.url) throw new Error(upj.error || "上传失败");
        const sv = await fetch("/api/auth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "update_avatar", authToken: token, avatarUrl: upj.url }),
        });
        const svj = await sv.json() as { success?: boolean; error?: string };
        if (!svj.success) throw new Error(svj.error || "保存失败");
        setAvatarUrl(upj.url);
      } catch (e) {
        alert(e instanceof Error ? e.message : "上传失败");
      } finally {
        setUploading(false);
      }
    };
    input.click();
  };

  const renderPostItem = (post: ForumPost) => (
    <div key={post.id} className="bg-white/60 backdrop-blur-md rounded-xl p-3 mb-2 border border-white/40">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
          {post.sectionName || post.section}
        </span>
        {post.isEssence && <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">精华</span>}
      </div>
      <h3 className="font-semibold text-foreground text-sm mb-1 line-clamp-2">{post.title}</h3>
      <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{post.content}</p>
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span>{formatTime(post.createdAt)}</span>
        <div className="flex items-center gap-3">
          <span>👁 {post.viewCount}</span>
          <span>👍 {post.likes}</span>
          <span>💬 {post.replyCount}</span>
        </div>
      </div>
    </div>
  );

  return (
    <div className="app-page flex flex-col h-full bg-gradient-to-b from-background to-background/95">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-6 pb-2 border-b border-border/30 bg-white/40 backdrop-blur-md shrink-0">
        <button
          onClick={onClose}
          className="w-8 h-8 flex items-center justify-center rounded-full bg-white/50 active:scale-90 transition-transform"
        >
          ←
        </button>
        <span className="font-semibold text-foreground">{isSelf ? "我的主页" : "用户主页"}</span>
        <div className="w-8" />
      </div>

      {/* User info */}
      <div className="px-4 py-5 bg-white/50 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={isSelf ? handlePickAvatar : undefined}
            className={`relative w-16 h-16 rounded-full bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center text-3xl border-2 border-white/60 shadow-sm overflow-hidden shrink-0 ${isSelf ? "cursor-pointer active:scale-95 transition-transform" : "cursor-default"}`}
            title={isSelf ? (uploading ? "上传中…" : "点击更换头像") : ""}
          >
            {avatarUrl ? (
              <img src={avatarUrl} alt={username} className="w-full h-full object-cover" />
            ) : (
              <span>👤</span>
            )}
            {isSelf && (
              <span className="absolute inset-x-0 bottom-0 bg-black/45 text-white text-[9px] leading-tight py-0.5 text-center">
                {uploading ? "上传中" : "更换"}
              </span>
            )}
          </button>
          <div className="flex-1">
            <h2 className="text-lg font-bold text-foreground">{username}</h2>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-xs px-2 py-1 rounded-full bg-amber-100 text-amber-700 font-medium">
                🪙 {coins} 米米币
              </span>
              {isTeacher && <span className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary">米老师</span>}
            </div>
            {bio ? (
              <p className="mt-2 text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">{bio}</p>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground/60 italic">暂无个人简介</p>
            )}
          </div>
        </div>
      </div>

      {/* Tabs (self only) */}
      {isSelf ? (
        <div className="flex items-center gap-1 px-3 py-2 border-b border-border/20 bg-white/30 shrink-0">
          {[
            { key: "posts", label: "我的帖子" },
            { key: "likes", label: "我的点赞" },
            { key: "favorites", label: "我的收藏" },
            { key: "invites", label: "我的邀请码" },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as "posts" | "likes" | "favorites" | "invites")}
              className={`flex-1 py-2 text-xs font-medium rounded-lg transition-colors ${
                activeTab === tab.key
                  ? "bg-primary text-primary-foreground"
                  : "bg-white/40 text-muted-foreground hover:bg-white/60"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      ) : null}

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3">
        {isTeacher && !isSelf && (
          <div className="mb-3">
            <h3 className="text-sm font-semibold text-foreground mb-2">上的课</h3>
            <div className="text-xs text-muted-foreground bg-white/40 rounded-lg p-3">暂无课程</div>
            <h3 className="text-sm font-semibold text-foreground mb-2 mt-3">正在上的课</h3>
            <div className="text-xs text-muted-foreground bg-white/40 rounded-lg p-3">暂无课程</div>
          </div>
        )}

        {!isSelf && <h3 className="text-sm font-semibold text-foreground mb-2">发布的帖子</h3>}

        {activeTab === "posts" && (
          <>
            {userPosts.length === 0 ? (
              <div className="text-center text-xs text-muted-foreground py-8 bg-white/40 rounded-xl">还没有发布过帖子</div>
            ) : (
              userPosts.map(renderPostItem)
            )}
          </>
        )}

        {activeTab === "likes" && (
          <>
            {likedPosts.length === 0 ? (
              <div className="text-center text-xs text-muted-foreground py-8 bg-white/40 rounded-xl">还没有点赞过帖子</div>
            ) : (
              likedPosts.map(renderPostItem)
            )}
          </>
        )}

        {activeTab === "favorites" && (
          <>
            {favoritePosts.length === 0 ? (
              <div className="text-center text-xs text-muted-foreground py-8 bg-white/40 rounded-xl">还没有收藏过帖子</div>
            ) : (
              favoritePosts.map(renderPostItem)
            )}
          </>
        )}

        {activeTab === "invites" && (
          <>
            {(() => {
              const available = inviteCodes.filter((c) => c.status === "active");
              const used = inviteCodes.filter((c) => c.status === "used");
              const revoked = inviteCodes.filter((c) => c.status === "revoked");
              const copy = (code: string) => {
                void navigator.clipboard.writeText(code);
                setCopiedCode(code);
                setTimeout(() => setCopiedCode(null), 1500);
              };
              return (
                <div className="space-y-4">
                  <div className="rounded-xl bg-gradient-to-r from-primary/20 to-primary/5 p-4 text-center border border-primary/20">
                    <div className="text-3xl font-bold text-foreground">{available.length}</div>
                    <div className="text-xs text-muted-foreground">还能邀请 {available.length} 人</div>
                  </div>

                  {available.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold text-foreground mb-2">可用邀请码</h3>
                      <div className="flex flex-wrap gap-2">
                        {available.map((c) => (
                          <button
                            key={c.code}
                            onClick={() => copy(c.code)}
                            className="min-h-[44px] rounded-lg bg-primary/10 px-3 py-2 text-sm font-mono text-primary border border-primary/20 active:scale-95 transition-transform"
                          >
                            {c.code} {copiedCode === c.code ? "✅已复制" : "📋"}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {used.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold text-foreground mb-2">已使用</h3>
                      <div className="space-y-2">
                        {used.map((c) => (
                          <div key={c.code} className="rounded-lg bg-white/40 p-2 text-xs text-muted-foreground">
                            <span className="font-mono text-foreground">{c.code}</span>
                            <span className="mx-2">→</span>
                            <span>{c.used_by_username || c.used_by || "未知用户"}</span>
                            <span className="ml-2">{c.used_at ? formatTime(c.used_at) : ""}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {revoked.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold text-foreground mb-2">已作废</h3>
                      <div className="flex flex-wrap gap-2">
                        {revoked.map((c) => (
                          <span key={c.code} className="text-xs font-mono text-muted-foreground line-through">
                            {c.code}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </>
        )}
      </div>
    </div>
  );
}
