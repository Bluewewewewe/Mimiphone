# 米米宇宙兑换码系统

## 功能概述

用户可在「设置 → 兑换码」输入兑换码兑换米米币；管理员可在管理后台「兑换码管理」创建、查看、禁用、删除兑换码及查看兑换记录。

## 文件清单

| 文件 | 说明 |
|------|------|
| `src/lib/redeem.ts` | 纯业务逻辑（生成码、验证、输入校验、金额计算） |
| `src/app/api/redeem/route.ts` | 用户端 API（verify / redeem） |
| `src/app/api/admin/redeem/route.ts` | 管理员端 API（create / list_codes / list_logs / toggle_status / delete） |
| `src/components/admin-app.tsx` | 管理后台 — 新增 `RedeemModule` 组件 |
| `src/app/phone/page.tsx` | 用户端 — 新增 `RedeemCodePage` 组件 + 设置入口 |
| `supabase-redeem-schema.sql` | 数据库迁移 SQL（幂等，IF NOT EXISTS） |
| `__tests__/redeem.test.ts` | 纯函数单元测试（40+ 用例） |

## 数据库设计

### `redeem_codes` 表

| 字段 | 类型 | 说明 |
|------|------|------|
| `code` | TEXT PK | 兑换码字符串 |
| `reward_amount` | INTEGER | 每次兑换奖励米米币数 |
| `max_uses` | INTEGER | 总可用次数 |
| `used_count` | INTEGER | 已使用次数 |
| `status` | TEXT | `active` / `disabled` |
| `expires_at` | TIMESTAMPTZ | 过期时间（可选） |
| `created_by` | TEXT | 创建者 user_id |
| `created_at` | TIMESTAMPTZ | 创建时间 |

### `redeem_logs` 表

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | TEXT PK | UUID |
| `code` | TEXT FK | 兑换码 |
| `user_id` | TEXT | 兑换用户 |
| `amount` | INTEGER | 本次奖励数量 |
| `redeemed_at` | TIMESTAMPTZ | 兑换时间 |

### `users` 表新增字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `mimi_coins` | INTEGER DEFAULT 0 | 用户米米币余额 |

## API 接口

### 用户端 `POST /api/redeem`

| action | 参数 | 返回 |
|--------|------|------|
| `verify` | `code` | 验证兑换码有效性，返回奖励金额和剩余次数 |
| `redeem` | `code` | 执行兑换，增加用户 mimi_coins |

需要 Bearer Token 认证。

### 管理端 `POST /api/admin/redeem`

| action | 参数 | 返回 |
|--------|------|------|
| `create` | `customCode?`, `rewardAmount`, `maxUses`, `expiresInDays?` | 创建兑换码 |
| `list_codes` | — | 查询所有兑换码列表 |
| `list_logs` | `code?`, `userId?`, `page?`, `pageSize?` | 查询兑换记录 |
| `toggle_status` | `code`, `status` | 启用/禁用兑换码 |
| `delete` | `code` | 删除兑换码及其记录 |

需要管理员权限。

## 部署步骤

1. **执行数据库迁移**：在 Supabase SQL Editor 中运行 `supabase-redeem-schema.sql`
2. **部署代码**：正常部署即可，新增的 API 路由会自动注册
3. **测试**：安装依赖后运行 `npx vitest run __tests__/redeem.test.ts`

## 兑换流程

```
用户输入兑换码
    → POST /api/redeem (action: verify)
    → 展示奖励预览
    → 用户确认
    → POST /api/redeem (action: redeem)
    → mimi_coins += reward_amount
    → 写入 redeem_logs
    → 更新 redeem_codes.used_count
```

## 约束规则

- 一个用户对同一个码最多兑换 `max_uses` 次（`max_uses=1` 则只能兑一次）
- 禁用的码不可兑换
- 过期的码不可兑换
- 达到 `max_uses` 上限的码不可兑换
- 自定义码不可与已有码重复
