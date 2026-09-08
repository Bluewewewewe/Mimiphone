-- =============================================================
-- 迷你小作坊（开团平台）Supabase Schema
-- 依赖：supabase-schema-v2.sql 中的 public.users 表
-- 说明：服务端使用 SERVICE ROLE KEY 访问，RLS 对所有表 DENY ALL，
--       匿名/普通 key 无法读写，所有鉴权在 Next.js API 层完成。
-- 幂等：可重复执行（IF NOT EXISTS / ON CONFLICT DO NOTHING）
-- =============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- -------------------------------------------------------------
-- 1. 团（开团批次）
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workshop_groups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    leader_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    leader_name TEXT NOT NULL DEFAULT '',
    start_at TIMESTAMPTZ,
    end_at TIMESTAMPTZ,
    max_products INTEGER NOT NULL DEFAULT 5,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -------------------------------------------------------------
-- 2. 团长（与 users 一对一）
--    user_id 唯一：一个用户最多一条团长档案
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workshop_leaders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
    user_name TEXT NOT NULL DEFAULT '',
    group_ids UUID[] NOT NULL DEFAULT '{}',
    expires_at TIMESTAMPTZ,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -------------------------------------------------------------
-- 3. 团长申请
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workshop_applications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    user_name TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    reviewed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_workshop_applications_user ON public.workshop_applications(user_id);
CREATE INDEX IF NOT EXISTS idx_workshop_applications_status ON public.workshop_applications(status);

-- -------------------------------------------------------------
-- 4. 商品编号序列（WS-10001 起）
--    nextval 在事务内原子递增，避免并发重号
-- -------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS public.workshop_product_code_seq START WITH 10001 INCREMENT BY 1;

-- -------------------------------------------------------------
-- 5. 商品（制品）
--    status: pending(待审核) / active(已上架) / gray(置灰) / offline(下架)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workshop_products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code_num INTEGER NOT NULL DEFAULT nextval('public.workshop_product_code_seq'),
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    image_url TEXT NOT NULL DEFAULT '',
    contact_image_url TEXT NOT NULL DEFAULT '',
    price TEXT NOT NULL DEFAULT '',
    group_id UUID REFERENCES public.workshop_groups(id) ON DELETE SET NULL,
    category TEXT NOT NULL DEFAULT '',          -- 大类，如「娃娃」
    sub_category TEXT NOT NULL DEFAULT '',     -- 小类，如「10cm娃」
    has_question BOOLEAN NOT NULL DEFAULT false,
    question TEXT NOT NULL DEFAULT '',
    answer TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'gray', 'offline')),
    want_count INTEGER NOT NULL DEFAULT 0,
    leader_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    leader_name TEXT NOT NULL DEFAULT '',
    listed_until TIMESTAMPTZ,
    reviewed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- code_num 唯一：即使历史数据也不允许重号
CREATE UNIQUE INDEX IF NOT EXISTS uq_workshop_products_code_num ON public.workshop_products(code_num);
CREATE INDEX IF NOT EXISTS idx_workshop_products_group ON public.workshop_products(group_id);
CREATE INDEX IF NOT EXISTS idx_workshop_products_status ON public.workshop_products(status);
CREATE INDEX IF NOT EXISTS idx_workshop_products_leader ON public.workshop_products(leader_user_id);

-- 商品编号显示格式（WS-10001）由 API/前端格式化；DB 只存数字

-- -------------------------------------------------------------
-- 6. 想要记录（user × product 联合唯一，toggle 语义）
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workshop_wants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.workshop_products(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, product_id)
);
CREATE INDEX IF NOT EXISTS idx_workshop_wants_product ON public.workshop_wants(product_id);

-- -------------------------------------------------------------
-- 7. 分类（大类 + 小类数组）
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workshop_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL UNIQUE,
    subs TEXT[] NOT NULL DEFAULT '{}',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 默认分类（幂等）
INSERT INTO public.workshop_categories (name, subs, sort_order)
VALUES
    ('娃娃', ARRAY['10cm娃', '15cm娃', '20cm娃'], 1),
    ('饰品', ARRAY['发饰', '挂件', '其他'], 2)
ON CONFLICT (name) DO NOTHING;

-- -------------------------------------------------------------
-- 8. 轮播配置（单行表，id 固定为 'default'）
--    custom_count: 自定义位数量 0-5；custom_ids: 商品 UUID 有序数组；
--    banners: { productId: bannerUrl }
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workshop_carousel_config (
    id TEXT PRIMARY KEY DEFAULT 'default',
    custom_count INTEGER NOT NULL DEFAULT 0 CHECK (custom_count BETWEEN 0 AND 5),
    custom_ids UUID[] NOT NULL DEFAULT '{}',
    banners JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.workshop_carousel_config (id) VALUES ('default') ON CONFLICT (id) DO NOTHING;

-- -------------------------------------------------------------
-- 9. updated_at 自动刷新触发器
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'workshop_groups',
        'workshop_leaders',
        'workshop_applications',
        'workshop_products',
        'workshop_categories',
        'workshop_carousel_config'
    ]
    LOOP
        EXECUTE format('
            DROP TRIGGER IF EXISTS trg_%I_updated_at ON public.%I;
            CREATE TRIGGER trg_%I_updated_at
            BEFORE UPDATE ON public.%I
            FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
        ', t, t, t, t);
    END LOOP;
END $$;

-- -------------------------------------------------------------
-- 10. RLS：全部启用但不写放行策略 → 仅 SERVICE ROLE KEY 可访问
--     （与项目其他表一致，服务端绕过 RLS）
-- -------------------------------------------------------------
DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'workshop_groups',
        'workshop_leaders',
        'workshop_applications',
        'workshop_products',
        'workshop_wants',
        'workshop_categories',
        'workshop_carousel_config'
    ]
    LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    END LOOP;
END $$;
