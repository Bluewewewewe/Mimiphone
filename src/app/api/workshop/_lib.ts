/**
 * 迷你小作坊 API 服务端共享工具
 * - token 提取（GET 用 header/query，POST/PATCH/DELETE 用 header/body）
 * - 统一错误响应
 * - DB 行(snake_case) → 前端数据(camelCase) 映射
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyToken, type VerifiedUser } from "@/lib/auth";
import { wsFormatCode } from "@/lib/workshop";

export function wsError(message: string, status = 400) {
    return NextResponse.json({ success: false, error: message }, { status });
}

export function wsOk(data: unknown = null) {
    return NextResponse.json({ success: true, data });
}

/** 统一错误处理：把鉴权错误映射为 401/403 */
export function wsHandleError(err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("需要管理员") || message.includes("权限")) {
        return wsError(message, 403);
    }
    if (message.includes("未登录") || message.includes("登录已过期")) {
        return wsError(message, 401);
    }
    return wsError(message, 500);
}

/** 从请求中提取 token：Authorization header → query.token → body.token */
export async function wsExtractToken(request: NextRequest): Promise<string | undefined> {
    const authHeader = request.headers.get("authorization");
    if (authHeader?.startsWith("Bearer ")) return authHeader.slice(7);
    const qToken = new URL(request.url).searchParams.get("token");
    if (qToken) return qToken;
    try {
        const cloned = request.clone();
        const body = await cloned.json();
        return body?.token || body?.authToken || undefined;
    } catch {
        return undefined;
    }
}

export async function wsRequireUser(request: NextRequest): Promise<VerifiedUser> {
    const token = await wsExtractToken(request);
    const user = await verifyToken(token);
    if (!user) throw new Error("未登录或登录已过期");
    return user;
}

export async function wsRequireAdmin(request: NextRequest): Promise<VerifiedUser> {
    const user = await wsRequireUser(request);
    if (!user.isAdmin) throw new Error("需要管理员权限");
    return user;
}

// ===================== 行映射 =====================

function tsMs(v: string | null | undefined): number | null {
    if (!v) return null;
    const t = new Date(v).getTime();
    return Number.isNaN(t) ? null : t;
}

export function wsMapGroup(row: Record<string, unknown>) {
    return {
        id: row.id as string,
        name: row.name as string,
        leaderUser: (row.leader_name as string) || "",
        leaderUid: (row.leader_user_id as string) || "",
        startAt: tsMs(row.start_at as string | null),
        endAt: tsMs(row.end_at as string | null),
        maxProducts: (row.max_products as number) ?? 5,
        active: row.active !== false,
        createdAt: tsMs(row.created_at as string | null),
    };
}

export function wsMapLeader(row: Record<string, unknown>) {
    return {
        user: (row.user_name as string) || "",
        uid: row.user_id as string,
        groupIds: (row.group_ids as string[]) || [],
        expiresAt: tsMs(row.expires_at as string | null),
        active: row.active !== false,
    };
}

export function wsMapApplication(row: Record<string, unknown>) {
    return {
        id: row.id as string,
        user: (row.user_name as string) || "",
        uid: row.user_id as string,
        note: (row.note as string) || "",
        status: row.status as "pending" | "approved" | "rejected",
        ts: tsMs(row.created_at as string | null) ?? Date.now(),
    };
}

export function wsMapProduct(row: Record<string, unknown>) {
    const codeNum = (row.code_num as number) ?? 0;
    return {
        id: row.id as string,
        codeNum,
        code: codeNum ? wsFormatCode(codeNum) : "",
        name: (row.name as string) || "",
        image: (row.image_url as string) || "",
        desc: (row.description as string) || "",
        price: (row.price as string) || "",
        groupId: (row.group_id as string) || "",
        category: (row.category as string) || "",
        majorCat: (row.category as string) || "",
        subCategory: (row.sub_category as string) || "",
        minorCat: (row.sub_category as string) || "",
        hasQuestion: !!row.has_question,
        question: (row.question as string) || "",
        answer: (row.answer as string) || "",
        contactImage: (row.contact_image_url as string) || "",
        status: (row.status as string) || "pending",
        wantCount: (row.want_count as number) ?? 0,
        leaderUser: (row.leader_name as string) || "",
        leaderUid: (row.leader_user_id as string) || "",
        listedUntil: tsMs(row.listed_until as string | null),
        createdAt: tsMs(row.created_at as string | null),
    };
}

export function wsMapCategory(row: Record<string, unknown>) {
    return {
        id: row.id as string,
        name: (row.name as string) || "",
        subs: (row.subs as string[]) || [],
    };
}

export function wsMapCarousel(row: Record<string, unknown> | null) {
    return {
        customCount: (row?.custom_count as number) ?? 0,
        customIds: (row?.custom_ids as string[]) || [],
        banners: (row?.banners as Record<string, string>) || {},
    };
}
