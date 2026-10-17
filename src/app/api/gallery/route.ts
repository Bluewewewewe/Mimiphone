import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/gallery?action=albums            相册列表（含封面）
// GET /api/gallery?action=photos&albumId=xx  某相册图片（公开，只返回 active）
export async function GET(request: NextRequest) {
  try {
    const supabase = await getSupabaseClient();
    const url = new URL(request.url);
    const action = url.searchParams.get("action") || "albums";

    if (action === "albums") {
      const { data, error } = await supabase
        .from("gallery_albums")
        .select("*")
        .eq("status", "active")
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false });
      if (error) throw error;

      // 附带每册图片数
      const { data: photos } = await supabase
        .from("gallery_photos")
        .select("album_id")
        .eq("status", "active");
      const countMap = new Map<string, number>();
      (photos || []).forEach((p) => countMap.set(p.album_id, (countMap.get(p.album_id) || 0) + 1));

      const albums = (data || []).map((a) => ({
        ...a,
        photo_count: countMap.get(a.id) || 0,
      }));
      return NextResponse.json({ success: true, albums });
    }

    if (action === "photos") {
      const albumId = url.searchParams.get("albumId");
      if (!albumId) return NextResponse.json({ success: false, error: "缺少 albumId" }, { status: 400 });

      const { data: album } = await supabase
        .from("gallery_albums")
        .select("*")
        .eq("id", albumId)
        .eq("status", "active")
        .maybeSingle();
      if (!album) return NextResponse.json({ success: false, error: "相册不存在" }, { status: 404 });

      const { data: photos, error } = await supabase
        .from("gallery_photos")
        .select("id, album_id, title, image_url, thumb_url, width, height, file_size, sort_order, created_at")
        .eq("album_id", albumId)
        .eq("status", "active")
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;

      return NextResponse.json({ success: true, album, photos: photos || [] });
    }

    return NextResponse.json({ success: false, error: "未知 action" }, { status: 400 });
  } catch (e) {
    console.error("gallery GET error:", e);
    return NextResponse.json({ success: false, error: "服务器错误" }, { status: 500 });
  }
}
