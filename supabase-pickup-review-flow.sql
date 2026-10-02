-- =====================================================
-- pickup 审核流增强（增量迁移）
-- =====================================================

-- 帖子支持 pending 状态（无需 alter，status 是 text，直接写入即可）

-- 标签支持「合并到另一个标签」
alter table pickup_tags
  add column if not exists merged_into uuid;

-- 待审帖子索引（管理员队列）
create index if not exists idx_pickup_posts_pending
  on pickup_posts(status, created_at desc)
  where status = 'pending';
