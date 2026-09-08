import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { requirePermissionRequest, logAudit, type AdminPermission } from "@/lib/auth";
import { validateSchedule, type ScheduleItem, type RepeatType } from "@/lib/schedule";

function jsonResponse(data: { success: boolean; data?: unknown; error?: string }, status = 200) {
  return NextResponse.json(data, { status });
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await getSupabaseClient();
    const body = await request.clone().json();
    const { action } = body;

    const permissionAction: Record<string, AdminPermission> = {
      list: "user_manage",
      create: "user_manage",
      update: "user_manage",
      delete: "user_manage",
    };

    let adminUser;
    try {
      adminUser = await requirePermissionRequest(request, permissionAction[action as string] || "user_manage");
    } catch (err) {
      const message = err instanceof Error ? err.message : "鉴权失败";
      return jsonResponse({ success: false, error: message }, 401);
    }

    // ===== 获取课程表列表 =====
    if (action === "list") {
      const { start_date, end_date } = body;

      let query = supabase
        .from("course_schedules")
        .select("*")
        .order("start_time", { ascending: true });

      if (start_date) {
        query = query.gte("start_time", start_date);
      }
      if (end_date) {
        query = query.lte("start_time", end_date);
      }

      const { data, error } = await query;
      if (error) return jsonResponse({ success: false, error: error.message }, 500);

      return jsonResponse({ success: true, data: { list: data || [] } });
    }

    // ===== 创建课程 =====
    if (action === "create") {
      const { title, description, start_time, end_time, repeat_type } = body;

      const item: ScheduleItem = {
        title: title || "",
        description: description || null,
        start_time: start_time || "",
        end_time: end_time || "",
        created_by: adminUser.userId,
        repeat_type: (repeat_type || "none") as RepeatType,
      };

      const validation = validateSchedule(item);
      if (!validation.valid) {
        return jsonResponse({ success: false, error: validation.errors.join("; ") }, 400);
      }

      const { data, error } = await supabase
        .from("course_schedules")
        .insert({
          title: item.title,
          description: item.description,
          start_time: item.start_time,
          end_time: item.end_time,
          created_by: item.created_by,
          repeat_type: item.repeat_type,
        })
        .select()
        .single();

      if (error) return jsonResponse({ success: false, error: error.message }, 500);

      await logAudit(adminUser.id, adminUser.username, "schedule_create", "schedule", data.id, { title: item.title });

      return jsonResponse({ success: true, data });
    }

    // ===== 修改课程 =====
    if (action === "update") {
      const { id, title, description, start_time, end_time, repeat_type } = body;
      if (!id) return jsonResponse({ success: false, error: "缺少课程 id" }, 400);

      // Get existing item
      const { data: existing, error: getErr } = await supabase
        .from("course_schedules")
        .select("*")
        .eq("id", id)
        .single();

      if (getErr || !existing) return jsonResponse({ success: false, error: "课程不存在" }, 404);

      const item: ScheduleItem = {
        id,
        title: title ?? existing.title,
        description: description ?? existing.description,
        start_time: start_time ?? existing.start_time,
        end_time: end_time ?? existing.end_time,
        created_by: existing.created_by,
        repeat_type: (repeat_type ?? existing.repeat_type) as RepeatType,
      };

      const validation = validateSchedule(item);
      if (!validation.valid) {
        return jsonResponse({ success: false, error: validation.errors.join("; ") }, 400);
      }

      const updateData: Record<string, unknown> = {};
      if (title !== undefined) updateData.title = title;
      if (description !== undefined) updateData.description = description;
      if (start_time !== undefined) updateData.start_time = start_time;
      if (end_time !== undefined) updateData.end_time = end_time;
      if (repeat_type !== undefined) updateData.repeat_type = repeat_type;

      const { data, error } = await supabase
        .from("course_schedules")
        .update(updateData)
        .eq("id", id)
        .select()
        .single();

      if (error) return jsonResponse({ success: false, error: error.message }, 500);

      await logAudit(adminUser.id, adminUser.username, "schedule_update", "schedule", id, updateData);

      return jsonResponse({ success: true, data });
    }

    // ===== 删除课程 =====
    if (action === "delete") {
      const { id } = body;
      if (!id) return jsonResponse({ success: false, error: "缺少课程 id" }, 400);

      const { error } = await supabase
        .from("course_schedules")
        .delete()
        .eq("id", id);

      if (error) return jsonResponse({ success: false, error: error.message }, 500);

      await logAudit(adminUser.id, adminUser.username, "schedule_delete", "schedule", id, {});

      return jsonResponse({ success: true, data: { deleted: true } });
    }

    return jsonResponse({ success: false, error: "未知 action" }, 400);
  } catch (err) {
    const message = err instanceof Error ? err.message : "服务器错误";
    return jsonResponse({ success: false, error: message }, 500);
  }
}
