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
