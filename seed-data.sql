-- 米米宇宙初始数据 Seed
-- 说明：
--   1. 管理员账号不在这里硬编码密码，首次启动时后端会根据 BOOTSTRAP_ADMIN_USERNAME/BOOTSTRAP_ADMIN_PASSWORD 环境变量自动创建。
--   2. 本文件只插入示例公告和 Bug 反馈帖，便于部署后立刻看到论坛效果。
--   3. 所有 INSERT 均使用 ON CONFLICT DO NOTHING，可重复执行不会报错。

-- 系统账号（用于发布公告和示例帖，不可登录）
INSERT INTO public.users (id, username, password_hash, weibo_name, role, status, user_bio, created_at, updated_at)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'system',
    '$2a$10$system.placeholder.hash.not.for.login',
    '@米米官方',
    'admin',
    'approved',
    '米米小作坊官方系统账号',
    now(),
    now()
)
ON CONFLICT (id) DO NOTHING;

-- 官方示例公告
INSERT INTO public.forum_posts (id, author_id, author_name, title, content, section, is_pinned, is_essence, likes, replies, favorites, created_at, updated_at)
VALUES (
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000001',
    '米米官方',
    '📢 欢迎来到米米小作坊',
    E'亲爱的小伙伴们：\n\n欢迎来到「米米小作坊」内测！这里是一个充满爱意的家庭向互动社区。\n\n📌 内测须知：\n1. 当前为内测阶段，数据可能会根据需要进行调整。\n2. 请文明发言，友善交流。\n3. 遇到 Bug 请前往「Bug 反馈」板块提交，管理员会尽快处理。\n4. 邀请码珍贵，请勿随意外传。\n\n祝大家玩得开心！',
    'announce',
    true,
    true,
    0,
    0,
    0,
    now(),
    now()
)
ON CONFLICT (id) DO NOTHING;

-- Bug 反馈示例帖
INSERT INTO public.forum_posts (id, author_id, author_name, title, content, section, is_pinned, is_essence, likes, replies, favorites, bug_status, created_at, updated_at)
VALUES (
    '00000000-0000-0000-0000-000000000102',
    '00000000-0000-0000-0000-000000000001',
    '米米官方',
    '🐛 Bug 反馈格式示例',
    E'这是一个 Bug 反馈帖的格式示例。\n\n提交 Bug 时建议包含：\n1. 问题描述：简明扼要地说明遇到什么 Bug。\n2. 复现步骤：如何一步步触发这个问题。\n3. 期望结果：正常情况下应该看到什么。\n4. 实际结果：实际上发生了什么。\n5. 环境信息：浏览器/手机型号/网络环境等。\n\n管理员会在此帖回复并更新状态标签。',
    'bug-report',
    false,
    false,
    0,
    0,
    0,
    'pending',
    now(),
    now()
)
ON CONFLICT (id) DO NOTHING;
