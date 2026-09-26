"use client";

import { useEffect, useMemo, useState } from "react";

interface ProfilePostCard {
  id: string;
  title: string;
  content: string;
  section: string;
  author_name: string;
  author_avatar: string;
  replyCount: number;
  likes: number;
  favorites: number;
  created_at: string;
}

interface UserProfileData {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  bio: string;
  joinedAt: string;
}

interface FollowUserItem {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  bio: string;
}

interface UserProfileAppProps {
  username: string;
  isSelf?: boolean;
  embedded?: boolean;
  onClose?: () => void;
  onBack?: () => void;
  onOpenPost?: (postId: string) => void;
  onOpenUser?: (username: string) => void;
}

async function forumApi(action: string, payload: Record<string, unknown> = {}) {
  const token = typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;
  const res = await fetch("/api/forum", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, authToken: token, ...payload }),
  });
  return res.json() as Promise<{ success: boolean; data?: unknown; error?: string }>;
}

function formatTime(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const SECTION_LABELS: Record<string, string> = {
  general: "综合",
  cp: "CP讨论",
  fanfic: "同人文",
  creative: "同人创作",
  event: "活动",
  announce: "公告",
  "bug-report": "Bug反馈",
};

export default function UserProfileApp({
  username,
  isSelf = false,
  embedded = false,
  onClose,
  onBack,
  onOpenPost,
  onOpenUser,
}: UserProfileAppProps) {
  const [profile, setProfile] = useState<UserProfileData | null>(null);
  const [activeTab, setActiveTab] = useState<"posts" | "likes" | "favorites">("posts");
  const [posts, setPosts] = useState<ProfilePostCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [avatarUploading, setAvatarUploading] = useState(false);

  // 关注相关
  const [followingCount, setFollowingCount] = useState(0);
  const [followerCount, setFollowerCount] = useState(0);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [listModal, setListModal] = useState<null | "following" | "followers">(null);
  const [listUsers, setListUsers] = useState<FollowUserItem[]>([]);
  const [listLoading, setListLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setLoadError("");
      try {
        const res = await forumApi("user_profile", { username });
        if (!res.success || !res.data) {
          if (!cancelled) setLoadError(res.error || "用户不存在");
          return;
        }
        const p = res.data as UserProfileData;
        if (cancelled) return;
        setProfile(p);
        setActiveTab("posts");

        const [pr, cr] = await Promise.all([
          forumApi("user_posts", { userId: p.id }),
          forumApi("follow_counts", { userId: p.id }),
        ]);
        if (cancelled) return;
        if (pr.success) setPosts((pr.data as ProfilePostCard[]) || []);
        if (cr.success && cr.data) {
          const c = cr.data as { following: number; followers: number; isFollowing: boolean };
          setFollowingCount(c.following);
          setFollowerCount(c.followers);
          setIsFollowing(c.isFollowing);
        }
      } catch {
        if (!cancelled) setLoadError("加载失败，请稍后重试");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [username]);

  async function switchTab(tab: "posts" | "likes" | "favorites") {
    if (!profile) return;
    setActiveTab(tab);
    if (tab === "posts") {
      const r = await forumApi("user_posts", { userId: profile.id });
      if (r.success) setPosts((r.data as ProfilePostCard[]) || []);
    } else if (tab === "likes") {
      const r = await forumApi("user_likes", { userId: profile.id });
      if (r.success) setPosts((r.data as ProfilePostCard[]) || []);
      else alert(r.error || "加载失败");
    } else {
      const r = await forumApi("user_favorites", { userId: profile.id });
      if (r.success) setPosts((r.data as ProfilePostCard[]) || []);
      else alert(r.error || "加载失败");
    }
  }

  const toggleFollow = async () => {
    if (!profile || followBusy) return;
    setFollowBusy(true);
    try {
      const r = await forumApi("follow", { userId: profile.id });
      if (r.success && r.data) {
        const d = r.data as { following: boolean };
        setIsFollowing(d.following);
        setFollowerCount((n) => n + (d.following ? 1 : -1));
      } else {
        alert(r.error || "操作失败");
      }
    } finally {
      setFollowBusy(false);
    }
  };

  const openFollowList = async (type: "following" | "followers") => {
    if (!profile) return;
    setListModal(type);
    setListLoading(true);
    try {
      const r = await forumApi("follow_list", { userId: profile.id, type });
      if (r.success) setListUsers((r.data as FollowUserItem[]) || []);
    } finally {
      setListLoading(false);
    }
  };

  const handlePickAvatar = () => {
    if (!isSelf) return;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/jpeg,image/png,image/webp,image/gif";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      if (file.size > 2 * 1024 * 1024) {
        alert("头像图片超过 2MB，无法上传，请压缩或换一张");
        return;
      }
      const token = localStorage.getItem("auth_token");
      if (!token) {
        alert("请先登录");
        return;
      }
      setAvatarUploading(true);
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
        setProfile((prev) => (prev ? { ...prev, avatarUrl: upj.url as string } : prev));
      } catch (e) {
        alert(e instanceof Error ? e.message : "上传失败");
      } finally {
        setAvatarUploading(false);
      }
    };
    input.click();
  };

  const displayName = profile?.displayName || username;

  const renderPostCard = (post: ProfilePostCard) => (
    <div
      key={post.id}
      onClick={() => onOpenPost?.(post.id)}
      style={{
        background: "#fff",
        borderRadius: 12,
        padding: 12,
        marginBottom: 8,
        border: "1px solid #f0f0f0",
        cursor: onOpenPost ? "pointer" : "default",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
        <span
          style={{
            fontSize: 11,
            padding: "2px 8px",
            borderRadius: 10,
            background: "#fff7ed",
            color: "#ea580c",
            fontWeight: 500,
          }}
        >
          {SECTION_LABELS[post.section] || post.section}
        </span>
        <span style={{ fontSize: 11, color: "#9ca3af", marginLeft: "auto" }}>
          {formatTime(post.created_at)}
        </span>
      </div>
      <h3
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: "#1f2937",
          marginBottom: 4,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {post.title}
      </h3>
      <p
        style={{
          fontSize: 12,
          color: "#6b7280",
          lineHeight: 1.5,
          marginBottom: 8,
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {post.content}
      </p>
      <div style={{ display: "flex", gap: 14, fontSize: 12, color: "#9ca3af" }}>
        <span>💬 {post.replyCount}</span>
        <span>❤️ {post.likes}</span>
        <span>⭐ {favoritesLabel(post)}</span>
      </div>
    </div>
  );

  function favoritesLabel(post: ProfilePostCard) {
    return post.favorites;
  }

  const emptyText = useMemo(() => {
    if (activeTab === "posts") return isSelf ? "还没有发布过帖子" : "TA还没有发布过帖子";
    if (activeTab === "likes") return "还没有点赞过帖子";
    return "还没有收藏过帖子";
  }, [activeTab, isSelf]);

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "#f5f5f5" }}>
      {!embedded ? (
        <div
          style={{
            background: "linear-gradient(135deg, #f97316 0%, #fb923c 100%)",
            padding: "16px 20px",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexShrink: 0,
          }}
        >
          <button
            onClick={onClose}
            style={{
              background: "rgba(255,255,255,0.2)",
              border: "none",
              color: "#fff",
              width: 32,
              height: 32,
              borderRadius: 8,
              fontSize: 18,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            ←
          </button>
          <div style={{ flex: 1, fontSize: 16, fontWeight: 600 }}>
            {isSelf ? "我的主页" : "用户主页"}
          </div>
        </div>
      ) : onBack ? (
        <div
          style={{
            background: "linear-gradient(135deg, #f97316 0%, #fb923c 100%)",
            padding: "10px 16px",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexShrink: 0,
          }}
        >
          <button
            onClick={onBack}
            style={{
              background: "rgba(255,255,255,0.2)",
              border: "none",
              color: "#fff",
              width: 32,
              height: 32,
              borderRadius: 8,
              fontSize: 18,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            ←
          </button>
          <div style={{ flex: 1, fontSize: 15, fontWeight: 600 }}>
            {isSelf ? "我的主页" : "用户主页"}
          </div>
        </div>
      ) : null}

      <div style={{ flex: 1, overflowY: "auto", paddingBottom: embedded ? 68 : 12 }}>
        <div
          style={{
            margin: 12,
            background: "#fff",
            borderRadius: 16,
            padding: 18,
            border: "1px solid #f0f0f0",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <button
              type="button"
              onClick={handlePickAvatar}
              title={isSelf ? (avatarUploading ? "上传中…" : "点击更换头像") : ""}
              style={{
                position: "relative",
                width: 68,
                height: 68,
                borderRadius: "50%",
                overflow: "hidden",
                border: "3px solid #fff",
                boxShadow: "0 2px 10px rgba(0,0,0,0.12)",
                background: "linear-gradient(135deg,#fde68a,#fca5a5)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 30,
                cursor: isSelf ? "pointer" : "default",
                padding: 0,
                flexShrink: 0,
              }}
            >
              {profile?.avatarUrl ? (
                <img
                  src={profile.avatarUrl}
                  alt={displayName}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              ) : (
                <span>🌽</span>
              )}
              {isSelf && (
                <span
                  style={{
                    position: "absolute",
                    insetInline: 0,
                    bottom: 0,
                    background: "rgba(0,0,0,0.45)",
                    color: "#fff",
                    fontSize: 9,
                    lineHeight: "1.4",
                    paddingTop: 2,
                    paddingBottom: 2,
                    textAlign: "center",
                  }}
                >
                  {avatarUploading ? "上传中" : "更换"}
                </span>
              )}
            </button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h2
                style={{
                  fontSize: 18,
                  fontWeight: 700,
                  color: "#1f2937",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {displayName}
              </h2>
              {profile?.username && profile.username !== displayName && (
                <p style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>@{profile.username}</p>
              )}
              {profile?.joinedAt && (
                <p style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>
                  📅 {new Date(profile.joinedAt).toLocaleDateString("zh-CN")} 加入
                </p>
              )}
            </div>
          </div>

          {/* 关注数 / 粉丝数 */}
          <div
            style={{
              display: "flex",
              gap: 10,
              marginTop: 14,
            }}
          >
            <button
              onClick={() => openFollowList("following")}
              style={{
                flex: 1,
                background: "#f9fafb",
                border: "1px solid #f3f4f6",
                borderRadius: 10,
                padding: "8px 0",
                cursor: "pointer",
                fontSize: 12,
                color: "#6b7280",
              }}
            >
              <span style={{ fontSize: 15, fontWeight: 700, color: "#1f2937" }}>{followingCount}</span>
              <span style={{ marginLeft: 4 }}>关注</span>
            </button>
            <button
              onClick={() => openFollowList("followers")}
              style={{
                flex: 1,
                background: "#f9fafb",
                border: "1px solid #f3f4f6",
                borderRadius: 10,
                padding: "8px 0",
                cursor: "pointer",
                fontSize: 12,
                color: "#6b7280",
              }}
            >
              <span style={{ fontSize: 15, fontWeight: 700, color: "#1f2937" }}>{followerCount}</span>
              <span style={{ marginLeft: 4 }}>粉丝</span>
            </button>
            {!isSelf && (
              <button
                onClick={toggleFollow}
                disabled={followBusy}
                style={{
                  flex: 1,
                  border: "none",
                  borderRadius: 10,
                  padding: "8px 0",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  background: isFollowing ? "#f3f4f6" : "#f97316",
                  color: isFollowing ? "#6b7280" : "#fff",
                }}
              >
                {followBusy ? "..." : isFollowing ? "已关注" : "+ 关注"}
              </button>
            )}
          </div>

          <div
            style={{
              marginTop: 14,
              paddingTop: 12,
              borderTop: "1px solid #f3f4f6",
              fontSize: 13,
              color: "#4b5563",
              lineHeight: 1.7,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {profile?.bio ? profile.bio : <span style={{ color: "#c0c0c0", fontStyle: "italic" }}>暂无个人简介</span>}
          </div>
        </div>

        <div style={{ display: "flex", gap: 6, padding: "0 12px", marginBottom: 8 }}>
          {(
            [
              { key: "posts", label: "帖子" },
              ...(isSelf
                ? [
                    { key: "likes", label: "点赞" },
                    { key: "favorites", label: "收藏" },
                  ]
                : []),
            ] as { key: "posts" | "likes" | "favorites"; label: string }[]
          ).map((tab) => (
            <button
              key={tab.key}
              onClick={() => switchTab(tab.key)}
              style={{
                flex: 1,
                padding: "9px 0",
                fontSize: 13,
                fontWeight: 500,
                borderRadius: 10,
                border: "none",
                background: activeTab === tab.key ? "#f97316" : "#fff",
                color: activeTab === tab.key ? "#fff" : "#6b7280",
                cursor: "pointer",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div style={{ padding: "0 12px 16px" }}>
          {loadError ? (
            <div style={{ textAlign: "center", fontSize: 13, color: "#9ca3af", padding: "30px 0", background: "#fff", borderRadius: 12 }}>
              {loadError}
            </div>
          ) : loading ? (
            <div style={{ textAlign: "center", fontSize: 13, color: "#9ca3af", padding: "30px 0" }}>加载中...</div>
          ) : posts.length === 0 ? (
            <div style={{ textAlign: "center", fontSize: 13, color: "#9ca3af", padding: "30px 0", background: "#fff", borderRadius: 12 }}>
              {emptyText}
            </div>
          ) : (
            posts.map(renderPostCard)
          )}
        </div>
      </div>

      {/* 关注/粉丝列表弹层 */}
      {listModal && (
        <div
          onClick={() => setListModal(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.4)",
            zIndex: 1000,
            display: "flex",
            alignItems: "flex-end",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxHeight: "70%",
              background: "#fff",
              borderRadius: "20px 20px 0 0",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              style={{
                padding: "14px 20px",
                borderBottom: "1px solid #f3f4f6",
                display: "flex",
                alignItems: "center",
                gap: 10,
                fontSize: 15,
                fontWeight: 600,
              }}
            >
              <button onClick={() => setListModal(null)} style={{ border: "none", background: "none", fontSize: 18, cursor: "pointer", color: "#6b7280" }}>
                ←
              </button>
              {listModal === "following" ? "我的关注" : "我的粉丝"}
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: 12 }}>
              {listLoading ? (
                <div style={{ textAlign: "center", color: "#9ca3af", fontSize: 13, padding: 20 }}>加载中...</div>
              ) : listUsers.length === 0 ? (
                <div style={{ textAlign: "center", color: "#9ca3af", fontSize: 13, padding: 30 }}>
                  {listModal === "following" ? "还没有关注任何人" : "还没有粉丝"}
                </div>
              ) : (
                listUsers.map((u) => (
                  <div
                    key={u.id}
                    style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 4px" }}
                  >
                    <button
                      onClick={() => {
                        setListModal(null);
                        onOpenUser?.(u.username);
                      }}
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: "50%",
                        overflow: "hidden",
                        border: "none",
                        background: "linear-gradient(135deg,#fde68a,#fca5a5)",
                        fontSize: 20,
                        cursor: "pointer",
                        flexShrink: 0,
                        padding: 0,
                      }}
                    >
                      {u.avatarUrl ? (
                        <img src={u.avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      ) : (
                        "🌽"
                      )}
                    </button>
                    <div
                      style={{ flex: 1, minWidth: 0, cursor: "pointer" }}
                      onClick={() => {
                        setListModal(null);
                        onOpenUser?.(u.username);
                      }}
                    >
                      <div style={{ fontSize: 14, fontWeight: 600, color: "#1f2937" }}>{u.displayName}</div>
                      <div
                        style={{
                          fontSize: 12,
                          color: "#9ca3af",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {u.bio || "@" + u.username}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
