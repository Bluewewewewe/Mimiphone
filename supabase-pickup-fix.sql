-- =====================================================
-- 修复存量 pickup 数据
-- 1. host_label = '楼主' 的历史数据，改为主人的论坛昵称
-- 2. owner_display 若错误地存成了 username（拼音账号），同步修正
-- =====================================================

-- 修复 owner_display（从 users 表回填）
update pickup_posts p
set owner_display = coalesce(u.display_name, u.username, p.owner_display)
from users u
where p.owner_id = u.id
  and (
    p.owner_display = p.owner_username
    or p.owner_display is null
  );

-- 修复 host_label：原来错误地存成"楼主"两字，改为楼主论坛昵称
update pickup_posts p
set host_label = coalesce(u.display_name, u.username, p.host_label)
from users u
where p.owner_id = u.id
  and (p.host_label = '楼主' or p.host_label is null or p.host_label = '');

-- 修复楼层回复的 author_display（拼音账号名 → 论坛昵称）
-- 注意：pickup_identities 里锁定了演绎身份的用户不改，只改没有身份记录的
update pickup_replies r
set author_display = coalesce(u.display_name, u.username, r.author_display)
from users u
where r.author_id = u.id
  and not exists (
    select 1 from pickup_identities pi
    where pi.user_id = r.author_id and pi.post_id = r.post_id
  )
  and r.author_display = r.author_username;

-- 修复子回复的 author_display
update pickup_sub_replies sr
set author_display = coalesce(u.display_name, u.username, sr.author_display)
from users u
where sr.author_id = u.id
  and not exists (
    select 1 from pickup_identities pi
    where pi.user_id = sr.author_id and pi.post_id = sr.post_id
  )
  and sr.author_display = sr.author_username;
