# Code Review Report

## Summary

| Metric | Value |
|--------|-------|
| Repository | /Coze/Drive/屁屁/所有对话/主对话/米米宇宙代码审查/repo-main |
| Mode | range |
| Files Processed | 5/5 (reviewed:5 skipped:0) |
| Issues Found | 4 (P0:2 P1:1 P2:0 P3:1) |

## Issues by Priority

### P0 — Must Fix (2)

#### 1. [接口与集成设计 > 参数/返回值/契约与幂等性] src/app/api/admin/review-queue/route.ts:68-68
**问题**: 本接口 list_pending 查询使用的列名 nickname / weibo_nickname / weibo_screenshot_url / weibo_level 与 supabase-schema-v2.sql 中 users 表的真实列名（weibo_name，无 nickname / weibo_nickname 等列）不一致，只有 weibo_link 在 schema 中存在。若线上库严格按 schema v2 建立，该 select 会因「列不存在」直接报错（usersError 分支返回 500），审核队列页无法加载待审用户。即便线上库靠 ALTER 补齐了旧列、当前未报错，代码列名与 schema 文件长期不一致会持续误导新成员。

**修复建议**: 核对线上 users 表真实列名（Supabase 表编辑器），并把查询列名统一到 schema 定义；若线上确有 nickname/weibo_nickname 旧列，应在 schema 文件中补齐或做迁移统一命名，消除代码与 schema 的漂移。

**证据**: diff '+' line 68 select 新增 weibo_link，但同行仍 select nickname, weibo_nickname, weibo_screenshot_url；schema v2 users 表仅有 weibo_name、weibo_link，无 nickname/weibo_nickname/weibo_screenshot_url/weibo_level。

---

#### 2. [功能正确性与健壮性 > 业务规则与领域逻辑及异常处理] src/app/api/auth/route.ts:590-590
**问题**: 本 commit 让注册用户填写「微博主页链接」（前端已必填并随注册请求体发送 weiboLink，登录/校验/list_users 也已返回 weiboLink），但 register 分支根本没有落地该字段：① 请求体解构（269-295 行）没有 weiboLink；② 注册必填校验（326 行）只校验 username/password/invitationCode/weiboName，不校验 weiboLink；③ 注册 INSERT（406-415 行）没有 weibo_link 列。结果：用户在注册页填了链接、后端静默丢弃，数据库永远为 NULL，审核队列和登录返回的 weiboLink 恒为空字符串。功能链路在后端断开，属于「前端做了、后端没接」的半拉子功能。

**修复建议**: 在 register 分支补齐三处：1) body 解构加入 weiboLink；2) 必填校验加入 weiboLink；3) users 表 INSERT 加入 weibo_link 字段。示例：

**证据**: diff '+' line 590 新增登录返回 weiboLink: user.weibo_link || ""；但 register 的 INSERT（source 406-415 行）只有 username/password/display_name/weibo_name/role/status/invite_code_used/referrer_id，无 weibo_link；body 解构（269-295 行）无 weiboLink；前端 page.tsx diff '+' 行已发送 weiboLink 且必填校验。

---

### P1 — Should Fix (1)

#### 1. [安全性 > 注入/解析与反序列化漏洞] src/components/admin/review-queue.tsx:368-374
**问题**: 微博链接来自待审核用户提交的内容（user-controlled），直接作为 <a href={u.weibo_link}> 渲染，后端未做任何 URL 协议校验。若用户把链接填成 javascript:xxx 或 data:text/html 脚本，管理员点击链接时脚本会在管理后台页面上下文执行（存储型 XSS），可窃取管理员 token、越权操作审核/封禁。注册后端也没有对 weiboLink 做格式/协议校验，等于入口不设防。

**修复建议**: 渲染前校验协议白名单，只允许 http/https；非白名单不渲染为可点击链接。示例：

**证据**: diff '+' lines 364-376：{u.weibo_link && (<a href={u.weibo_link} target="_blank" ...>)}，weibo_link 为用户注册提交、后端原样存储返回，无协议校验。

```suggestion
                          <a
                            href={/^https?:\/\//i.test(u.weibo_link) ? u.weibo_link : undefined}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="max-w-[200px] truncate text-indigo-300 underline hover:text-indigo-200"
                            title={u.weibo_link}
                          >
                            {u.weibo_link}
                          </a>
```

---

### P2 — Nice to Fix (0)

无。

### P3 — Suggestion (1)

#### 1. [功能正确性与健壮性 > 业务规则与领域逻辑及异常处理] src/components/admin/review-queue.tsx:377-384
**问题**: 「复制」按钮点击后 navigator.clipboard.writeText 的成功/失败都没有任何用户反馈（成功不提示、catch 里只有空注释 // fallback）。管理员点了复制不知道是否成功，且 clipboard API 在非 HTTPS 或无权限环境会 reject，静默失败体验差。

**修复建议**: 复制成功后给一个轻量提示（如按钮文字临时变「已复制」或 toast），catch 里降级为提示手动复制。

**证据**: diff '+' lines 377-384：onClick 内 try { await navigator.clipboard.writeText(u.weibo_link || ""); } catch { // fallback }，无任何 UI 反馈。

---

## File Summary

| File | Status | Issues | P0 | P1 | P2 | P3 |
|------|--------|--------|----|----|----|----|
| src/app/api/admin/review-queue/route.ts | completed | 1 | 1 | 0 | 0 | 0 |
| src/app/api/admin/tree/route.ts | completed | 0 | 0 | 0 | 0 | 0 |
| src/app/api/auth/route.ts | completed | 1 | 1 | 0 | 0 | 0 |
| src/app/phone/page.tsx | completed | 0 | 0 | 0 | 0 | 0 |
| src/components/admin/review-queue.tsx | completed | 2 | 0 | 1 | 0 | 1 |
