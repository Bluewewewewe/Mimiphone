import { NextRequest, NextResponse } from "next/server";
import getSupabaseClient from "@/storage/database/supabase-client";
import {
  requireAuth,
  requireAdmin,
  hasPermission,
  logAudit,
  type VerifiedUser,
  type AdminPermission,
} from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";

// 内置板块白名单；自定义板块后续走 forum_sections 表，届时与内置板块合并校验
const BUILTIN_SECTIONS = new Set([
  "general",
  "cp",
  "fanfic",
  "creative",
  "event",
  "announce",
  "bug-report",
]);
// 仅管理员可发帖的板块
const ADMIN_ONLY_SECTIONS = new Set(["announce"]);

const TITLE_MAX = 50;
const CONTENT_MAX = 5000;
const REPLY_MAX = 2000;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function badRequest(message: string) {
  return NextResponse.json({ success: false, error: message }, { status: 400 });
}

function bodyToken(body: any): string | undefined {
  const t = body?.authToken ?? body?.token;
  return typeof t === "string" ? t : undefined;
}

// 批量取用户实时中文名（author_id -> display_name），保证改名后老帖同步
async function buildAuthorNameMap(supabase: Awaited<ReturnType<typeof getSupabaseClient>>, ids: any[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const uniq = Array.from(new Set((ids || []).filter((x): x is string => typeof x === "string")));
  if (uniq.length === 0) return map;
  const { data } = await supabase
    .from("users")
    .select("id, display_name")
    .in("id", uniq);
  (data || []).forEach((u: any) => {
    if (u && u.id && u.display_name) map.set(u.id, String(u.display_name));
  });
  return map;
}

// 批量取用户公开信息（头像/中文名），用于帖子卡片与头像渲染
async function buildUserInfoMap(
  supabase: Awaited<ReturnType<typeof getSupabaseClient>>,
  ids: any[]
): Promise<Map<string, { name: string; avatar: string }>> {
  const map = new Map<string, { name: string; avatar: string }>();
  const uniq = Array.from(new Set((ids || []).filter((x): x is string => typeof x === "string")));
  if (uniq.length === 0) return map;
  const { data } = await supabase
    .from("users")
    .select("id, display_name, avatar_url")
    .in("id", uniq);
  (data || []).forEach((u: any) => {
    if (u && u.id) map.set(u.id, { name: u.display_name || "", avatar: u.avatar_url || "" });
  });
  return map;
}

// 生成一条论坛通知；自己对自己的操作不通知
async function createNotification(
  supabase: Awaited<ReturnType<typeof getSupabaseClient>>,
  n: { userId: string; actorId: string; type: string; postId: string; replyId?: string | null; content?: string | null }
) {
  if (!n.userId || !n.actorId || n.userId === n.actorId) return;
  try {
    await supabase.from("forum_notifications").insert({
      user_id: n.userId,
      actor_id: n.actorId,
      type: n.type,
      post_id: n.postId || null,
      reply_id: n.replyId || null,
      content: n.content ? String(n.content).slice(0, 100) : null,
      is_read: false,
      created_at: new Date().toISOString(),
    });
  } catch (e) {
    // 通知失败不影响主流程（如表尚未创建）
    console.error("createNotification failed:", e);
  }
}

function requireForumAuth(body: any): Promise<VerifiedUser> {
  return requireAuth(bodyToken(body));
}

async function requireForumPermission(body: any, permission: AdminPermission): Promise<VerifiedUser> {
  const user = await requireAdmin(bodyToken(body));
  if (!hasPermission(user, permission)) {
    throw new Error(`缺少权限：${permission}`);
  }
  return user;
}

function checkBanForForum(user: VerifiedUser): NextResponse | null {
  const banStatus = user.banStatus;
  const banUntil = user.banUntil;
  if (banStatus === "temp_banned" && banUntil) {
    const until = new Date(banUntil);
    if (new Date() >= until) {
      return null;
    }
  }
  if (banStatus === "perma_banned" || banStatus === "temp_banned") {
    return NextResponse.json(
      { success: false, error: "账号已被封禁，无法操作" },
      { status: 403 }
    );
  }
  if (banStatus === "muted") {
    return NextResponse.json(
      { success: false, error: "账号已被禁言" },
      { status: 403 }
    );
  }
  if (banStatus === "restricted") {
    return NextResponse.json(
      { success: false, error: "账号功能受限" },
      { status: 403 }
    );
  }
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    const body = await request.json();
    const { action } = body;

    // 写操作限流：发帖/回复/点赞/收藏/管理操作每分钟10次
    if (action && !["list", "detail", "unread_count", "follow_counts", "follow_list"].includes(action as string)) {
      const limit = rateLimit(request, `forum:${action as string}`, 10, 60);
      if (!limit.allowed) {
        return NextResponse.json(
          { success: false, error: "请求过于频繁，请稍后再试" },
          { status: 429, headers: { "X-RateLimit-Reset": String(limit.resetAt) } }
        );
      }
    }

    if (action === "list") {
      const { section, search, feed } = body;
      let query = supabase
        .from("forum_posts")
        .select("*, forum_replies(count), forum_likes(count), forum_favorites(count)")
        .is("deleted_at", null)
        .order("is_pinned", { ascending: false })
        .order("created_at", { ascending: false });
      // 关注动态：只看自己关注的人发的帖
      if (feed === "following") {
        const me = await requireForumAuth(body);
        const { data: follows } = await supabase
          .from("forum_follows")
          .select("following_id")
          .eq("follower_id", me.userId);
        const ids = (follows || []).map((x: any) => x.following_id).filter(Boolean);
        if (ids.length === 0) {
          return NextResponse.json({ success: true, data: [] });
        }
        query = query.in("author_id", ids);
      }
      if (section && section !== "all") {
        query = query.eq("section", section);
      }
      if (search && typeof search === "string") {
        const kw = search.replace(/[%,()]/g, " ").trim().slice(0, 50);
        if (kw) {
          query = query.or(`title.ilike.%${kw}%,content.ilike.%${kw}%`);
        }
      }
      const { data, error } = await query;
      if (error) throw error;
      const infoMap = await buildUserInfoMap(supabase, (data || []).map((x) => x.author_id));
      const posts = (data || []).map((p) => {
        const info = p.author_id ? infoMap.get(p.author_id) : null;
        return {
          ...p,
          author_name: info?.name || p.author_name,
          author_avatar: info?.avatar || "",
          replyCount: p.forum_replies?.[0]?.count ?? 0,
          likes: p.forum_likes?.[0]?.count ?? 0,
          favorites: p.forum_favorites?.[0]?.count ?? 0,
        };
      });
      return NextResponse.json({ success: true, data: posts });
    }

    if (action === "detail") {
      const { postId } = body;
      if (typeof postId !== "string" || !UUID_RE.test(postId)) {
        return badRequest("帖子ID无效");
      }
      const { data: post, error } = await supabase
        .from("forum_posts")
        .select("*, forum_replies(*), forum_likes(count), forum_favorites(count)")
        .order("created_at", { foreignTable: "forum_replies" })
        .is("deleted_at", null)
        .eq("id", postId)
        .single();
      if (error || !post) {
        return NextResponse.json(
          { success: false, error: "帖子不存在" },
          { status: 404 }
        );
      }
      // 统一回复详情字段名，避免前端读错；附带计数
      const rawReplies: any[] = Array.isArray(post.forum_replies) ? post.forum_replies : [];
      const im = await buildUserInfoMap(supabase, [post.author_id, ...rawReplies.map((r) => r.author_id)]);
      const replies = rawReplies.map((r) => {
        const ri = r.author_id ? im.get(r.author_id) : null;
        return {
          ...r,
          author_name: ri?.name || r.author_name,
          author_avatar: ri?.avatar || "",
        };
      });
      const postInfo = post.author_id ? im.get(post.author_id) : null;
      const data = {
        ...post,
        author_name: postInfo?.name || post.author_name,
        author_avatar: postInfo?.avatar || "",
        forum_replies: replies,
        forum_replies_detail: replies,
        replyCount: replies.length,
        likes: post.forum_likes?.[0]?.count ?? 0,
        favorites: post.forum_favorites?.[0]?.count ?? 0,
      };
      return NextResponse.json({ success: true, data });
    }

    if (action === "create") {
      const user = await requireForumAuth(body);
      const banCheck = checkBanForForum(user);
      if (banCheck) return banCheck;
      const { title, content, section } = body;

      if (typeof title !== "string" || typeof content !== "string") {
        return badRequest("标题和内容不能为空");
      }
      const cleanTitle = title.trim();
      const cleanContent = content.trim();
      if (!cleanTitle || !cleanContent) {
        return badRequest("标题和内容不能为空");
      }
      if (cleanTitle.length > TITLE_MAX || cleanContent.length > CONTENT_MAX) {
        return badRequest(`标题不超过${TITLE_MAX}字、内容不超过${CONTENT_MAX}字`);
      }

      const sectionId = typeof section === "string" ? section : "general";
      // 公告板块仅管理员可发；非法板块一律拒绝（防止幽灵帖/冒名板块）
      if (ADMIN_ONLY_SECTIONS.has(sectionId)) {
        await requireForumPermission(body, "forum_manage");
      }
      // 自定义板块尚未数据库化，这里只放行内置白名单；forum_sections 上线后合并校验
      if (!BUILTIN_SECTIONS.has(sectionId)) {
        return badRequest("板块不存在或已关闭");
      }

      const insert: Record<string, unknown> = {
        title: cleanTitle,
        content: cleanContent,
        section: sectionId,
        author_id: user.userId,
        author_name: user.username,
        is_pinned: sectionId === "announce", // 官方公告创建即置顶
        bug_status: sectionId === "bug-report" ? "pending" : null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const { data, error } = await supabase
        .from("forum_posts")
        .insert(insert)
        .select()
        .single();
      if (error) throw error;
      return NextResponse.json({ success: true, data });
    }

    if (action === "reply") {
      const user = await requireForumAuth(body);
      const banCheck = checkBanForForum(user);
      if (banCheck) return banCheck;
      const { postId, content, parentReplyId } = body;

      if (typeof postId !== "string" || !UUID_RE.test(postId)) {
        return badRequest("帖子ID无效");
      }
      if (typeof content !== "string") {
        return badRequest("回复内容不能为空");
      }
      const cleanContent = content.trim();
      if (!cleanContent) {
        return badRequest("回复内容不能为空");
      }
      if (cleanContent.length > REPLY_MAX) {
        return badRequest(`回复不超过${REPLY_MAX}字`);
      }

      // 确认帖子存在且未删除
      const { data: post, error: postErr } = await supabase
        .from("forum_posts")
        .select("id, replies, author_id")
        .is("deleted_at", null)
        .eq("id", postId)
        .maybeSingle();
      if (postErr) throw postErr;
      if (!post) return NextResponse.json({ success: false, error: "帖子不存在" }, { status: 404 });

      // 楼中楼父回复必须存在且属于同一帖，杜绝跨帖孤儿回复
      let parentId: string | null = null;
      if (parentReplyId !== undefined && parentReplyId !== null && parentReplyId !== "") {
        if (typeof parentReplyId !== "string" || !UUID_RE.test(parentReplyId)) {
          return badRequest("父回复ID无效");
        }
        const { data: parent, error: parentErr } = await supabase
          .from("forum_replies")
          .select("id, post_id")
          .eq("id", parentReplyId)
          .maybeSingle();
        if (parentErr) throw parentErr;
        if (!parent || parent.post_id !== postId) {
          return badRequest("父回复不存在或不属于该帖");
        }
        parentId = parentReplyId;
      }

      const { data, error } = await supabase
        .from("forum_replies")
        .insert({
          post_id: postId,
          author_id: user.userId,
          author_name: user.username,
          content: cleanContent,
          is_admin: user.isAdmin === true,
          parent_reply_id: parentId,
          created_at: new Date().toISOString(),
        })
        .select()
        .single();
      if (error) throw error;

      // 通知楼主（新回复）
      await createNotification(supabase, {
        userId: (post as any).author_id,
        actorId: user.userId,
        type: parentId ? "reply" : "reply",
        postId,
        replyId: (data as any).id,
        content: cleanContent,
      });
      // 楼中楼：额外通知被回复的那层作者
      if (parentId) {
        const { data: pr } = await supabase
          .from("forum_replies")
          .select("author_id")
          .eq("id", parentId)
          .maybeSingle();
        if (pr?.author_id) {
          await createNotification(supabase, {
            userId: pr.author_id,
            actorId: user.userId,
            type: "sub_reply",
            postId,
            replyId: (data as any).id,
            content: cleanContent,
          });
        }
      }

      // 按真实回复行数回写冗余计数（含楼中楼），失败不影响回复本身
      const { count: realCount } = await supabase
        .from("forum_replies")
        .select("id", { count: "exact", head: true })
        .eq("post_id", postId);
      if (typeof realCount === "number") {
        await supabase
          .from("forum_posts")
          .update({ replies: realCount, updated_at: new Date().toISOString() })
          .eq("id", postId);
      }

      return NextResponse.json({ success: true, data });
    }

    if (action === "like") {
      const user = await requireForumAuth(body);
      const banCheck = checkBanForForum(user);
      if (banCheck) return banCheck;
      const { postId } = body;
      const { data: existing } = await supabase
        .from("forum_likes")
        .select("id")
        .eq("post_id", postId)
        .eq("user_id", user.userId)
        .maybeSingle();
      if (existing) {
        await supabase.from("forum_likes").delete().eq("id", existing.id);
        return NextResponse.json({ success: true, data: { liked: false } });
      }
      await supabase.from("forum_likes").insert({
        post_id: postId,
        user_id: user.userId,
        created_at: new Date().toISOString(),
      });
      const { data: lp } = await supabase
        .from("forum_posts")
        .select("author_id")
        .eq("id", postId)
        .maybeSingle();
      if (lp?.author_id) {
        await createNotification(supabase, {
          userId: lp.author_id,
          actorId: user.userId,
          type: "like",
          postId,
        });
      }
      return NextResponse.json({ success: true, data: { liked: true } });
    }

    if (action === "favorite") {
      const user = await requireForumAuth(body);
      const banCheck = checkBanForForum(user);
      if (banCheck) return banCheck;
      const { postId } = body;
      const { data: existing } = await supabase
        .from("forum_favorites")
        .select("id")
        .eq("post_id", postId)
        .eq("user_id", user.userId)
        .maybeSingle();
      if (existing) {
        await supabase.from("forum_favorites").delete().eq("id", existing.id);
        return NextResponse.json({ success: true, data: { favorited: false } });
      }
      await supabase.from("forum_favorites").insert({
        post_id: postId,
        user_id: user.userId,
        created_at: new Date().toISOString(),
      });
      const { data: fp2 } = await supabase
        .from("forum_posts")
        .select("author_id")
        .eq("id", postId)
        .maybeSingle();
      if (fp2?.author_id) {
        await createNotification(supabase, {
          userId: fp2.author_id,
          actorId: user.userId,
          type: "favorite",
          postId,
        });
      }
      return NextResponse.json({ success: true, data: { favorited: true } });
    }

    if (action === "my_favorites") {
      const user = await requireForumAuth(body);
      const { data, error } = await supabase
        .from("forum_favorites")
        .select("post_id, forum_posts(*)")
        .eq("user_id", user.userId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const posts = (data || []).map((f) => f.forum_posts);
      return NextResponse.json({ success: true, data: posts });
    }

    if (action === "admin_pin" || action === "admin_essence") {
      const adminUser = await requireForumPermission(body, "forum_manage");
      const { postId, value } = body;
      const field = action === "admin_pin" ? "is_pinned" : "is_essence";
      const { data, error } = await supabase
        .from("forum_posts")
        .update({ [field]: value })
        .eq("id", postId)
        .select()
        .single();
      if (error) throw error;
      await logAudit(adminUser.id, adminUser.username, action, "forum_post", postId, { field, value });
      return NextResponse.json({ success: true, data });
    }

    if (action === "admin_delete") {
      const adminUser = await requireForumPermission(body, "forum_manage");
      const { postId } = body;
      if (typeof postId !== "string" || !UUID_RE.test(postId)) {
        return badRequest("帖子ID无效");
      }
      // 软删：保留数据可审计，list/detail 通过 deleted_at 过滤
      const { error } = await supabase
        .from("forum_posts")
        .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .is("deleted_at", null)
        .eq("id", postId);
      if (error) throw error;
      await logAudit(adminUser.id, adminUser.username, action, "forum_post", postId);
      return NextResponse.json({ success: true });
    }

    if (action === "admin_update_bug_status") {
      const adminUser = await requireForumPermission(body, "forum_manage");
      const { postId, value } = body;
      const bugStatus = value;
      const { data, error } = await supabase
        .from("forum_posts")
        .update({ bug_status: bugStatus })
        .eq("id", postId)
        .select()
        .single();
      if (error) throw error;
      await logAudit(adminUser.id, adminUser.username, action, "forum_post", postId, { bug_status: bugStatus });
      return NextResponse.json({ success: true, data });
    }

    // ========== 查看用户公开主页资料 ==========
    if (action === "user_profile") {
      const { username } = body;
      if (typeof username !== "string" || !username.trim()) {
        return badRequest("缺少用户名");
      }
      const { data: u, error } = await supabase
        .from("users")
        .select("id, username, display_name, avatar_url, user_bio, created_at")
        .eq("username", username.trim())
        .not("status", "eq", "deactivated")
        .maybeSingle();
      if (error) throw error;
      if (!u) {
        return NextResponse.json({ success: false, error: "用户不存在" }, { status: 404 });
      }
      return NextResponse.json({
        success: true,
        data: {
          id: u.id,
          username: u.username,
          displayName: u.display_name || u.username,
          avatarUrl: u.avatar_url || "",
          bio: u.user_bio || "",
          joinedAt: u.created_at || "",
        },
      });
    }

    // 组装帖子卡片（含实时头像、计数），供主页各 tab 使用
    async function decoratePostCards(rows: any[]) {
      const im = await buildUserInfoMap(supabase, rows.map((x) => x.author_id));
      return rows.map((p) => {
        const info = p.author_id ? im.get(p.author_id) : null;
        return {
          ...p,
          author_name: info?.name || p.author_name,
          author_avatar: info?.avatar || "",
          replyCount: p.replies ?? 0,
          likes: p.likes_count ?? 0,
          favorites: p.favorites_count ?? 0,
        };
      });
    }

    // ========== 某用户发布的帖子 ==========
    if (action === "user_posts") {
      const { userId } = body;
      if (typeof userId !== "string" || !UUID_RE.test(userId)) return badRequest("用户ID无效");
      const { data, error } = await supabase
        .from("forum_posts")
        .select("*, forum_likes(count), forum_favorites(count)")
        .eq("author_id", userId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const rows = (data || []).map((p) => ({
        ...p,
        likes_count: p.forum_likes?.[0]?.count ?? 0,
        favorites_count: p.forum_favorites?.[0]?.count ?? 0,
      }));
      return NextResponse.json({ success: true, data: await decoratePostCards(rows) });
    }

    // ========== 某用户点赞的帖子 ==========
    if (action === "user_likes") {
      const viewer = await requireForumAuth(body);
      const { userId } = body;
      if (typeof userId !== "string" || !UUID_RE.test(userId)) return badRequest("用户ID无效");
      if (userId !== viewer.userId) return badRequest("只能查看自己的点赞");
      const { data, error } = await supabase
        .from("forum_likes")
        .select("created_at, forum_posts(*, forum_likes(count), forum_favorites(count))")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const rows = (data || [])
        .map((x: any) => x.forum_posts)
        .filter((p: any) => p && !p.deleted_at)
        .map((p: any) => ({
          ...p,
          likes_count: p.forum_likes?.[0]?.count ?? 0,
          favorites_count: p.forum_favorites?.[0]?.count ?? 0,
        }));
      return NextResponse.json({ success: true, data: await decoratePostCards(rows) });
    }

    // ========== 某用户收藏的帖子 ==========
    if (action === "user_favorites") {
      const viewer = await requireForumAuth(body);
      const { userId } = body;
      if (typeof userId !== "string" || !UUID_RE.test(userId)) return badRequest("用户ID无效");
      if (userId !== viewer.userId) return badRequest("只能查看自己的收藏");
      const { data, error } = await supabase
        .from("forum_favorites")
        .select("created_at, forum_posts(*, forum_likes(count), forum_favorites(count))")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const rows = (data || [])
        .map((x: any) => x.forum_posts)
        .filter((p: any) => p && !p.deleted_at)
        .map((p: any) => ({
          ...p,
          likes_count: p.forum_likes?.[0]?.count ?? 0,
          favorites_count: p.forum_favorites?.[0]?.count ?? 0,
        }));
      return NextResponse.json({ success: true, data: await decoratePostCards(rows) });
    }

    // ========== 通知：未读数 ==========
    if (action === "unread_count") {
      const user = await requireForumAuth(body);
      const { count } = await supabase
        .from("forum_notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.userId)
        .eq("is_read", false);
      return NextResponse.json({ success: true, data: { count: count || 0 } });
    }

    // ========== 通知：列表 ==========
    if (action === "notifications") {
      const user = await requireForumAuth(body);
      const { data, error } = await supabase
        .from("forum_notifications")
        .select("*")
        .eq("user_id", user.userId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      // 手动带上操作者名字/头像与帖子标题，避免 PostgREST 嵌层对 FK 的依赖
      const actorIds = Array.from(new Set((data || []).map((x) => x.actor_id).filter(Boolean)));
      const postIds = Array.from(new Set((data || []).map((x) => x.post_id).filter(Boolean)));
      const im = await buildUserInfoMap(supabase, actorIds);
      const { data: actorUsers } = await supabase
        .from("users")
        .select("id, username")
        .in("id", actorIds);
      const actorNameMap = new Map<string, string>((actorUsers || []).map((u) => [u.id, u.username]));
      const { data: postsData } = await supabase
        .from("forum_posts")
        .select("id, title, deleted_at")
        .in("id", postIds);
      const postMap = new Map<string, any>((postsData || []).map((x) => [x.id, x]));
      const list = (data || []).map((n) => {
        const ai = n.actor_id ? im.get(n.actor_id) : null;
        const pt = postMap.get(n.post_id);
        return {
          ...n,
          actor_name: ai?.name || "用户",
          actor_avatar: ai?.avatar || "",
          actor_username: n.actor_id ? actorNameMap.get(n.actor_id) || "" : "",
          post_title: pt?.title || "（帖子已删除）",
          post_deleted: !!pt?.deleted_at,
        };
      });
      return NextResponse.json({ success: true, data: list });
    }

    // ========== 通知：标记已读 ==========
    if (action === "mark_notification_read") {
      const user = await requireForumAuth(body);
      const { notificationId } = body;
      if (typeof notificationId !== "string") return badRequest("缺少通知ID");
      await supabase
        .from("forum_notifications")
        .update({ is_read: true })
        .eq("id", notificationId)
        .eq("user_id", user.userId);
      return NextResponse.json({ success: true });
    }

    // ========== 通知：全部已读 ==========
    if (action === "mark_all_notifications_read") {
      const user = await requireForumAuth(body);
      await supabase
        .from("forum_notifications")
        .update({ is_read: true })
        .eq("user_id", user.userId)
        .eq("is_read", false);
      return NextResponse.json({ success: true });
    }

    // ========== 关注 / 取消关注 ==========
    if (action === "follow") {
      const me = await requireForumAuth(body);
      const { userId } = body;
      if (typeof userId !== "string" || !UUID_RE.test(userId)) return badRequest("用户ID无效");
      if (userId === me.userId) return badRequest("不能关注自己");
      const { data: target, error: te } = await supabase
        .from("users")
        .select("id, status")
        .eq("id", userId)
        .maybeSingle();
      if (te) throw te;
      if (!target) return NextResponse.json({ success: false, error: "用户不存在" }, { status: 404 });
      if (target.status === "deactivated") return NextResponse.json({ success: false, error: "用户不存在" }, { status: 404 });

      const { data: existing } = await supabase
        .from("forum_follows")
        .select("id")
        .eq("follower_id", me.userId)
        .eq("following_id", userId)
        .maybeSingle();
      if (existing) {
        await supabase.from("forum_follows").delete().eq("id", existing.id);
        return NextResponse.json({ success: true, data: { following: false } });
      }
      await supabase.from("forum_follows").insert({
        follower_id: me.userId,
        following_id: userId,
        created_at: new Date().toISOString(),
      });
      await createNotification(supabase, {
        userId,
        actorId: me.userId,
        type: "follow",
        postId: "",
      });
      return NextResponse.json({ success: true, data: { following: true } });
    }

    // ========== 关注数 / 粉丝数 ==========
    if (action === "follow_counts") {
      const { userId } = body;
      if (typeof userId !== "string" || !UUID_RE.test(userId)) return badRequest("用户ID无效");
      const [{ count: following }, { count: followers }] = await Promise.all([
        supabase
          .from("forum_follows")
          .select("id", { count: "exact", head: true })
          .eq("follower_id", userId),
        supabase
          .from("forum_follows")
          .select("id", { count: "exact", head: true })
          .eq("following_id", userId),
      ]);
      // 附带当前查看者是否已关注（未登录/本人时为 false）
      let isFollowing = false;
      try {
        const viewer = await requireForumAuth(body);
        if (viewer.userId !== userId) {
          const { data } = await supabase
            .from("forum_follows")
            .select("id")
            .eq("follower_id", viewer.userId)
            .eq("following_id", userId)
            .maybeSingle();
          isFollowing = !!data;
        }
      } catch {
        isFollowing = false;
      }
      return NextResponse.json({
        success: true,
        data: { following: following || 0, followers: followers || 0, isFollowing },
      });
    }

    // ========== 关注列表 / 粉丝列表 ==========
    if (action === "follow_list") {
      const { userId, type: listType } = body;
      if (typeof userId !== "string" || !UUID_RE.test(userId)) return badRequest("用户ID无效");
      if (listType !== "following" && listType !== "followers") return badRequest("列表类型无效");
      const col = listType === "following" ? "follower_id" : "following_id";
      const otherTable = listType === "following" ? "following" : "follower";
      const { data, error } = await supabase
        .from("forum_follows")
        .select(`created_at, ${otherTable}:users!forum_follows_${listType === "following" ? "following" : "follower"}_id_fkey(id, username, display_name, avatar_url, user_bio, status)`)
        .eq(col, userId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const rows = (data || [])
        .map((x: any) => x[otherTable])
        .filter((u: any) => u && u.status !== "deactivated")
        .map((u: any) => ({
          id: u.id,
          username: u.username,
          displayName: u.display_name || u.username,
          avatarUrl: u.avatar_url || "",
          bio: u.user_bio || "",
        }));
      return NextResponse.json({ success: true, data: rows });
    }

    return NextResponse.json(
      { success: false, error: "未知 action" },
      { status: 400 }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "服务器内部错误";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
