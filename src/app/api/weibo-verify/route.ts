import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { requireAdmin } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";

const supabase = getSupabaseClient();

function generateCode(): string {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "MIMI-";
    for (let i = 0; i < 5; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
}

function generateInviteCode(): string {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "INV-";
    for (let i = 0; i < 8; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
}

async function generateUserInviteCodes(_username: string, userId: string) {
    const now = new Date().toISOString();
    const codes = [];
    for (let i = 0; i < 5; i++) {
        const code = generateInviteCode();
        codes.push({
            code,
            owner_id: userId,
            role_type: "user",
            status: "active",
            used_by: null,
            created_at: now,
            used_at: null,
            revoked_at: null,
        });
    }

    const { error } = await supabase.from("invite_codes").insert(codes);

    if (error) {
        console.error("生成邀请码失败:", error);
    }

    return codes;
}

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const username = searchParams.get("username");
        const list = searchParams.get("list");
        const statusFilter = searchParams.get("status");
        const authToken = searchParams.get("authToken");

        if (list === "true") {
            await requireAdmin(authToken);

            let query = supabase
                .from("weibo_verification")
                .select("*")
                .order("created_at", { ascending: false })
                .limit(50);

            if (statusFilter && statusFilter !== "all") {
                query = query.eq("status", statusFilter);
            }

            const { data, error } = await query;

            if (error) {
                return NextResponse.json({ error: error.message }, { status: 500 });
            }

            return NextResponse.json({ success: true, data: data || [] });
        }

        if (!username) {
            return NextResponse.json({ error: "Missing username" }, { status: 400 });
        }

        const { data, error } = await supabase
            .from("weibo_verification")
            .select("*")
            .eq("user_id", username)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, data: data || null });
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Unknown error";
        if (message === "未登录或登录已过期" || message === "需要管理员权限") {
            return NextResponse.json({ success: false, error: message }, { status: 401 });
        }
        return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { action, username, weiboUid, weiboName, code, adminNote, authToken } = body;

        // 写操作限流：每分钟10次
        if (action) {
            const limit = rateLimit(request, `weibo:${action as string}`, 10, 60);
            if (!limit.allowed) {
                return NextResponse.json(
                    { error: "请求过于频繁，请稍后再试" },
                    { status: 429, headers: { "X-RateLimit-Reset": String(limit.resetAt) } }
                );
            }
        }

        if (!username) {
            return NextResponse.json({ error: "Missing username" }, { status: 400 });
        }

        if (action === "init" || action === "submit_code") {
            if (action === "init") {
                const { data: existing } = await supabase
                    .from("weibo_verification")
                    .select("*")
                    .eq("user_id", username)
                    .eq("status", "pending")
                    .maybeSingle();

                if (existing) {
                    return NextResponse.json({
                        success: true,
                        data: existing,
                        message: "Already has a pending verification",
                    });
                }

                const verifyCode = generateCode();

                const { data, error } = await supabase
                    .from("weibo_verification")
                    .insert({
                        user_id: username,
                        verification_code: verifyCode,
                        weibo_uid: weiboUid || null,
                        weibo_name: weiboName || null,
                        verification_mode: "manual",
                        status: "pending",
                    })
                    .select()
                    .single();

                if (error) {
                    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
                }

                return NextResponse.json({ success: true, data });
            }

            const { data, error } = await supabase
                .from("weibo_verification")
                .update({
                    weibo_uid: weiboUid,
                    weibo_name: weiboName,
                    step1_dm_sent: true,
                    updated_at: new Date().toISOString(),
                })
                .eq("user_id", username)
                .eq("status", "pending")
                .select()
                .single();

            if (error) {
                return NextResponse.json({ success: false, error: error.message }, { status: 500 });
            }

            return NextResponse.json({ success: true, data });
        }

        await requireAdmin(authToken);

        if (
            action === "admin_approve_step1" ||
            action === "admin_approve_step2" ||
            action === "admin_reject" ||
            action === "admin_approve_all"
        ) {
            if (action === "admin_approve_step1") {
                const { data, error } = await supabase
                    .from("weibo_verification")
                    .update({
                        step1_passed: true,
                        step1_passed_at: new Date().toISOString(),
                        admin_note: adminNote || "Admin approved step 1",
                        updated_at: new Date().toISOString(),
                    })
                    .eq("user_id", username)
                    .eq("status", "pending")
                    .select()
                    .single();

                if (error) {
                    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
                }

                return NextResponse.json({ success: true, data });
            }

            if (action === "admin_reject") {
                const { data, error } = await supabase
                    .from("weibo_verification")
                    .update({
                        status: "rejected",
                        admin_note: adminNote || "Admin rejected",
                        updated_at: new Date().toISOString(),
                    })
                    .eq("user_id", username)
                    .select()
                    .single();

                if (error) {
                    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
                }

                return NextResponse.json({ success: true, data });
            }

            const isAll = action === "admin_approve_all";
            const { data, error } = await supabase
                .from("weibo_verification")
                .update({
                    step1_passed: true,
                    step1_passed_at: new Date().toISOString(),
                    step2_passed: true,
                    step2_passed_at: new Date().toISOString(),
                    step2_chaohua_level: code || 0,
                    status: "verified",
                    admin_note: adminNote || (isAll ? "Admin approved all" : "Admin approved step 2"),
                    updated_at: new Date().toISOString(),
                })
                .eq("user_id", username)
                .eq("status", "pending")
                .select()
                .single();

            if (error) {
                return NextResponse.json({ success: false, error: error.message }, { status: 500 });
            }

            if (data) {
                const { data: userData } = await supabase.from("users").select("id").eq("username", username).single();

                if (userData) {
                    await generateUserInviteCodes(username, userData.id);
                    await supabase.from("users").update({ weibo_verified: true }).eq("username", username);
                }
            }

            return NextResponse.json({ success: true, data });
        }

        return NextResponse.json({ success: false, error: "Unknown action" }, { status: 400 });
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Unknown error";
        if (message === "未登录或登录已过期" || message === "需要管理员权限") {
            return NextResponse.json({ success: false, error: message }, { status: 401 });
        }
        return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
}
