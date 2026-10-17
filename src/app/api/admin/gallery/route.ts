import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { requirePermissionRequest, logAudit } from "@/lib/auth";
import { getR2Client, r2Config, r2PublicUrl } from "@/lib/r2";
import { PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import sharp from "sharp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_SIZE = 25 * 1024 * 1024; // 原图 25MB
const ALLOWED: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/heic": "heic",
  "image/heif": "heif",
};

function ok(data: unknown, status = 200) {
  return NextResponse.json({ success: true, ...(typeof data === "object" && data !== null ? (data as object) : { data }) }, { status });
}
function fail(msg: string, status = 400) {
  return NextResponse.json({ success: false, error: msg }, { status });
}

export async function GET(request: NextRequest) {
  try {
    await requirePermissionRequest(request, "gallery_manage");
  } catch (e) {
    return fail(e instanceof Error ? e.message : "鉴权失败", 401);
  }
  const supabase = await getSupabaseClient();
  const url = new URL(request.url);
  const action = url.searchParams.get("action") || "albums";

  if (action === "photos") {
    const albumId = url.searchParams.get("albumId");
    if (!albumId) return fail("缺少 albumId");
    const { data, error } = await supabase
      .from("gallery_photos")
      .select("*")
      .eq("album_id", albumId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) return fail(error.message, 500);
    return ok({ photos: data || [] });
  }

  // 管理端相册列表（含隐藏）
  const { data, error } = await supabase
    .from("gallery_albums")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });
  if (error) return fail(error.message, 500);
  return ok({ albums: data || [] });
}

