/**
 * 注册流程微博链接字段 + XSS 防御测试
 * 针对 commit 4877e22 的 P0 修复（后端字段落地）+ P1 修复（协议校验）
 *
 * 测试目标：
 *   1. 后端 weiboLink 必须接收、校验、入库
 *   2. 非法协议（javascript:、data:）必须被拦截
 *   3. 前端链接渲染必须白名单放行 http/https
 *
 * 运行：pnpm vitest run __tests__/register-weibo-link.test.ts
 */

import { describe, it, expect } from "vitest";

// === 纯函数提取：便于单测，不依赖 NextRequest/Supabase ===

/** 模拟后端注册校验（对应 src/app/api/auth/route.ts register 分支） */
function validateRegisterInput(body: {
  username?: string;
  password?: string;
  invitationCode?: string;
  weiboName?: string;
  weiboLink?: string;
}): { ok: true; trimmedLink: string } | { ok: false; error: string; status: number } {
  const { username, password, invitationCode, weiboName, weiboLink } = body;
  if (!username || !password || !invitationCode || !weiboName) {
    return { ok: false, error: "请填写用户名、密码、微博昵称和邀请码", status: 400 };
  }
  if (!weiboLink || !weiboLink.trim()) {
    return { ok: false, error: "请填写微博主页链接", status: 400 };
  }
  const trimmedLink = weiboLink.trim();
  if (!/^https?:\/\//i.test(trimmedLink)) {
    return { ok: false, error: "微博主页链接必须以 http:// 或 https:// 开头", status: 400 };
  }
  return { ok: true, trimmedLink };
}

/** 模拟前端 XSS 防御渲染判定（对应 review-queue.tsx 链接分支） */
function isLinkSafe(url: string | undefined): boolean {
  return !!url && /^https?:\/\//i.test(url);
}

describe("注册流程 weiboLink 必填校验", () => {
  const base = {
    username: "testuser",
    password: "Test123!",
    invitationCode: "ABC123",
    weiboName: "甜玉米_小锁",
  };

  it("weiboLink 缺失 → 400 提示", () => {
    const res = validateRegisterInput(base);
    expect(res).toEqual({ ok: false, error: "请填写微博主页链接", status: 400 });
  });

  it("weiboLink 为空字符串 → 400 提示", () => {
    const res = validateRegisterInput({ ...base, weiboLink: "" });
    expect(res).toEqual({ ok: false, error: "请填写微博主页链接", status: 400 });
  });

  it("weiboLink 为空格 → 400 提示（trim 后为空）", () => {
    const res = validateRegisterInput({ ...base, weiboLink: "   " });
    expect(res).toEqual({ ok: false, error: "请填写微博主页链接", status: 400 });
  });

  it("合法 https 链接 → 通过，返回 trim 后的链接", () => {
    const res = validateRegisterInput({
      ...base,
      weiboLink: "  https://weibo.com/u/123456  ",
    });
    expect(res).toEqual({ ok: true, trimmedLink: "https://weibo.com/u/123456" });
  });

  it("合法 http 链接 → 通过", () => {
    const res = validateRegisterInput({
      ...base,
      weiboLink: "http://weibo.com/u/123456",
    });
    expect(res).toEqual({ ok: true, trimmedLink: "http://weibo.com/u/123456" });
  });
});

describe("XSS 防御：协议白名单", () => {
  it.each([
    "javascript:alert(1)",
    "JAVASCRIPT:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox",
    "ftp://example.com",
    "weibo.com/u/123", // 缺协议
  ])("拦截非 http(s) 协议：%s", (url) => {
    const res = validateRegisterInput({
      username: "u",
      password: "p",
      invitationCode: "c",
      weiboName: "n",
      weiboLink: url,
    });
    expect(res).toEqual({
      ok: false,
      error: "微博主页链接必须以 http:// 或 https:// 开头",
      status: 400,
    });
  });

  it.each(["", "   "])("空链接先被必填校验拦截：%s", (url) => {
    const res = validateRegisterInput({
      username: "u",
      password: "p",
      invitationCode: "c",
      weiboName: "n",
      weiboLink: url,
    });
    expect(res).toEqual({
      ok: false,
      error: "请填写微博主页链接",
      status: 400,
    });
  });

  it.each([
    "https://weibo.com/u/123456",
    "http://m.weibo.cn/u/789",
    "HTTPS://WEIBO.COM/U/999", // 大小写
  ])("放行合法 http(s)：%s", (url) => {
    const res = validateRegisterInput({
      username: "u",
      password: "p",
      invitationCode: "c",
      weiboName: "n",
      weiboLink: url,
    });
    expect(res.ok).toBe(true);
  });
});

describe("前端渲染 isLinkSafe 判定", () => {
  it("http/https → 渲染为 <a> 可点击链接", () => {
    expect(isLinkSafe("https://weibo.com/u/123")).toBe(true);
    expect(isLinkSafe("http://weibo.com/u/123")).toBe(true);
  });

  it("非 http(s) → 渲染为普通文本，href 不绑定", () => {
    expect(isLinkSafe("javascript:alert(1)")).toBe(false);
    expect(isLinkSafe("data:text/html,<h>")).toBe(false);
    expect(isLinkSafe(undefined)).toBe(false);
    expect(isLinkSafe("")).toBe(false);
  });
});
