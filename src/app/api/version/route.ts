import { NextResponse } from "next/server";

// 构建时生成的版本号，由 build.sh 写入
let BUILD_VERSION = "dev";
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const v = require("@/BUILD_VERSION.json");
  BUILD_VERSION = v.version || "dev";
} catch {
  // 开发环境或文件不存在
}

export async function GET() {
  return NextResponse.json({
    version: BUILD_VERSION,
  });
}