export async function POST(request: NextRequest) {
  let admin;
  try {
    admin = await requirePermissionRequest(request, "gallery_manage");
  } catch (e) {
    return fail(e instanceof Error ? e.message : "鉴权失败", 401);
  }

  const ctype = request.headers.get("content-type") || "";
  const supabase = await getSupabaseClient();

  // ---- multipart: 图片上传 ----
  if (ctype.includes("multipart/form-data")) {
    const form = await request.formData();
    const albumId = String(form.get("albumId") || "");
    const files = form.getAll("files").filter((f): f is File => f instanceof File);
    if (!albumId) return fail("缺少 albumId");
    if (files.length === 0) return fail("没有文件");

    const { data: album } = await supabase.from("gallery_albums").select("id").eq("id", albumId).maybeSingle();
    if (!album) return fail("相册不存在");
    for (const f of files) {
      if (f.size > MAX_SIZE) return fail(`「${f.name}」超过 25MB`);
      if (!ALLOWED[f.type]) return fail(`「${f.name}」格式不支持（只收 jpg/png/webp/gif/heic）`);
    }

    const r2 = getR2Client();
    const { bucket } = r2Config();
    const inserted: object[] = [];

    // 当前最大 sort_order
    const { data: lastPhotos } = await supabase
      .from("gallery_photos")
      .select("sort_order")
      .eq("album_id", albumId)
      .order("sort_order", { ascending: false })
      .limit(1);
    let orderBase = (lastPhotos?.[0]?.sort_order as number) || 0;

    for (const file of files) {
      const raw = Buffer.from(await file.arrayBuffer());
      const rand = Math.random().toString(36).slice(2, 10);
      const baseName = `${Date.now()}_${rand}`;

      const isGif = file.type === "image/gif";
      let imageBuf: Buffer;
      let thumbBuf: Buffer;
      let width = 0;
      let height = 0;
      let ext = "webp";

      if (isGif) {
        // GIF 保留原样，不转格式（动图转 webp 动画成本高，先直接存）
        imageBuf = raw;
        ext = "gif";
        const meta = await sharp(raw, { animated: true }).metadata();
        width = meta.width || 0;
        height = meta.height || 0;
        thumbBuf = await sharp(raw, { animated: true })
          .resize(480, 480, { fit: "inside", withoutEnlargement: true })
          .gif()
          .toBuffer();
      } else {
        const pipeline = sharp(raw, { failOn: "none" }).rotate();
        const meta = await pipeline.metadata();
        width = meta.width || 0;
        height = meta.height || 0;
        imageBuf = await pipeline
          .resize(2048, 2048, { fit: "inside", withoutEnlargement: true })
          .webp({ quality: 82, effort: 4 })
          .toBuffer();
        const outMeta = await sharp(imageBuf).metadata();
        width = outMeta.width || width;
        height = outMeta.height || height;
        thumbBuf = await sharp(imageBuf)
          .resize(480, 480, { fit: "inside" })
          .webp({ quality: 70 })
          .toBuffer();
      }

      const imageKey = `gallery/${albumId}/${baseName}.${ext}`;
      const thumbKey = `gallery/${albumId}/${baseName}_thumb.${isGif ? "gif" : "webp"}`;

      await r2.send(new PutObjectCommand({
        Bucket: bucket,
        Key: imageKey,
        Body: imageBuf,
        ContentType: isGif ? "image/gif" : "image/webp",
        CacheControl: "public, max-age=31536000, immutable",
      }));
      await r2.send(new PutObjectCommand({
        Bucket: bucket,
        Key: thumbKey,
        Body: thumbBuf,
        ContentType: isGif ? "image/gif" : "image/webp",
        CacheControl: "public, max-age=31536000, immutable",
      }));

      orderBase += 1;
      const { data: row, error: insErr } = await supabase.from("gallery_photos").insert({
        album_id: albumId,
        title: file.name.replace(/\.[^.]+$/, "").slice(0, 80),
        image_key: imageKey,
        image_url: r2PublicUrl(imageKey),
        thumb_key: thumbKey,
        thumb_url: r2PublicUrl(thumbKey),
        width,
        height,
        file_size: imageBuf.length,
        original_name: file.name.slice(0, 200),
        sort_order: orderBase,
      }).select("*").single();
      if (insErr) {
        // 数据库写失败要回滚 R2
        await r2.send(new DeleteObjectCommand({ Bucket: bucket, Key: imageKey })).catch(() => {});
        await r2.send(new DeleteObjectCommand({ Bucket: bucket, Key: thumbKey })).catch(() => {});
        return fail(`「${file.name}」入库失败：${insErr.message}`, 500);
      }
      inserted.push(row);
    }

    // 更新相册封面
    const { data: coverRow } = await supabase
      .from("gallery_photos")
      .select("thumb_url")
      .eq("album_id", albumId)
      .eq("status", "active")
      .order("sort_order", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (coverRow?.thumb_url) {
      await supabase.from("gallery_albums").update({ cover_url: coverRow.thumb_url, updated_at: new Date().toISOString() }).eq("id", albumId);
    }

    await logAudit(admin.id, admin.username, "gallery_upload", "gallery", albumId, { count: inserted.length });
    return ok({ photos: inserted });
  }

  // ---- JSON: 相册增删改、图片管理 ----
  const body = await request.json().catch(() => ({}));
  const action = body.action;

  if (action === "create_album") {
    const title = String(body.title || "").trim();
    if (!title) return fail("标题不能为空");
    const { data: maxRow } = await supabase.from("gallery_albums").select("sort_order").order("sort_order", { ascending: false }).limit(1);
    const sortOrder = ((maxRow?.[0]?.sort_order as number) || 0) + 1;
    const { data, error } = await supabase.from("gallery_albums").insert({
      title,
      description: body.description || null,
      sort_order: sortOrder,
    }).select("*").single();
    if (error) return fail(error.message, 500);
    await logAudit(admin.id, admin.username, "gallery_album_create", "gallery", data.id, { title });
    return ok({ album: data });
  }

  if (action === "update_album") {
    const { id, ...rest } = body;
    if (!id) return fail("缺少 id");
    const allow: Record<string, unknown> = {};
    if (typeof rest.title === "string") allow.title = rest.title.trim();
    if (typeof rest.description === "string") allow.description = rest.description || null;
    if (["active", "hidden"].includes(rest.status)) allow.status = rest.status;
    if (typeof rest.sort_order === "number") allow.sort_order = rest.sort_order;
    allow.updated_at = new Date().toISOString();
    const { data, error } = await supabase.from("gallery_albums").update(allow).eq("id", id).select("*").single();
    if (error) return fail(error.message, 500);
    await logAudit(admin.id, admin.username, "gallery_album_update", "gallery", id, allow);
    return ok({ album: data });
  }

  if (action === "delete_album") {
    const { id } = body;
    if (!id) return fail("缺少 id");
    const { data: photos } = await supabase.from("gallery_photos").select("image_key,thumb_key").eq("album_id", id);
    const r2 = getR2Client();
    const { bucket } = r2Config();
    for (const p of photos || []) {
      if (p.image_key) await r2.send(new DeleteObjectCommand({ Bucket: bucket, Key: p.image_key })).catch(() => {});
      if (p.thumb_key) await r2.send(new DeleteObjectCommand({ Bucket: bucket, Key: p.thumb_key })).catch(() => {});
    }
    const { error } = await supabase.from("gallery_albums").delete().eq("id", id);
    if (error) return fail(error.message, 500);
    await logAudit(admin.id, admin.username, "gallery_album_delete", "gallery", id, { photoCount: photos?.length || 0 });
    return ok({});
  }

  if (action === "update_photo") {
    const { id, ...rest } = body;
    if (!id) return fail("缺少 id");
    const allow: Record<string, unknown> = {};
    if (typeof rest.title === "string") allow.title = rest.title.slice(0, 80);
    if (["active", "hidden"].includes(rest.status)) allow.status = rest.status;
    if (typeof rest.sort_order === "number") allow.sort_order = rest.sort_order;
    const { data, error } = await supabase.from("gallery_photos").update(allow).eq("id", id).select("*").single();
    if (error) return fail(error.message, 500);
    await logAudit(admin.id, admin.username, "gallery_photo_update", "gallery", id, allow);
    return ok({ photo: data });
  }

  if (action === "delete_photo") {
    const { id } = body;
    if (!id) return fail("缺少 id");
    const { data: photo } = await supabase.from("gallery_photos").select("*").eq("id", id).maybeSingle();
    if (!photo) return fail("图片不存在");
    const r2 = getR2Client();
    const { bucket } = r2Config();
    if (photo.image_key) await r2.send(new DeleteObjectCommand({ Bucket: bucket, Key: photo.image_key })).catch(() => {});
    if (photo.thumb_key) await r2.send(new DeleteObjectCommand({ Bucket: bucket, Key: photo.thumb_key })).catch(() => {});
    await supabase.from("gallery_photos").delete().eq("id", id);
    // 补封面
    const { data: coverRow } = await supabase
      .from("gallery_photos").select("thumb_url").eq("album_id", photo.album_id).eq("status", "active")
      .order("sort_order", { ascending: true }).limit(1).maybeSingle();
    await supabase.from("gallery_albums").update({ cover_url: coverRow?.thumb_url || null }).eq("id", photo.album_id);
    await logAudit(admin.id, admin.username, "gallery_photo_delete", "gallery", id);
    return ok({});
  }

  if (action === "reorder_photos") {
    // body.ids: 排序后的图片 id 数组
    const ids: string[] = Array.isArray(body.ids) ? body.ids : [];
    for (let i = 0; i < ids.length; i++) {
      await supabase.from("gallery_photos").update({ sort_order: i + 1 }).eq("id", ids[i]);
    }
    return ok({});
  }

  return fail("未知 action");
}
