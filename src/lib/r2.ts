// Cloudflare R2 存储层（S3 兼容）
// 仅服务端使用。密钥全部从环境变量读取。
import { S3Client } from "@aws-sdk/client-s3";

let _client: S3Client | null = null;

export function r2Config() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET || "mimi-assets";
  const publicBaseUrl = (process.env.R2_PUBLIC_BASE_URL || "").replace(/\/$/, "");

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error("R2 环境变量未配置完整（需要 R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY）");
  }

  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucket,
    publicBaseUrl,
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  };
}

export function getR2Client(): S3Client {
  if (_client) return _client;
  const cfg = r2Config();
  _client = new S3Client({
    region: "auto",
    endpoint: cfg.endpoint,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
  });
  return _client;
}

export function r2PublicUrl(key: string): string {
  const cfg = r2Config();
  if (!cfg.publicBaseUrl) return key;
  return `${cfg.publicBaseUrl}/${key.split("/").map(encodeURIComponent).join("/")}`;
}
