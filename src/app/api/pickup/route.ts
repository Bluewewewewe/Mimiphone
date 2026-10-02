import { NextRequest, NextResponse } from "next/server";
import getSupabaseClient from "@/storage/database/supabase-client";
import {
  requireAuth,
  requireAdmin,
  hasPermission,
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
  if (!hasPermission(user, "manage_content" as AdminPermission)) {
    throw new Error("缺少内容管理权限");
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
// GET
// ============================================================
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const action = url.searchParams.get("action") || "list";
  const supabase = await getSupabaseClient();

  try {
    switch (action) {
      case "list": {
        const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
        const sort = url.searchParams.get("sort") || "heat";
        const tagId = url.searchParams.get("tag");
        const keyword = url.searchParams.get("keyword");
        const from = (page - 1) * PER_PAGE;

        let q = supabase
          .from("pickup_posts")
          .select("*, pickup_tags(id, name)")
          .eq("status", "active");

        if (tagId) q = q.contains("tag_ids", [tagId]);
        if (keyword) q = q.ilike("title", `%${keyword}%`);

        if (sort === "heat") {
          q = q.order("replies_count", { ascending: false });
        } else {
          q = q.order("created_at", { ascending: false });
        }

        const { data, error, count } = await q
          .range(from, from + PER_PAGE - 1);

        if (error) throw error;
        return NextResponse.json({ success: true, posts: data || [], total: count || 0, page });
      }

      case "get": {
        const postId = url.searchParams.get("postId");
        if (!postId) return badRequest("缺少 postId");
        const { data, error } = await supabase
          .from("pickup_posts")
          .select("*, pickup_tags(id, name)")
          .eq("id", postId)
          .eq("status", "active")
          .single();
        if (error) return NextResponse.json({ success: false, error: "帖子不存在" }, { status: 404 });
        return NextResponse.json({ success: true, post: data });
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
        const query = url.searchParams.get("q");
        if (query) {
          const { data, error } = await supabase
            .from("pickup_tags")
            .select("*")
            .ilike("name", `%${query}%`)
            .order("use_count", { ascending: false })
            .limit(20);
          if (error) throw error;
          return NextResponse.json({ success: true, tags: data || [] });
        }
        const { data, error } = await supabase
          .from("pickup_tags")
          .select("*")
          .eq("approved", true)
          .order("use_count", { ascending: false })
          .limit(10);
        if (error) throw error;
        return NextResponse.json({ success: true, tags: data || [] });
      }

      case "identity": {
        const postId = url.searchParams.get("postId");
        if (!postId) return badRequest("缺少 postId");
        const user = await requirePickupAuth({ token: url.searchParams.get("token") });
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
        const user = await requirePickupAuth({ token: url.searchParams.get("token") });
        const { data, error } = await supabase
          .from("pickup_posts")
          .select("*")
          .eq("owner_id", user.id)
          .eq("status", "active")
          .order("created_at", { ascending: false });
        if (error) throw error;
        return NextResponse.json({ success: true, posts: data || [] });
      }

      case "admin_reports": {
        await requirePickupAdmin({ token: url.searchParams.get("token") });
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
        await requirePickupAdmin({ token: url.searchParams.get("token") });
        const { data, error } = await supabase
          .from("pickup_tags")
          .select("*")
          .eq("approved", false)
          .order("created_at", { ascending: false });
        if (error) throw error;
        return NextResponse.json({ success: true, tags: data || [] });
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
        const hostLabel = (body.hostLabel || "楼主").toString().trim().slice(0, 10);

        if (!title || title.length > TITLE_MAX) return badRequest(`标题 1~${TITLE_MAX} 字`);
        if (!content || content.length > CONTENT_MAX) return badRequest(`内容不超过 ${CONTENT_MAX} 字`);

        if (tagIds.length > 0) {
          const { data: tags } = await supabase
            .from("pickup_tags")
            .select("id")
            .in("id", tagIds)
            .eq("approved", true);
          const validIds = (tags || []).map((t: any) => t.id);
          if (validIds.length !== tagIds.length) {
            return badRequest("包含未审核通过的标签");
          }
        }

        // 从 users 表取 display_name
        const userMap = await buildUserInfoMap(supabase, [user.id]);
        const userInfo = userMap.get(user.id) || { name: user.username, avatar: "", username: user.username };

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
            host_label: hostLabel,
          })
          .select()
          .single();

        if (error) throw error;
        if (tagIds.length > 0) {
          for (const id of tagIds) {
            await supabase.rpc("pickup_tag_inc", { tag_id: id });
          }
        }
        return NextResponse.json({ success: true, post: data });
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
          .insert({ name: normalizedName, approved: false, use_count: 0 })
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
        return NextResponse.json({ success: true });
      }

      case "admin_approve_tag": {
        await requirePickupAdmin(body);
        const tagId = body.tagId;
        const approved = body.approved !== false;
        if (!tagId) return badRequest("缺少 tagId");
        await supabase.from("pickup_tags").update({ approved }).eq("id", tagId);
        return NextResponse.json({ success: true });
      }

      case "admin_post_action": {
        await requirePickupAdmin(body);
        const postId = body.postId;
        const postAction = body.postAction;
        if (!postId || !postAction) return badRequest("缺少参数");
        const status = postAction === "delete" ? "deleted" : postAction === "hide" ? "hidden" : "active";
        await supabase.from("pickup_posts").update({ status }).eq("id", postId);
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
      default:
        return badRequest(`未知 action: ${action}`);
    }
  } catch (e) {
    return NextResponse.json({ success: false, error: (e as Error).message }, { status: 500 });
  }
}
