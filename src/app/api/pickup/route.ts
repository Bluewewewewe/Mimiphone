import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import {
  requireAuth,
  requireAdmin,
  verifyToken,
  hasPermission,
  hasPermissionDb,
  type VerifiedUser,
  type AdminPermission,
} from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";

const TITLE_MAX = 50;
const CONTENT_MAX = 20000;
const REPLY_MAX = 2000;
const PER_PAGE = 20;

function badRequest(message: string) {
  return NextResponse.json({ success: false, error: message }, { status: 400 });
}

function bodyToken(body: any): string | undefined {
  return typeof body?.token === "string" ? body.token : undefined;
}

async function requirePickupAuth(body: any): Promise<VerifiedUser> {
  return requireAuth(bodyToken(body));
}

async function requirePickupAdmin(body: any): Promise<VerifiedUser> {
  const user = await requireAdmin(bodyToken(body));
  const allowed = await hasPermissionDb(user, "pickup_manage");
  if (!allowed) {
    throw new Error("缺少权限：pickup_manage");
  }
  return user;
}

function checkBan(user: VerifiedUser): NextResponse | null {
  const { banStatus, banUntil } = user;
  if (banStatus === "temp_banned" && banUntil) {
    if (new Date() >= new Date(banUntil)) return null;
  }
  if (banStatus === "perma_banned" || banStatus === "temp_banned") {
    return NextResponse.json({ success: false, error: "账号已被封禁" }, { status: 403 });
  }
  if (banStatus === "muted") {
    return NextResponse.json({ success: false, error: "账号已被禁言" }, { status: 403 });
  }
  if (banStatus === "restricted") {
    return NextResponse.json({ success: false, error: "账号功能受限" }, { status: 403 });
  }
  return null;
}


async function buildUserInfoMap(
  supabase: Awaited<ReturnType<typeof getSupabaseClient>>,
  ids: any[]
): Promise<Map<string, { name: string; avatar: string; username: string }>> {
  const map = new Map<string, { name: string; avatar: string; username: string }>();
  const uniq = Array.from(new Set((ids || []).filter((x): x is string => typeof x === "string")));
  if (uniq.length === 0) return map;
  const { data } = await supabase
    .from("users")
    .select("id, username, display_name, avatar_url")
    .in("id", uniq);
  (data || []).forEach((u: any) => {
    if (u && u.id) map.set(u.id, { name: u.display_name || u.username || "", avatar: u.avatar_url || "", username: u.username || "" });
  });
  return map;
}


// ============================================================
// 通知埋点（表不存在时静默失败）
// ============================================================
async function insertNotification(params: {
  userId: string;
  type: string;
  title: string;
  content?: string;
  relatedPostId?: string;
  relatedReplyId?: string;
  extra?: any;
}) {
  try {
    const supabase = await getSupabaseClient();
    await supabase.from("notifications").insert({
      user_id: params.userId,
      type: params.type,
      title: params.title,
      content: params.content || "",
      related_post_id: params.relatedPostId || null,
      related_reply_id: params.relatedReplyId || null,
      extra: params.extra || {},
    });
  } catch (e) {
    console.error("[pickup] insertNotification failed", e);
    // 不抛错，避免影响主流程
  }
}

