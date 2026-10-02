-- =====================================================
-- 论坛发言审核 + 内容指派（增量迁移）
-- 在已有的 forum_posts / pickup_posts 表上执行
-- =====================================================

-- 1. 论坛帖子状态与审核字段
alter table forum_posts
  add column if not exists post_status text default 'active';  -- active / pending
alter table forum_posts
  add column if not exists assigned_to uuid;                   -- 当前负责审核的管理员
alter table forum_posts
  add column if not exists reviewed_by uuid;
alter table forum_posts
  add column if not exists reviewed_at timestamptz;

-- 存量帖子全部视为 active
update forum_posts set post_status = 'active' where post_status is null;

create index if not exists idx_forum_posts_pending
  on forum_posts(post_status, created_at) where post_status = 'pending';
create index if not exists idx_forum_posts_assigned
  on forum_posts(assigned_to) where post_status = 'pending';

-- 2. 请就位待审楼的指派字段
alter table pickup_posts
  add column if not exists assigned_to uuid;
alter table pickup_posts
  add column if not exists reviewed_by uuid;
alter table pickup_posts
  add column if not exists reviewed_at timestamptz;

create index if not exists idx_pickup_posts_assigned
  on pickup_posts(assigned_to) where status = 'pending';
