// ========== 米米币兑换码系统 — 纯业务逻辑 ==========

export type RedeemCodeStatus = "active" | "disabled";

export interface RedeemCode {
  code: string;
  reward_amount: number;
  max_uses: number;
  used_count: number;
  status: RedeemCodeStatus;
  expires_at: string | null;
  created_by: string;
  created_at: string;
}

export interface RedeemLog {
  id: string;
  code: string;
  user_id: string;
  amount: number;
  redeemed_at: string;
}

export interface VerifyCodeResult {
  valid: boolean;
  error?: string;
  code?: RedeemCode;
  remainingUses?: number;
}

export interface RedeemResult {
  success: boolean;
  error?: string;
  amount?: number;
  remainingUses?: number;
}

// ========== 兑换码生成 ==========

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 12;
const CODE_PREFIX = "MIMI-";

export function generateRedeemCode(): string {
  let result = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    result += CODE_CHARS.charAt(Math.floor(Math.random() * CODE_CHARS.length));
  }
  return `${CODE_PREFIX}${result}`;
}

export function normalizeCode(input: string): string {
  return input.trim().toUpperCase();
}

// ========== 验证码逻辑（纯函数） ==========

export function verifyCodeLogic(
  code: RedeemCode | null,
  now: Date = new Date()
): VerifyCodeResult {
  if (!code) {
    return { valid: false, error: "兑换码不存在" };
  }

  if (code.status === "disabled") {
    return { valid: false, error: "兑换码已禁用" };
  }

  if (code.expires_at && new Date(code.expires_at) <= now) {
    return { valid: false, error: "兑换码已过期" };
  }

  if (code.used_count >= code.max_uses) {
    return { valid: false, error: "兑换码已达到最大使用次数" };
  }

  const remainingUses = code.max_uses - code.used_count;
  return { valid: true, code, remainingUses };
}

// ========== 兑换逻辑（纯函数） ==========

export function calculateRedeemAmount(rewardAmount: number): number {
  if (rewardAmount <= 0) return 0;
  return rewardAmount;
}

export function calculateNewBalance(
  currentBalance: number,
  rewardAmount: number
): number {
  return currentBalance + rewardAmount;
}

export function canUserRedeem(
  userRedeemCount: number,
  maxUsesPerUser: number
): boolean {
  // max_uses 是兑换码的总可用次数
  // 一个用户对同一个码只能兑换 max_uses 次
  // 如果 max_uses=1 则只能兑一次
  return userRedeemCount < maxUsesPerUser;
}

// ========== 输入验证 ==========

export function validateCodeInput(code: string): { valid: boolean; error?: string } {
  const normalized = normalizeCode(code);
  if (!normalized) {
    return { valid: false, error: "请输入兑换码" };
  }
  if (normalized.length < 4) {
    return { valid: false, error: "兑换码格式不正确" };
  }
  return { valid: true };
}

export function validateRewardAmount(amount: number): { valid: boolean; error?: string } {
  if (!Number.isInteger(amount) || amount <= 0) {
    return { valid: false, error: "奖励数量必须为正整数" };
  }
  if (amount > 100000) {
    return { valid: false, error: "单次奖励数量不能超过 100000" };
  }
  return { valid: true };
}

export function validateMaxUses(maxUses: number): { valid: boolean; error?: string } {
  if (!Number.isInteger(maxUses) || maxUses <= 0) {
    return { valid: false, error: "可用次数必须为正整数" };
  }
  if (maxUses > 10000) {
    return { valid: false, error: "可用次数不能超过 10000" };
  }
  return { valid: true };
}
