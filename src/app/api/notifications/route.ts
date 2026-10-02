import { NextRequest, NextResponse } from "next/server";
import getSupabaseClient from "@/storage/database/supabase-client";
import {
  requireAdmin,
  hasPermission,
  extractTokenFromRequest,
  type VerifiedUser,
  type AdminPermission,
} from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";

const DEFAULT_PAGE_SIZE = 20;

function jsonOk(data: any) {
  return NextResponse.json({ success: true, ...data });
}

function jsonErr(error: string, status = 400, extra?: Record<string, any>) {
  return NextResponse.json({ success: false, error, ...extra }, { status });
}

function isTableNotFound(error: any): boolean {
  return (
    error?.code === "42P01" ||
    error?.message?.includes("does not exist") ||
    false
  );
}

function mapNotif(row: any) {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    title: row.title,
    content: row.content,
    relatedPostId: row.related_post_id,
    relatedReplyId: row.related_reply_id,
    extra: row.extra,
    readAt: row.read_at,
    createdAt: row.created_at,
  };
}

async function requireNotifAuth(request: NextRequest): Promise<VerifiedUser> {
  const token = await extractTokenFromRequest(request);
  const { requireAuth } = await import("@/lib/auth");
  return requireAuth(token);
}

async function requireNotifAdmin(request: NextRequest): Promise<VerifiedUser> {
  const token = await extractTokenFromRequest(request);
  const user = await requireAdmin(token);
  if (!hasPermission(user, "forum_manage" as AdminPermission)) {
    throw new Error("缺少论坛管理权限");
  }
  return user;
}

// ============================================================
// GET
// ============================================================
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const action = url.searchParams.get("action") || "list";

  let user: VerifiedUser;
  try {
    user = await requireNotifAuth(request);
  } catch (e) {
    return jsonErr((e as Error).message, 401);
  }

  const limit = rateLimit(request, `notif:${action}`, 30, 60);
  if (!limit.allowed) {
    return jsonErr("操作太快，请稍后再试", 429);
  }

  const supabase = await getSupabaseClient();

  try {
    switch (action) {
      // ---- 通知列表 ----
      case "list": {
        const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
        const pageSize = Math.min(50, Math.max(1, parseInt(url.searchParams.get("pageSize") || String(DEFAULT_PAGE_SIZE), 10)));
        const typeFilter = url.searchParams.get("type");
        const from = (page - 1) * pageSize;

        let q = supabase
          .from("notifications")
          .select("*", { count: "exact" })
          .eq("user_id", user.id);

        if (typeFilter) {
          q = q.eq("type", typeFilter);
        }

        // 未读在前 (read_at is null → sort first)，然后按创建时间倒序
        const { data, error, count } = await q
          .order("read_at", { ascending: true, nullsFirst: true })
          .order("created_at", { ascending: false })
          .range(from, from + pageSize - 1);

        if (error) {
          if (isTableNotFound(error)) {
            return jsonErr("通知表未初始化", 500, { code: "TABLE_NOT_FOUND" });
          }
          throw error;
        }

        return jsonOk({
          data: (data || []).map(mapNotif),
          total: count || 0,
          page,
          pageSize,
        });
      }

      // ---- 未读数量 ----
      case "unread_count": {
        const { count, error } = await supabase
          .from("notifications")
          .select("*", { count: "exact", head: true })
          .eq("user_id", user.id)
          .is("read_at", null);

        if (error) {
          if (isTableNotFound(error)) {
            return jsonOk({ count: 0 });
          }
          throw error;
        }
        return jsonOk({ count: count || 0 });
      }

      // ---- 最新版本（弹窗用） ----
      case "latest_version": {
        const { data, error } = await supabase
          .from("app_versions")
          .select("version, title, content, type, popup_text, published_at")
          .eq("show_in_popup", true)
          .order("published_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) {
          if (isTableNotFound(error)) {
            return jsonOk({ data: null });
          }
          throw error;
        }
        return jsonOk({ data: data || null });
      }

      // ---- 版本列表（公开） ----
      case "versions_list": {
        const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
        const pageSize = Math.min(50, Math.max(1, parseInt(url.searchParams.get("pageSize") || String(DEFAULT_PAGE_SIZE), 10)));
        const from = (page - 1) * pageSize;

        const { data, error, count } = await supabase
          .from("app_versions")
          .select("*", { count: "exact" })
          .order("published_at", { ascending: false })
          .range(from, from + pageSize - 1);

        if (error) {
          if (isTableNotFound(error)) {
            return jsonErr("版本表未初始化", 500, { code: "TABLE_NOT_FOUND" });
          }
          throw error;
        }
        return jsonOk({
          data: data || [],
          total: count || 0,
          page,
          pageSize,
        });
      }

      default:
        return jsonErr(`未知 action: ${action}`);
    }
  } catch (e) {
    return jsonErr((e as Error).message, 500);
  }
}

