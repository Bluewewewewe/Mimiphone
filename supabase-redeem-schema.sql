-- ========== 米米币兑换码系统 Migration ==========
-- 幂等执行，可安全重复运行

-- 1. 兑换码表
CREATE TABLE IF NOT EXISTS redeem_codes (
  code        TEXT PRIMARY KEY,
  reward_amount INTEGER NOT NULL DEFAULT 0,
  max_uses    INTEGER NOT NULL DEFAULT 1,
  used_count  INTEGER NOT NULL DEFAULT 0,
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  expires_at  TIMESTAMPTZ,
  created_by  TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. 兑换记录表
CREATE TABLE IF NOT EXISTS redeem_logs (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  code        TEXT NOT NULL REFERENCES redeem_codes(code),
  user_id     TEXT NOT NULL,
  amount      INTEGER NOT NULL,
  redeemed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_redeem_logs_code ON redeem_logs(code);
CREATE INDEX IF NOT EXISTS idx_redeem_logs_user_id ON redeem_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_redeem_logs_redeemed_at ON redeem_logs(redeemed_at DESC);

-- 3. 用户表新增 mimi_coins 字段（如果不存在）
ALTER TABLE users ADD COLUMN IF NOT EXISTS mimi_coins INTEGER NOT NULL DEFAULT 0;
