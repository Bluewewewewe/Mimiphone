import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { requireAuth } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "public-uploads";
const MAX_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};
// kind -> 存储目录
const KINDS = ["avatar", "product", "contact", "post"];

// 确保 bucket 存在且公开；重复创建会报错，忽略即可
async function ensureBucket(supabase: ReturnType<typeof getSupabaseClient>) {
  const { data } = await supabase.storage.getBucket(BUCKET);
  if (data) return;
  await supabase.storage.createBucket(BUCKET, { public: true });
}

export async function POST(request: NextRequest) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "请求格式错误，需要 multipart/form-data" }, { status: 400 });
  }

  // 兼容两种鉴权：form 字段 token（个人主页）或 Authorization: Bearer（小作坊）
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const formToken = form.get("token") || form.get("authToken");
  const tokenStr = (typeof formToken === "string" && formToken) || bearer;
  // kind 缺省时按商品图处理（小作坊旧前端不传 kind）
  const rawKind = form.get("kind");
  const kind = rawKind ? String(rawKind) : "product";
  const file = form.get("file");

  if (!KINDS.includes(kind)) {
    return NextResponse.json({ error: `不支持的图片类型：${kind}` }, { status: 400 });
  }

  let user;
  try {
    user = await requireAuth(tokenStr);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "未登录或登录已过期" },
      { status: 401 }
    );
  }

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "缺少文件" }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "图片不能超过 5MB" }, { status: 400 });
  }
  const ext = ALLOWED[file.type];
  if (!ext) {
    return NextResponse.json(
      { error: "只支持 JPG / PNG / WebP / GIF 格式" },
      { status: 400 }
    );
  }

  const supabase = getSupabaseClient();
  await ensureBucket(supabase);

  // 路径：{kind}/{userId}/{时间戳随机}.{ext}
  const rand = Math.random().toString(36).slice(2, 8);
  const path = `${kind}/${user.id}/${Date.now()}_${rand}.${ext}`;

  const buffer = Buffer.from(await file.arrayBuffer());
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: file.type, upsert: false });

  if (error) {
    console.error("上传失败:", error);
    return NextResponse.json({ error: "上传失败：" + error.message }, { status: 500 });
  }

  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return NextResponse.json({ success: true, url: pub.publicUrl, path });
}
