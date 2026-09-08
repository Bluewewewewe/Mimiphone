import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { requirePermissionRequest, logAudit } from "@/lib/auth";

function getStatusEmoji(banStatus: string, verifyStatus: string): string {
  if (banStatus === "perma_banned" || banStatus === "temp_banned") return "❌";
  if (banStatus === "muted" || banStatus === "restricted") return "⚠️";
  if (verifyStatus === "verified") return "✅";
  if (verifyStatus === "pending") return "⏳";
  return "❓";
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.clone().json();
    const { authToken } = body;
    const supabase = await getSupabaseClient();

    const adminUser = await requirePermissionRequest(request, "tree_view");

    const { data: users, error } = await supabase
      .from("users")
      .select(
        "id, username, nickname, display_name, role, verify_status, status, ban_status, referrer_id, violation_count, invite_code_used, created_at"
      );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const childrenMap: Record<string, number> = {};
    (users || []).forEach((u) => {
      const parentId = u.referrer_id || "root";
      childrenMap[parentId] = (childrenMap[parentId] || 0) + 1;
    });

    const userList = (users || []).map((u) => ({
      id: u.id,
      username: u.username,
      nickname: u.nickname,
      display_name: u.display_name,
      role: u.role || "user",
      status: u.status,
      verify_status: u.verify_status,
      ban_status: u.ban_status,
      referrer_id: u.referrer_id,
      violation_count: u.violation_count || 0,
      created_at: u.created_at,
      invite_code: u.invite_code_used || "",
      invite_count: childrenMap[u.id] || 0,
      statusEmoji: getStatusEmoji(u.ban_status || "none", u.verify_status || u.status || ""),
    }));

    await logAudit(adminUser.id, adminUser.username, "view", "review_tree", "all", {
      count: userList.length,
    });

    return NextResponse.json({
      success: true,
      data: { users: userList },
    });
  } catch (err) {
    console.error("admin tree error:", err);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}
