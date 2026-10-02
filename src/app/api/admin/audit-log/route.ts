import { NextRequest } from "next/server";
import {
  requirePermissionRequest,
  logAudit,
} from "@/lib/auth";
import { getSupabaseClient } from "@/storage/database/supabase-client";

function jsonResponse<T>(success: boolean, data?: T, error?: string) {
  return Response.json({ success, data, error });
}

export async function POST(request: NextRequest) {
  try {
    const adminUser = await requirePermissionRequest(request, "audit_log");
    const body = await request.json().catch(() => ({}));
    const { action } = body;

    if (action !== "list") {
      return jsonResponse(false, undefined, "未知的 action");
    }

    const supabase = await getSupabaseClient();
    const page = Math.max(1, Number(body.page) || 1);
    const pageSize = Math.max(1, Math.min(100, Number(body.pageSize) || 20));
    const actionType =
      typeof body.actionType === "string" && body.actionType
        ? body.actionType
        : null;
    const operatorSearch =
      typeof body.operatorSearch === "string" ? body.operatorSearch : null;

    let query = supabase.from("audit_log").select(
      "id, operator_id, operator_username, action_type, target_type, target_id, details, created_at",
      { count: "exact" },
    );

    if (actionType) {
      query = query.eq("action_type", actionType);
    }
    if (operatorSearch) {
      query = query.ilike("operator_username", `%${operatorSearch}%`);
    }

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const { data, error, count } = await query
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) {
      return jsonResponse(false, undefined, error.message);
    }

    await logAudit(
      adminUser.userId,
      adminUser.username,
      "audit_log_query",
      "audit_log",
      "",
      { actionType, operatorSearch, page, pageSize },
    );

    return jsonResponse(true, {
      list: data || [],
      total: count || 0,
      page,
      pageSize,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "服务器错误";
    return jsonResponse(false, undefined, message);
  }
}