// ============================================================
// GET
// ============================================================
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const action = url.searchParams.get("action") || "list";
  const supabase = await getSupabaseClient();

  // 同时支持 Authorization header 和 query token
  const headerToken = request.headers.get("authorization")?.startsWith("Bearer ")
    ? request.headers.get("authorization")!.slice(7)
    : null;
  const queryToken = url.searchParams.get("token");
  const getToken = headerToken || queryToken;

  try {
    switch (action) {
      case "list": {
        const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
        const sort = url.searchParams.get("sort") || "newest";
        const tagId = url.searchParams.get("tag");
        const keyword = url.searchParams.get("keyword");
        const from = (page - 1) * PER_PAGE;

        let q = supabase
          .from("pickup_posts")
          .select("*, pickup_tags(id, name)", { count: "exact" })
          .eq("status", "active");

        if (tagId) q = q.contains("tag_ids", [tagId]);
        if (keyword) q = q.ilike("title", `%${keyword}%`);

        if (sort === "heat") {
          // 热度 = 回复数*2 + 点赞数，再用 created_at 兜底
          q = q.order("replies_count", { ascending: false });
          q = q.order("likes_count", { ascending: false });
        }
        q = q.order("created_at", { ascending: false });

        const { data, error, count } = await q
          .range(from, from + PER_PAGE - 1);

        if (error) throw error;
        return NextResponse.json({ success: true, posts: data || [], total: count || 0, page });
      }

      case "get": {
        const postId = url.searchParams.get("postId");
        if (!postId) return badRequest("缺少 postId");
        const { data: found, error } = await supabase
          .from("pickup_posts")
          .select("*, pickup_tags(id, name)")
          .eq("id", postId)
          .single();
        if (error || !found) return NextResponse.json({ success: false, error: "帖子不存在" }, { status: 404 });
        // pending 帖只有楼主本人能看
        if (found.status !== "active") {
          let viewerId: string | null = null;
          if (getToken) {
            try { const vu = await verifyToken(getToken); viewerId = vu?.id || null; } catch { /* */ }
          }
          if (viewerId !== found.owner_id) {
            return NextResponse.json({ success: false, error: "帖子不存在" }, { status: 404 });
          }
        }
        return NextResponse.json({ success: true, post: found });
      }

      case "replies": {
        const postId = url.searchParams.get("postId");
        if (!postId) return badRequest("缺少 postId");
        const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
        const sort = url.searchParams.get("sort") || "floor";
        const from = (page - 1) * PER_PAGE;

        let q = supabase.from("pickup_replies").select("*").eq("post_id", postId).eq("status", "active");

        if (sort === "heat") {
          q = q.order("likes_count", { ascending: false });
        } else if (sort === "floor_desc") {
          q = q.order("floor_no", { ascending: false });
        } else {
          q = q.order("floor_no", { ascending: true });
        }

        const { data, error, count } = await q.range(from, from + PER_PAGE - 1);
        if (error) throw error;
        return NextResponse.json({ success: true, replies: data || [], total: count || 0, page });
      }

      case "sub_replies": {
        const replyId = url.searchParams.get("replyId");
        if (!replyId) return badRequest("缺少 replyId");
        const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
        const from = (page - 1) * PER_PAGE;

        const { data, error, count } = await supabase
          .from("pickup_sub_replies")
          .select("*")
          .eq("reply_id", replyId)
          .eq("status", "active")
          .order("is_host_reply", { ascending: false })
          .order("sort_index", { ascending: true })
          .range(from, from + PER_PAGE - 1);

        if (error) throw error;
        return NextResponse.json({ success: true, subReplies: data || [], total: count || 0, page });
      }

      case "tags": {
        // 已登录用户：可见「已审核标签」+「自己创建的未审核标签」；被合并的不返回
        let currentUserId: string | null = null;
        if (getToken) {
          try {
            const meUser = await verifyToken(getToken);
            if (meUser) currentUserId = meUser.id;
          } catch { /* ignore */ }
        }
        const query = url.searchParams.get("q");

        if (query) {
          const { data, error } = await supabase
            .from("pickup_tags")
            .select("*")
            .ilike("name", `%${query}%`)
            .is("merged_into", null)
            .order("use_count", { ascending: false })
            .limit(30);
          if (error) throw error;
          const visible = (data || []).filter((t: any) =>
            t.approved || (currentUserId && t.creator_id === currentUserId)
          );
          return NextResponse.json({ success: true, tags: visible });
        }

        const { data, error } = await supabase
          .from("pickup_tags")
          .select("*")
          .is("merged_into", null)
          .order("approved", { ascending: false })
          .order("use_count", { ascending: false })
          .limit(50);
        if (error) throw error;
        const visibleAll = (data || []).filter((t: any) =>
          t.approved || (currentUserId && t.creator_id === currentUserId)
        );
        return NextResponse.json({ success: true, tags: visibleAll });
      }

      case "identity": {
        const postId = url.searchParams.get("postId");
        if (!postId) return badRequest("缺少 postId");
        const user = await requirePickupAuth({ token: getToken });
        const { data, error } = await supabase
          .from("pickup_identities")
          .select("*")
          .eq("user_id", user.id)
          .eq("post_id", postId)
          .single();
        if (error && error.code === "PGRST116") {
          return NextResponse.json({ success: true, identity: null });
        }
        if (error) throw error;
        return NextResponse.json({ success: true, identity: data });
      }

      case "my_posts": {
        // 查用户帖子是公开操作，不强制登录
        // 只有没传 username 时才回退到"查自己"（此时需要 token）
        const targetUsername = url.searchParams.get("username");
        let ownerId: string | null = null;
        if (targetUsername) {
          const { data: targetUser } = await supabase
            .from("users")
            .select("id")
            .eq("username", targetUsername)
            .single();
          if (!targetUser) return badRequest("用户不存在");
          ownerId = targetUser.id;
        } else {
          const reqUser = await requirePickupAuth({ token: getToken });
          ownerId = reqUser.id;
        }
        const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
        const pageSize = Math.min(50, parseInt(url.searchParams.get("pageSize") || "20", 10));
        const from = (page - 1) * pageSize;

        // 判断查看者是否为楼主本人
        let viewerIsOwner = false;
        if (getToken) {
          try {
            const vu = await verifyToken(getToken);
            if (vu && vu.id === ownerId) viewerIsOwner = true;
          } catch { /* */ }
        }

        let mpq = supabase
          .from("pickup_posts")
          .select("*", { count: "exact" })
          .eq("owner_id", ownerId);
        if (viewerIsOwner) {
          mpq = mpq.in("status", ["active", "pending"]);
        } else {
          mpq = mpq.eq("status", "active");
        }
        mpq = mpq.order("created_at", { ascending: false }).range(from, from + pageSize - 1);
        const { data, error, count } = await mpq;
        if (error) throw error;
        // 映射为前端 PickupPost 结构
        const mapped = (data || []).map((row: any) => ({
          ...row,
          id: row.id,
          title: row.title,
          content: row.content,
          author_id: row.owner_id,
          author_username: row.owner_username,
          tags: row.tag_ids || [],
          is_pinned: !!row.is_pinned,
          is_locked: !!row.is_locked,
          likes_count: row.likes_count || 0,
          replies_count: row.replies_count || 0,
          views_count: row.views_count || 0,
        }));
        return NextResponse.json({
          success: true,
          data: mapped,
          posts: mapped,
          total: count || 0,
          page,
          pageSize,
        });
      }

      case "admin_reports": {
        await requirePickupAdmin({ token: getToken });
        const status = url.searchParams.get("status") || "pending";
        const target = url.searchParams.get("target");
        const { data, error } = await supabase
          .from("pickup_reports")
          .select("*")
          .eq("status", status)
          .eq("target_type", target || "post")
          .order("created_at", { ascending: false });
        if (error) throw error;
        return NextResponse.json({ success: true, reports: data || [] });
      }

      case "admin_tags_pending": {
        await requirePickupAdmin({ token: getToken });
        const { data, error } = await supabase
          .from("pickup_tags")
          .select("*")
          .eq("approved", false)
          .is("merged_into", null)
          .order("created_at", { ascending: false });
        if (error) throw error;
        return NextResponse.json({ success: true, tags: data || [] });
      }

      case "admin_tags_all": {
        await requirePickupAdmin({ token: getToken });
        const { data, error } = await supabase
          .from("pickup_tags")
          .select("*")
          .is("merged_into", null)
          .order("approved", { ascending: true })
          .order("created_at", { ascending: false });
        if (error) throw error;
        return NextResponse.json({ success: true, tags: data || [] });
      }

      case "admin_pending_posts": {
        const adminUser = await requirePickupAdmin({ token: getToken });
        const scope = url.searchParams.get("scope") || "all"; // all | mine | unassigned
        const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
        const pageSize = Math.min(50, parseInt(url.searchParams.get("pageSize") || "20", 10));
        const from = (page - 1) * pageSize;
        let pq = supabase
          .from("pickup_posts")
          .select("*, pickup_tags(id, name)", { count: "exact" })
          .eq("status", "pending");
        if (scope === "mine") pq = pq.eq("assigned_to", adminUser.id);
        if (scope === "unassigned") pq = pq.is("assigned_to", null);
        const { data, error, count } = await pq
          .order("created_at", { ascending: true })
          .range(from, from + pageSize - 1);
        if (error) throw error;
        const adminIds = (data || []).map((x: any) => x.assigned_to).filter(Boolean);
        let nameMap = new Map();
        if (adminIds.length) {
          const { data: admins } = await supabase
            .from("users").select("id, nickname, username").in("id", adminIds);
          nameMap = new Map((admins || []).map((a: any) => [a.id, a.nickname || a.username]));
        }
        const postsOut = (data || []).map((x: any) => ({
          ...x,
          assigned_to_name: x.assigned_to ? (nameMap.get(x.assigned_to) || null) : null,
        }));
        return NextResponse.json({ success: true, posts: postsOut, total: count || 0, page });
      }

      default:
        return badRequest(`未知 action: ${action}`);
    }
  } catch (e) {
    if (e instanceof Error && e.message.includes("auth")) {
      return NextResponse.json({ success: false, error: e.message }, { status: 401 });
    }
    return NextResponse.json({ success: false, error: (e as Error).message }, { status: 500 });
  }
}

