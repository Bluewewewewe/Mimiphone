-- =====================================================
-- pickup_tags 补充 creator_id 字段
-- =====================================================
alter table pickup_tags
  add column if not exists creator_id uuid;

-- 回填：历史自建标签无法知道创建者，保留 NULL 即可（系统标签语义）
