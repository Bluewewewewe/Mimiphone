-- =============================================================
-- 独立「应用管理」App（B 方案权限模型）Supabase Schema
-- 依赖：supabase-schema-v2.sql 中的 public.users / public.apps /
--       public.app_beta_codes 表
-- 说明：服务端使用 SERVICE ROLE KEY 访问，RLS 对所有表 DENY ALL，
--       匿名/普通 key 无法读写，所有鉴权在 Next.js API 层完成。
-- 幂等：可重复执行（IF NOT EXISTS / ON CONFLICT DO NOTHING /
--       DROP ... IF EXISTS 后重建约束/触发器）
-- =============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- -------------------------------------------------------------
-- 1. 小管理分配表：app × user 多对多
--    app_id 关联 apps.app_id（TEXT 业务标识，随应用删除级联）
--    user_id 关联 users.id（UUID，随用户删除级联）
--    一个 (app_id, user_id) 组合唯一，重复分配被 upsert 拦截
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.app_managers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    app_id TEXT NOT NULL REFERENCES public.apps(app_id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    username TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (app_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_app_managers_app ON public.app_managers(app_id);
CREATE INDEX IF NOT EXISTS idx_app_managers_user ON public.app_managers(user_id);

-- -------------------------------------------------------------
-- 2. apps 表字段补齐（StoreAppItem 实际使用列）
--    早期建表语句缺列时幂等补齐；已存在则跳过。
-- -------------------------------------------------------------
DO $$
BEGIN
    -- 排序权重（商店/管理列表展示顺序，0 起）
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'public' AND table_name = 'apps'
                   AND column_name = 'order') THEN
        ALTER TABLE public.apps ADD COLUMN "order" INTEGER NOT NULL DEFAULT 0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'public' AND table_name = 'apps'
                   AND column_name = 'route') THEN
        ALTER TABLE public.apps ADD COLUMN route TEXT NOT NULL DEFAULT '';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'public' AND table_name = 'apps'
                   AND column_name = 'is_external') THEN
        ALTER TABLE public.apps ADD COLUMN is_external BOOLEAN NOT NULL DEFAULT false;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'public' AND table_name = 'apps'
                   AND column_name = 'beta_info') THEN
        ALTER TABLE public.apps ADD COLUMN beta_info TEXT NOT NULL DEFAULT '';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'public' AND table_name = 'apps'
                   AND column_name = 'beta_slots') THEN
        ALTER TABLE public.apps ADD COLUMN beta_slots INTEGER NOT NULL DEFAULT 0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'public' AND table_name = 'apps'
                   AND column_name = 'beta_used_slots') THEN
        ALTER TABLE public.apps ADD COLUMN beta_used_slots INTEGER NOT NULL DEFAULT 0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'public' AND table_name = 'apps'
                   AND column_name = 'screenshots') THEN
        ALTER TABLE public.apps ADD COLUMN screenshots TEXT[] NOT NULL DEFAULT '{}';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'public' AND table_name = 'apps'
                   AND column_name = 'expected_release') THEN
        ALTER TABLE public.apps ADD COLUMN expected_release TIMESTAMPTZ;
    END IF;

END $$;

-- status 校验约束：代码中状态为 hidden/dev/beta/published；
-- 兼容历史值 'development'。先删除 apps.status 上的旧 CHECK（幂等），
-- 再创建统一约束（同名存在时跳过）。
DO $$
DECLARE
    c RECORD;
BEGIN
    FOR c IN
        SELECT con.conname
        FROM pg_constraint con
        JOIN pg_class t ON t.oid = con.conrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = 'public' AND t.relname = 'apps' AND con.contype = 'c'
    LOOP
        EXECUTE format('ALTER TABLE public.apps DROP CONSTRAINT IF EXISTS %I', c.conname);
    END LOOP;

    ALTER TABLE public.apps
        ADD CONSTRAINT apps_status_check
        CHECK (status IN ('hidden', 'dev', 'development', 'beta', 'published'));
END $$;

-- 历史 'development' 状态归一为 'dev'（重复执行安全）
UPDATE public.apps SET status = 'dev' WHERE status = 'development';

-- order 为 NULL 的历史数据按 name 补齐排序值
UPDATE public.apps SET "order" = 0 WHERE "order" IS NULL;

CREATE INDEX IF NOT EXISTS idx_apps_order ON public.apps("order");

-- -------------------------------------------------------------
-- 3. updated_at 自动刷新触发器（apps / app_managers）
--    复用 supabase-schema-v2.sql 中的同名函数，缺失时创建。
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_apps_updated_at ON public.apps;
CREATE TRIGGER update_apps_updated_at BEFORE UPDATE ON public.apps
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- -------------------------------------------------------------
-- 4. RLS：启用行级安全 + service_role 全量放行策略
--     （与项目其他表一致：SERVICE ROLE KEY 走策略/绕过 RLS，
--       匿名/普通 key 无策略可读 → 读写被拒；鉴权在 Next.js API 层完成）
-- -------------------------------------------------------------
ALTER TABLE public.app_managers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.apps ENABLE ROW LEVEL SECURITY;

-- service_role 全量策略（IF NOT EXISTS 幂等；apps 的同名策略在 v2 已建时跳过）
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'app_managers' AND policyname = 'service_app_managers_all') THEN
        CREATE POLICY service_app_managers_all ON public.app_managers
            FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'apps' AND policyname = 'service_apps_all') THEN
        CREATE POLICY service_apps_all ON public.apps
            FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
END $$;
