-- =====================================================
-- 米米请就位（pickup）演绎楼 Supabase 建表脚本
-- 执行顺序：依次在 Supabase Dashboard → SQL Editor 里运行
-- =====================================================

-- 1. 帖子表
create table if not exists pickup_posts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,              -- 发帖人（真实账号 id）
  owner_username text not null,        -- 英文登录名
  owner_display text not null,         -- 显示昵称
  owner_emoji text default '🐰',       -- 发帖人 emoji
  title text not null,
  content text not null,
  tag_ids text[] default '{}',         -- 标签 id 数组
  identity_required boolean default true,  -- 是否要求演绎身份
  host_label text default '楼主',      -- 自定义"楼主"称呼
  status text default 'active',        -- active / hidden / deleted
  likes_count int default 0,
  replies_count int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_pickup_posts_owner on pickup_posts(owner_id);
create index if not exists idx_pickup_posts_status on pickup_posts(status);
create index if not exists idx_pickup_posts_pending
  on pickup_posts(status, created_at desc) where status = 'pending';
create index if not exists idx_pickup_posts_assigned
  on pickup_posts(assigned_to) where status = 'pending';
create index if not exists idx_pickup_posts_tag on pickup_posts using gin(tag_ids);
create index if not exists idx_pickup_posts_created on pickup_posts(created_at desc);

-- 2. 楼层回复表
create table if not exists pickup_replies (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references pickup_posts(id) on delete cascade,
  author_id uuid not null,
  author_username text not null,
  author_display text not null,
  author_emoji text default '🐰',
  floor_no int not null,               -- 楼层号 1,2,3...
  content text not null,
  status text default 'active',        -- active / hidden / deleted
  likes_count int default 0,
  sub_replies_count int default 0,     -- 用于热度排序
  has_host_reply boolean default false,-- 子回复中是否有楼主发言（用于外显指引）
  created_at timestamptz default now()
);

create index if not exists idx_pickup_replies_post on pickup_replies(post_id);
create index if not exists idx_pickup_replies_post_created on pickup_replies(post_id, created_at);
create index if not exists idx_pickup_replies_post_floor on pickup_replies(post_id, floor_no);
create unique index if not exists idx_pickup_replies_post_floor_uq on pickup_replies(post_id, floor_no);

-- 3. 子回复表（楼层内评论）
create table if not exists pickup_sub_replies (
  id uuid primary key default gen_random_uuid(),
  reply_id uuid not null references pickup_replies(id) on delete cascade,
  post_id uuid not null references pickup_posts(id) on delete cascade,
  author_id uuid not null,
  author_username text not null,
  author_display text not null,
  author_emoji text default '🐰',
  reply_to_username text,              -- @ 的对象
  reply_to_display text,
  content text not null,
  is_host_reply boolean default false, -- 是否楼主回复（true 置顶）
  sort_index int default 0,            -- 排序：0=楼主置顶，>0 按热度降序
  likes_count int default 0,
  sub_sub_replies_count int default 0,
  status text default 'active',
  created_at timestamptz default now()
);

create index if not exists idx_pickup_sub_replies_reply on pickup_sub_replies(reply_id);
create index if not exists idx_pickup_sub_replies_post on pickup_sub_replies(post_id);

-- 4. 标签表
create table if not exists pickup_tags (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,           -- 标签名（带#）
  use_count int default 0,             -- 使用次数（发帖时 +1）
  approved boolean default true,       -- false 表示自建待审核
  creator_id uuid,                     -- 创建者（系统预置标签为 NULL）
  merged_into uuid,                    -- 被合并到哪个标签（NULL=正常标签）
  created_at timestamptz default now()
);

create index if not exists idx_pickup_tags_approved on pickup_tags(approved, use_count desc);

-- 5. 举报表
create table if not exists pickup_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null,
  target_type text not null,           -- post / reply / sub_reply / tag
  target_id uuid not null,
  post_id uuid,                        -- 关联帖子（方便审核）
  reply_id uuid,
  floor_no int,                        -- 楼层号
  reason text not null,                -- 引战/涉黄/剧透/广告/政治敏感/其他
  description text,                    -- 补充说明
  status text default 'pending',       -- pending / approved(通过举报) / rejected
  handled_by uuid,                     -- 管理员 id
  handled_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists idx_pickup_reports_status on pickup_reports(status);
create index if not exists idx_pickup_reports_target on pickup_reports(target_type, target_id);

-- 6. 楼内身份锁定表
create table if not exists pickup_identities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  post_id uuid not null references pickup_posts(id) on delete cascade,
  display_name text not null,          -- 演绎角色名
  emoji text default '🐰',
  created_at timestamptz default now(),
  unique(user_id, post_id)             -- 每人每楼唯一身份
);

create index if not exists idx_pickup_identities_user on pickup_identities(user_id);
create index if not exists idx_pickup_identities_post on pickup_identities(post_id);
-- 通知表
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,                    -- 接收人 id
  type text not null,                       -- reply / mention / report_result / admin_action / system_announce / admin_custom / version
  title text not null,
  content text default '',
  related_post_id uuid,
  related_reply_id uuid,
  extra jsonb default '{}'::jsonb,          -- 扩展字段
  read_at timestamptz,
  created_at timestamptz default now()
);
create index if not exists idx_notif_user_read on notifications(user_id, read_at desc);
create index if not exists idx_notif_created on notifications(created_at desc);

-- 版本日志表
create table if not exists app_versions (
  id uuid primary key default gen_random_uuid(),
  version text not null unique,              -- 如 "1.1.0"
  title text not null,                       -- 如 "演绎楼上线"
  content text not null,                     -- markdown/纯文本
  type text default 'feature',               -- feature / fix / announce
  show_in_popup boolean default true,        -- 是否在桌面弹窗展示
  popup_text text,                           -- 弹窗里的简短文案（可选，空则用 content）
  published_at timestamptz default now()
);
create index if not exists idx_versions_published on app_versions(published_at desc);