// ============================================================
// POST
// ============================================================
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const action = body?.action;

  let user: VerifiedUser;
  try {
    user = await requireNotifAuth(request);
  } catch (e) {
    return jsonErr((e as Error).message, 401);
  }

  const limit = rateLimit(request, `notif:${action || "post"}`, 20, 60);
  if (!limit.allowed) {
    return jsonErr("操作太快，请稍后再试", 429);
  }

  const supabase = await getSupabaseClient();

  try {
    switch (action) {
      // ---- 标记已读 ----
      case "mark_read": {
        const ids: string[] = body.ids || [];
        if (!Array.isArray(ids) || ids.length === 0) {
          return jsonErr("缺少 ids");
        }
        const { error } = await supabase
          .from("notifications")
          .update({ read_at: new Date().toISOString() })
          .in("id", ids)
          .eq("user_id", user.id)
          .is("read_at", null);

        if (error) {
          if (isTableNotFound(error)) {
            return jsonErr("通知表未初始化", 500, { code: "TABLE_NOT_FOUND" });
          }
          throw error;
        }
        return jsonOk({});
      }

      // ---- 全部标记已读 ----
      case "mark_all_read": {
        const { error } = await supabase
          .from("notifications")
          .update({ read_at: new Date().toISOString() })
          .eq("user_id", user.id)
          .is("read_at", null);

        if (error) {
          if (isTableNotFound(error)) {
            return jsonErr("通知表未初始化", 500, { code: "TABLE_NOT_FOUND" });
          }
          throw error;
        }
        return jsonOk({});
      }

      // ---- 管理员发送通知 ----
      case "admin_send": {
        let adminUser: VerifiedUser;
        try {
          adminUser = await requireNotifAdmin(request);
        } catch (e) {
          return jsonErr((e as Error).message, 401);
        }

        const { targetUserId, type, title, content, relatedPostId, relatedReplyId, extra } = body;
        if (!type || !title) return jsonErr("缺少 type/title");

        if (targetUserId) {
          // 发给单个用户
          const { error } = await supabase.from("notifications").insert({
            user_id: targetUserId,
            type,
            title,
            content: content || "",
            related_post_id: relatedPostId || null,
            related_reply_id: relatedReplyId || null,
            extra: extra || {},
          });
          if (error) {
            if (isTableNotFound(error)) {
              return jsonErr("通知表未初始化", 500, { code: "TABLE_NOT_FOUND" });
            }
            throw error;
          }
        } else {
          // 发给全部用户：查出所有用户 id，每人插一条
          const { data: users, error: userErr } = await supabase
            .from("users")
            .select("id");
          if (userErr) throw userErr;

          const rows = (users || [])
            .filter((u: any) => u.id !== adminUser.id) // 不给管理员自己发
            .map((u: any) => ({
              user_id: u.id,
              type,
              title,
              content: content || "",
              related_post_id: relatedPostId || null,
              related_reply_id: relatedReplyId || null,
              extra: extra || {},
            }));

          if (rows.length > 0) {
            // 分批插入，每批 100
            for (let i = 0; i < rows.length; i += 100) {
              const batch = rows.slice(i, i + 100);
              const { error } = await supabase.from("notifications").insert(batch);
              if (error) {
                if (isTableNotFound(error)) {
                  return jsonErr("通知表未初始化", 500, { code: "TABLE_NOT_FOUND" });
                }
                throw error;
              }
            }
          }
        }
        return jsonOk({});
      }

      // ---- 管理员创建版本 ----
      case "admin_create_version": {
        try {
          await requireNotifAdmin(request);
        } catch (e) {
          return jsonErr((e as Error).message, 401);
        }

        const { version, title, content, type, showInPopup, popupText } = body;
        if (!version || !title || !content) return jsonErr("缺少 version/title/content");

        const { data, error } = await supabase
          .from("app_versions")
          .insert({
            version,
            title,
            content,
            type: type || "feature",
            show_in_popup: showInPopup !== false,
            popup_text: popupText || null,
          })
          .select()
          .single();

        if (error) {
          if (isTableNotFound(error)) {
            return jsonErr("版本表未初始化", 500, { code: "TABLE_NOT_FOUND" });
          }
          // unique 冲突
          if (error.code === "23505") {
            return jsonErr("版本号已存在");
          }
          throw error;
        }
        return jsonOk({ data });
      }

      default:
        return jsonErr(`未知 action: ${action}`);
    }
  } catch (e) {
    return jsonErr((e as Error).message, 500);
  }
}
