import { NextResponse } from "next/server";
import { BUILD_VERSION } from "@/build-version";

export async function GET() {
  return NextResponse.json({ version: BUILD_VERSION });
}