// ============================================================
// POST
// ============================================================
export async function POST(request: NextRequest) {
  const body = await request.json();
  const action = body?.action;
  const supabase = await getSupabaseClient();

  let user: VerifiedUser;
  try {
    user = await requirePickupAuth(body);
  } catch (e) {
    return NextResponse.json({ success: false, error: (e as Error).message }, { status: 401 });
  }
  const banRes = checkBan(user);
  if (banRes) return banRes;

  const limit = rateLimit(request, `pickup:${action || "post"}`, 10, 60);
  if (!limit.allowed) return NextResponse.json({ success: false, error: "操作太快，请稍后再试" }, { status: 429 });

  try {
    switch (action) {
      case "create_post": {
        const title = (body.title || "").toString().trim();
        const content = (body.content || "").toString().trim();
        const tagIds: string[] = body.tagIds || [];
        const identityRequired = body.identityRequired !== false;
        const hostLabel = (body.hostLabel || "").toString().trim().slice(0, 10);

        if (!title || title.length > TITLE_MAX) return badRequest(`标题 1~${TITLE_MAX} 字`);
        if (!content || content.length > CONTENT_MAX) return badRequest(`内容不超过 ${CONTENT_MAX} 字`);

        // 校验标签：允许 ①已审核标签 ②本人创建的未审核/未合并标签
        if (tagIds.length > 0) {
          const { data: foundTags } = await supabase
            .from("pickup_tags")
            .select("id, approved, creator_id, merged_into")
            .in("id", tagIds);
          const list = foundTags || [];
          if (list.length !== tagIds.length) return badRequest("包含不存在的标签");
          for (const t of list) {
            if (t.merged_into) return badRequest("包含已被合并的标签，请改选新标签");
            if (!t.approved && t.creator_id !== user.id) {
              return badRequest("包含他人创建、尚未审核通过的标签");
            }
          }
        }

        // 从 users 表取 display_name
        const userMap = await buildUserInfoMap(supabase, [user.id]);
        const userInfo = userMap.get(user.id) || { name: user.username, avatar: "", username: user.username };

        // 是否需要审核：只要带了未审核标签，帖子进 pending
        let needReview = false;
        if (tagIds.length > 0) {
          const { data: checkTags } = await supabase
            .from("pickup_tags")
            .select("approved")
            .in("id", tagIds);
          needReview = (checkTags || []).some((t: any) => !t.approved);
        }

        const { data, error } = await supabase
          .from("pickup_posts")
          .insert({
            owner_id: user.id,
            owner_username: user.username,
            owner_display: userInfo.name,
            owner_emoji: "",
            title,
            content,
            tag_ids: tagIds,
            identity_required: identityRequired,
            host_label: hostLabel || userInfo.name,
            status: needReview ? "pending" : "active",
          })
          .select()
          .single();

        if (error) throw error;

        // 已审核标签使用数 +1；未审核标签不加（审核通过时再加，避免虚假计数）
        if (!needReview && tagIds.length > 0) {
          for (const id of tagIds) {
            try { await supabase.rpc("pickup_tag_inc", { tag_id: id }); } catch { /* rpc 可能未定义 */ }
          }
        }

        return NextResponse.json({
          success: true,
          post: data,
          pendingReview: needReview,
        });
      }

      case "create_reply": {
        const postId = body.postId;
        const content = (body.content || "").toString().trim();
        const identityName = body.identityName;
        const identityEmoji = body.identityEmoji || "🐰";

        if (!postId) return badRequest("缺少 postId");
        if (!content || content.length > REPLY_MAX) return badRequest(`回复不超过 ${REPLY_MAX} 字`);

        const { data: post } = await supabase
          .from("pickup_posts").select("*").eq("id", postId).single();
        if (!post) return NextResponse.json({ success: false, error: "帖子不存在" }, { status: 404 });
        if (post.status !== "active") return NextResponse.json({ success: false, error: "帖子已下架" }, { status: 404 });

        const userMap = await buildUserInfoMap(supabase, [user.id]);
        const userInfo = userMap.get(user.id) || { name: user.username, avatar: "", username: user.username };
        let displayName = userInfo.name;
        let displayEmoji = identityEmoji;
        const { data: existingIdentity } = await supabase
          .from("pickup_identities")
          .select("*")
          .eq("user_id", user.id)
          .eq("post_id", postId)
          .single();

        if (post.identity_required) {
          if (existingIdentity) {
            displayName = existingIdentity.display_name;
            displayEmoji = existingIdentity.emoji;
          } else {
            if (!identityName || identityName.length < 2) {
              return badRequest("本楼需要演绎身份，请填写角色名（至少2字）");
            }
            const { data: conflict } = await supabase
              .from("pickup_identities")
              .select("id")
              .eq("post_id", postId)
              .eq("display_name", identityName)
              .single();
            if (conflict) return badRequest("角色名已被占用，换一个");

            await supabase.from("pickup_identities").insert({
              user_id: user.id,
              post_id: postId,
              display_name: identityName,
              emoji: displayEmoji,
            });
            displayName = identityName;
          }
        }

        const { count } = await supabase
          .from("pickup_replies").select("*", { count: "exact", head: true })
          .eq("post_id", postId);
        const floorNo = (count || 0) + 1;

        const { data, error } = await supabase
          .from("pickup_replies")
          .insert({
            post_id: postId,
            author_id: user.id,
            author_username: user.username,
            author_display: displayName,
            author_emoji: displayEmoji,
            floor_no: floorNo,
            content,
          })
          .select()
          .single();
        if (error) throw error;

        await supabase.rpc("pickup_post_inc_replies", { post_id: postId });

        // 通知帖子楼主（不通知自己）
        if (post.owner_id !== user.id) {
          insertNotification({
            userId: post.owner_id,
            type: "reply",
            title: `有人回复了你的帖子「${post.title}」`,
            relatedPostId: post.id,
          });
        }

        return NextResponse.json({ success: true, reply: data, floor_no: floorNo });
      }

      case "create_sub_reply": {
        const replyId = body.replyId;
        const postId = body.postId;
        const content = (body.content || "").toString().trim();
        const replyToUsername = body.replyToUsername;
        const replyToDisplay = body.replyToDisplay;

        if (!replyId || !postId) return badRequest("缺少 replyId/postId");
        if (!content || content.length > REPLY_MAX) return badRequest(`回复不超过 ${REPLY_MAX} 字`);

        const { data: post } = await supabase.from("pickup_posts").select("*").eq("id", postId).single();
        if (!post) return NextResponse.json({ success: false, error: "帖子不存在" }, { status: 404 });

        const userMap2 = await buildUserInfoMap(supabase, [user.id]);
        const userInfo2 = userMap2.get(user.id) || { name: user.username, avatar: "", username: user.username };
        let displayName = userInfo2.name;
        const { data: existingIdentity } = await supabase
          .from("pickup_identities")
          .select("*")
          .eq("user_id", user.id)
          .eq("post_id", postId)
          .single();

        if (post.identity_required) {
          if (existingIdentity) {
            displayName = existingIdentity.display_name;
          } else {
            const identityName = body.identityName;
            const identityEmoji = body.identityEmoji || "";
            if (!identityName || identityName.length < 2) {
              return badRequest("本楼需要演绎身份，请填写角色名");
            }
            const { data: conflict } = await supabase
              .from("pickup_identities")
              .select("id")
              .eq("post_id", postId)
              .eq("display_name", identityName)
              .single();
            if (conflict) return badRequest("角色名已被占用");
            await supabase.from("pickup_identities").insert({
              user_id: user.id,
              post_id: postId,
              display_name: identityName,
              emoji: identityEmoji,
            });
            displayName = identityName;
          }
        }

        const isHostReply = user.id === post.owner_id;

        const { data, error } = await supabase
          .from("pickup_sub_replies")
          .insert({
            reply_id: replyId,
            post_id: postId,
            author_id: user.id,
            author_username: user.username,
            author_display: displayName,
            author_emoji: existingIdentity?.emoji || "🐰",
            reply_to_username: replyToUsername,
            reply_to_display: replyToDisplay,
            content,
            is_host_reply: isHostReply,
            sort_index: isHostReply ? 0 : 1,
          })
          .select()
          .single();
        if (error) throw error;

        await supabase.rpc("pickup_reply_inc_sub", { reply_id: replyId });
        if (isHostReply) {
          await supabase.from("pickup_replies").update({ has_host_reply: true })
            .eq("id", replyId);
        }

        // 通知父回复作者（不通知自己）
        const { data: parentReply } = await supabase
          .from("pickup_replies").select("author_id").eq("id", replyId).single();
        if (parentReply && parentReply.author_id !== user.id) {
          insertNotification({
            userId: parentReply.author_id,
            type: "reply",
            title: `有人回复了你在「${post.title}」的评论`,
            relatedPostId: postId,
            relatedReplyId: replyId,
          });
        }
        // TODO: @提及通知（解析 content 中的 @xxx 并查找对应用户）

        return NextResponse.json({ success: true, subReply: data });
      }

      case "create_tag": {
        const name = (body.name || "").toString().trim();
        if (!name || name.length > 20) return badRequest("标签名 1~20 字");
        const normalizedName = name.startsWith("#") ? name : `#${name}`;

        const { data: existing } = await supabase
          .from("pickup_tags").select("id").eq("name", normalizedName).single();
        if (existing) {
          return NextResponse.json({ success: true, tag: existing, exists: true });
        }

        const { data, error } = await supabase
          .from("pickup_tags")
          .insert({ name: normalizedName, approved: false, use_count: 0, creator_id: user.id })
          .select()
          .single();
        if (error) throw error;
        return NextResponse.json({ success: true, tag: data, pending: true });
      }

      case "report": {
        const targetType = body.targetType;
        const targetId = body.targetId;
        const postId = body.postId;
        const replyId = body.replyId;
        const floorNo = body.floorNo;
        const reason = body.reason;
        const description = body.description;

        if (!targetType || !targetId) return badRequest("缺少目标");
        if (!reason || reason.length > 50) return badRequest("举报理由 1~50 字");
        if (description && description.length > 500) return badRequest("补充说明不超过 500 字");

        const { data, error } = await supabase
          .from("pickup_reports")
          .insert({
            reporter_id: user.id,
            target_type: targetType,
            target_id: targetId,
            post_id: postId,
            reply_id: replyId,
            floor_no: floorNo,
            reason,
            description,
          })
          .select()
          .single();
        if (error) throw error;
        return NextResponse.json({ success: true, report: data });
      }

      case "set_identity": {
        const postId = body.postId;
        const displayName = (body.displayName || "").toString().trim();
        const emoji = body.emoji || "";
        if (!postId) return badRequest("缺少 postId");
        if (!displayName || displayName.length < 2) return badRequest("角色名至少 2 字");

        const { data: existing } = await supabase
          .from("pickup_identities")
          .select("id")
          .eq("user_id", user.id)
          .eq("post_id", postId)
          .single();
        if (existing) return badRequest("身份已锁定，无法修改");

        const { data: conflict } = await supabase
          .from("pickup_identities")
          .select("id")
          .eq("post_id", postId)
          .eq("display_name", displayName)
          .single();
        if (conflict) return badRequest("角色名已被占用");

        const { data, error } = await supabase
          .from("pickup_identities")
          .insert({ user_id: user.id, post_id: postId, display_name: displayName, emoji })
          .select()
          .single();
        if (error) throw error;
        return NextResponse.json({ success: true, identity: data });
      }

      // -------- 管理员 --------
      case "admin_handle_report": {
        await requirePickupAdmin(body);
        const reportId = body.reportId;
        const handleAction = body.handleAction;
        if (!reportId || !handleAction) return badRequest("缺少参数");

        const { data: report } = await supabase.from("pickup_reports").select("*").eq("id", reportId).single();
        if (!report) return NextResponse.json({ success: false, error: "举报不存在" }, { status: 404 });

        if (handleAction === "approve") {
          if (report.target_type === "post") {
            await supabase.from("pickup_posts").update({ status: "deleted" }).eq("id", report.target_id);
          } else if (report.target_type === "reply") {
            await supabase.from("pickup_replies").update({ status: "hidden" }).eq("id", report.target_id);
          } else if (report.target_type === "sub_reply") {
            await supabase.from("pickup_sub_replies").update({ status: "hidden" }).eq("id", report.target_id);
          } else if (report.target_type === "tag") {
            await supabase.from("pickup_tags").delete().eq("id", report.target_id);
          }
          await supabase.from("pickup_reports").update({
            status: "approved",
            handled_by: user.id,
            handled_at: new Date().toISOString(),
          }).eq("id", reportId);
        } else if (handleAction === "reject") {
          await supabase.from("pickup_reports").update({
            status: "rejected",
            handled_by: user.id,
            handled_at: new Date().toISOString(),
          }).eq("id", reportId);
        }

        // 通知举报人
        const reportResult = handleAction === "approve" ? "deleted" : "dismissed";
        insertNotification({
          userId: report.reporter_id,
          type: "report_result",
          title: "你的举报已处理",
          content: reportResult === "deleted" ? "举报内容已被处理" : "举报已驳回",
          extra: { result: reportResult },
        });

        return NextResponse.json({ success: true });
      }

      case "admin_approve_tag": {
        await requirePickupAdmin(body);
        const tagId = body.tagId;
        const approved = body.approved !== false;
        if (!tagId) return badRequest("缺少 tagId");

        // 查询标签信息用于通知
        const { data: tagInfo } = await supabase
          .from("pickup_tags").select("name, creator_id").eq("id", tagId).single();

        await supabase.from("pickup_tags").update({ approved }).eq("id", tagId);

        // 通知标签创建者
        if (tagInfo?.creator_id) {
          insertNotification({
            userId: tagInfo.creator_id,
            type: "admin_action",
            title: `你创建的标签「${tagInfo.name}」已${approved ? "通过" : "拒绝"}`,
          });
        }

        return NextResponse.json({ success: true });
      }

      case "admin_post_action": {
        await requirePickupAdmin(body);
        const postId = body.postId;
        const postAction = body.postAction;
        if (!postId || !postAction) return badRequest("缺少参数");

        // 查询帖子信息用于通知
        const { data: actionPost } = await supabase
          .from("pickup_posts").select("owner_id, title").eq("id", postId).single();

        const status = postAction === "delete" ? "deleted" : postAction === "hide" ? "hidden" : "active";
        await supabase.from("pickup_posts").update({ status }).eq("id", postId);

        // 通知帖子楼主（pin/unpin 不通知）
        const actionLabels: Record<string, string> = { delete: "删除", hide: "隐藏", unhide: "取消隐藏" };
        if (!["pin", "unpin"].includes(postAction) && actionPost?.owner_id) {
          insertNotification({
            userId: actionPost.owner_id,
            type: "admin_action",
            title: `你的帖子「${actionPost.title}」已被${actionLabels[postAction] || postAction}`,
            relatedPostId: postId,
          });
        }

        return NextResponse.json({ success: true });
      }

      case "admin_review_post": {
        // 审核待发布的帖子：approve(通过) / reject(拒绝)
        await requirePickupAdmin(body);
        const postId = body.postId;
        const decision = body.decision;
        const reason = (body.reason || "").toString().trim().slice(0, 200);
        if (!postId || !["approve", "reject"].includes(decision)) return badRequest("缺少参数");

        const { data: targetPost } = await supabase
          .from("pickup_posts").select("*").eq("id", postId).single();
        if (!targetPost) return NextResponse.json({ success: false, error: "帖子不存在" }, { status: 404 });
        if (targetPost.status !== "pending") return badRequest("该帖子不在待审状态");

        if (decision === "approve") {
          // 帖子公开；同时通过其携带的所有未审核标签，并累加标签使用数
          await supabase.from("pickup_posts").update({ status: "active", reviewed_by: (await requirePickupAdmin(body)).id, reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", postId);

          const tagIds: string[] = targetPost.tag_ids || [];
          if (tagIds.length > 0) {
            const { data: tList } = await supabase
              .from("pickup_tags").select("id, approved").in("id", tagIds);
            for (const t of (tList || [])) {
              if (!t.approved) {
                await supabase.from("pickup_tags").update({ approved: true }).eq("id", t.id);
              }
              try { await supabase.rpc("pickup_tag_inc", { tag_id: t.id }); } catch { /* */ }
            }
          }
        } else {
          // 拒绝：帖子删除；帖子携带的未审核标签保持 pending（不影响创建者之后再次使用）
          await supabase.from("pickup_posts").update({ status: "deleted" }).eq("id", postId);
        }

        insertNotification({
          userId: targetPost.owner_id,
          type: "admin_action",
          title: decision === "approve"
            ? `你的帖子「${targetPost.title}」已通过审核`
            : `你的帖子「${targetPost.title}」未通过审核`,
          content: reason,
          relatedPostId: postId,
        });

        return NextResponse.json({ success: true });
      }

      case "admin_assign_post": {
        // 指派待审楼：body {postId, adminId?}；adminId 为空=认领给自己
        const adminUser = await requirePickupAdmin(body);
        const postId = body.postId;
        const targetAdminId = body.adminId || adminUser.id;
        if (!postId) return badRequest("缺少 postId");
        const { data: tAdmin } = await supabase
          .from("users").select("id, role, admin_permissions").eq("id", targetAdminId).single();
        if (!tAdmin) return badRequest("目标管理员不存在");
        if (tAdmin.role !== "super_admin") {
          const perms: string[] = (tAdmin.admin_permissions as string[]) || [];
          if (!perms.includes("pickup_manage")) return badRequest("该管理员没有「请就位」审核权限");
        }
        const { error } = await supabase
          .from("pickup_posts").update({ assigned_to: targetAdminId }).eq("id", postId);
        if (error) throw error;
        return NextResponse.json({ success: true });
      }

      case "admin_merge_tags": {
        // 合并近义标签：sourceIds 的帖子全部迁到 targetTag，source 标签标记 merged_into
        await requirePickupAdmin(body);
        const targetTagId = body.targetTagId;
        const sourceIds: string[] = body.sourceIds || [];
        if (!targetTagId || !Array.isArray(sourceIds) || sourceIds.length === 0) {
          return badRequest("缺少目标标签或待合并标签");
        }
        if (sourceIds.includes(targetTagId)) return badRequest("目标标签不能同时是待合并标签");

        const { data: target } = await supabase
          .from("pickup_tags").select("*").eq("id", targetTagId).single();
        if (!target || target.merged_into) return badRequest("目标标签不存在或已失效");

        // 确保目标标签已通过审核（合并后的语义标签应公开可用）
        if (!target.approved) {
          await supabase.from("pickup_tags").update({ approved: true }).eq("id", targetTagId);
        }

        const notifyUserIds = new Set<string>();

        for (const sourceId of sourceIds) {
          const { data: source } = await supabase
            .from("pickup_tags").select("*").eq("id", sourceId).single();
          if (!source || source.merged_into) continue;

          // 迁移所有引用了 source 标签的帖子
          const { data: affected } = await supabase
            .from("pickup_posts")
            .select("id, owner_id, tag_ids")
            .contains("tag_ids", [sourceId]);

          for (const post of (affected || [])) {
            const newTagIds: string[] = (post.tag_ids || [])
              .filter((id: string) => id !== sourceId);
            if (!newTagIds.includes(targetTagId)) newTagIds.push(targetTagId);
            await supabase.from("pickup_posts").update({ tag_ids: newTagIds }).eq("id", post.id);
            notifyUserIds.add(post.owner_id);
          }

          // source 标签作废
          await supabase.from("pickup_tags").update({ merged_into: targetTagId }).eq("id", sourceId);
        }

        // 通知所有受影响的楼主
        for (const uid of notifyUserIds) {
          insertNotification({
            userId: uid,
            type: "admin_action",
            title: `你使用的标签已合并为「${target.name}」`,
            content: "意思相近的标签已由管理员统一整理，帖子标签已自动更新。",
          });
        }

        return NextResponse.json({ success: true });
      }

      default:
        return badRequest(`未知 action: ${action}`);
    }
  } catch (e) {
    return NextResponse.json({ success: false, error: (e as Error).message }, { status: 500 });
  }
}

// ============================================================
// DELETE
// ============================================================
export async function DELETE(request: NextRequest) {
  const body = await request.json();
  const supabase = await getSupabaseClient();

  let user: VerifiedUser;
  try {
    user = await requirePickupAuth(body);
  } catch (e) {
    return NextResponse.json({ success: false, error: (e as Error).message }, { status: 401 });
  }

  const action = body?.action;
  try {
    switch (action) {
      case "delete_post": {
        const postId = body.postId;
        const { data: post } = await supabase.from("pickup_posts").select("*").eq("id", postId).single();
        if (!post) return NextResponse.json({ success: false, error: "帖子不存在" }, { status: 404 });
        if (post.owner_id !== user.id && !user.isAdmin) {
          return NextResponse.json({ success: false, error: "无权删除" }, { status: 403 });
        }
        await supabase.from("pickup_posts").update({ status: "deleted" }).eq("id", postId);
        return NextResponse.json({ success: true });
      }
      case "admin_review_post": {
        // 审核待发布的帖子：approve(通过) / reject(拒绝)
        await requirePickupAdmin(body);
        const postId = body.postId;
        const decision = body.decision;
        const reason = (body.reason || "").toString().trim().slice(0, 200);
        if (!postId || !["approve", "reject"].includes(decision)) return badRequest("缺少参数");

        const { data: targetPost } = await supabase
          .from("pickup_posts").select("*").eq("id", postId).single();
        if (!targetPost) return NextResponse.json({ success: false, error: "帖子不存在" }, { status: 404 });
        if (targetPost.status !== "pending") return badRequest("该帖子不在待审状态");

        if (decision === "approve") {
          // 帖子公开；同时通过其携带的所有未审核标签，并累加标签使用数
          await supabase.from("pickup_posts").update({ status: "active", reviewed_by: (await requirePickupAdmin(body)).id, reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", postId);

          const tagIds: string[] = targetPost.tag_ids || [];
          if (tagIds.length > 0) {
            const { data: tList } = await supabase
              .from("pickup_tags").select("id, approved").in("id", tagIds);
            for (const t of (tList || [])) {
              if (!t.approved) {
                await supabase.from("pickup_tags").update({ approved: true }).eq("id", t.id);
              }
              try { await supabase.rpc("pickup_tag_inc", { tag_id: t.id }); } catch { /* */ }
            }
          }
        } else {
          // 拒绝：帖子删除；帖子携带的未审核标签保持 pending（不影响创建者之后再次使用）
          await supabase.from("pickup_posts").update({ status: "deleted" }).eq("id", postId);
        }

        insertNotification({
          userId: targetPost.owner_id,
          type: "admin_action",
          title: decision === "approve"
            ? `你的帖子「${targetPost.title}」已通过审核`
            : `你的帖子「${targetPost.title}」未通过审核`,
          content: reason,
          relatedPostId: postId,
        });

        return NextResponse.json({ success: true });
      }

      case "admin_merge_tags": {
        // 合并近义标签：sourceIds 的帖子全部迁到 targetTag，source 标签标记 merged_into
        await requirePickupAdmin(body);
        const targetTagId = body.targetTagId;
        const sourceIds: string[] = body.sourceIds || [];
        if (!targetTagId || !Array.isArray(sourceIds) || sourceIds.length === 0) {
          return badRequest("缺少目标标签或待合并标签");
        }
        if (sourceIds.includes(targetTagId)) return badRequest("目标标签不能同时是待合并标签");

        const { data: target } = await supabase
          .from("pickup_tags").select("*").eq("id", targetTagId).single();
        if (!target || target.merged_into) return badRequest("目标标签不存在或已失效");

        // 确保目标标签已通过审核（合并后的语义标签应公开可用）
        if (!target.approved) {
          await supabase.from("pickup_tags").update({ approved: true }).eq("id", targetTagId);
        }

        const notifyUserIds = new Set<string>();

        for (const sourceId of sourceIds) {
          const { data: source } = await supabase
            .from("pickup_tags").select("*").eq("id", sourceId).single();
          if (!source || source.merged_into) continue;

          // 迁移所有引用了 source 标签的帖子
          const { data: affected } = await supabase
            .from("pickup_posts")
            .select("id, owner_id, tag_ids")
            .contains("tag_ids", [sourceId]);

          for (const post of (affected || [])) {
            const newTagIds: string[] = (post.tag_ids || [])
              .filter((id: string) => id !== sourceId);
            if (!newTagIds.includes(targetTagId)) newTagIds.push(targetTagId);
            await supabase.from("pickup_posts").update({ tag_ids: newTagIds }).eq("id", post.id);
            notifyUserIds.add(post.owner_id);
          }

          // source 标签作废
          await supabase.from("pickup_tags").update({ merged_into: targetTagId }).eq("id", sourceId);
        }

        // 通知所有受影响的楼主
        for (const uid of notifyUserIds) {
          insertNotification({
            userId: uid,
            type: "admin_action",
            title: `你使用的标签已合并为「${target.name}」`,
            content: "意思相近的标签已由管理员统一整理，帖子标签已自动更新。",
          });
        }

        return NextResponse.json({ success: true });
      }

      default:
        return badRequest(`未知 action: ${action}`);
    }
  } catch (e) {
    return NextResponse.json({ success: false, error: (e as Error).message }, { status: 500 });
  }
}
