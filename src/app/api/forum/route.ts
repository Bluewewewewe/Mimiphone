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
    if (action && !["list", "detail"].includes(action as string)) {
      const limit = rateLimit(request, `forum:${action as string}`, 10, 60);
      if (!limit.allowed) {
        return NextResponse.json(
          { success: false, error: "请求过于频繁，请稍后再试" },
          { status: 429, headers: { "X-RateLimit-Reset": String(limit.resetAt) } }
        );
      }
    }

    if (action === "list") {
      const { section, search } = body;
      let query = supabase
        .from("forum_posts")
        .select("*, forum_replies(count), forum_likes(count), forum_favorites(count)")
        .is("deleted_at", null)
        .order("is_pinned", { ascending: false })
        .order("created_at", { ascending: false });
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
      const posts = (data || []).map((p) => ({
        ...p,
        replyCount: p.forum_replies?.[0]?.count ?? 0,
        likes: p.forum_likes?.[0]?.count ?? 0,
        favorites: p.forum_favorites?.[0]?.count ?? 0,
      }));
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
      const replies = Array.isArray(post.forum_replies) ? post.forum_replies : [];
      const data = {
        ...post,
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
        .select("id, replies")
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
