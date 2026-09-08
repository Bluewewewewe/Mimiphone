-- ============================================================
-- 审核中心 Migration — 幂等脚本
-- 可直接在 Supabase SQL Editor 执行
-- ============================================================

-- 1. users 表新增两级审核字段
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS review_level INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS first_reviewed_by UUID REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS first_reviewed_at TIMESTAMPTZ;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS second_reviewed_by UUID REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS second_reviewed_at TIMESTAMPTZ;

-- 索引
CREATE INDEX IF NOT EXISTS idx_users_review_level ON public.users(review_level);
CREATE INDEX IF NOT EXISTS idx_users_grace_period_end ON public.users(grace_period_end) WHERE review_level = 1;
CREATE INDEX IF NOT EXISTS idx_users_first_reviewed_by ON public.users(first_reviewed_by);

-- RLS 策略（与项目一致：service_role 全量放行）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'service_users_review_center' AND tablename = 'users'
  ) THEN
    -- 已有 service_role 全量策略则无需新建
    -- 此处仅作占位，实际 RLS 依赖已有 service_users_all 策略
    NULL;
  END IF;
END $$;

-- 2. 课程表
CREATE TABLE IF NOT EXISTS public.course_schedules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  description TEXT,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  repeat_type VARCHAR NOT NULL DEFAULT 'none' CHECK (repeat_type IN ('none', 'daily', 'weekly', 'monthly')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_course_schedules_start_time ON public.course_schedules(start_time);
CREATE INDEX IF NOT EXISTS idx_course_schedules_created_by ON public.course_schedules(created_by);

-- RLS for course_schedules
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'service_course_schedules_all' AND tablename = 'course_schedules'
  ) THEN
    CREATE POLICY service_course_schedules_all ON public.course_schedules
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;
