/**
 * 米米币兑换码系统 — 纯业务逻辑测试
 *
 * 覆盖 src/lib/redeem.ts 全部纯函数：
 *   1. 兑换码生成（格式、前缀、唯一性）
 *   2. 输入规范化（大小写、空格）
 *   3. 验证码逻辑（不存在/禁用/过期/超限/正常）
 *   4. 兑换金额计算
 *   5. 余额计算
 *   6. 用户兑换次数判定
 *   7. 输入验证（空码/短码/非法金额/非法次数）
 *
 * 运行：npx vitest run __tests__/redeem.test.ts
 */

import { describe, it, expect } from "vitest";
import {
  generateRedeemCode,
  normalizeCode,
  verifyCodeLogic,
  calculateRedeemAmount,
  calculateNewBalance,
  canUserRedeem,
  validateCodeInput,
  validateRewardAmount,
  validateMaxUses,
  type RedeemCode,
} from "../src/lib/redeem";

// ========== 辅助工厂 ==========
function makeCode(overrides: Partial<RedeemCode> = {}): RedeemCode {
  return {
    code: "MIMI-ABCDEFGH1234",
    reward_amount: 100,
    max_uses: 5,
    used_count: 0,
    status: "active",
    expires_at: null,
    created_by: "admin_001",
    created_at: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

const FIXED_NOW = new Date("2026-08-15T12:00:00.000Z");

// ========== 1. 兑换码生成 ==========
describe("generateRedeemCode", () => {
  it("生成的码以 MIMI- 为前缀", () => {
    const code = generateRedeemCode();
    expect(code.startsWith("MIMI-")).toBe(true);
  });

  it("生成的码长度为 17（5 前缀 + 12 字符）", () => {
    const code = generateRedeemCode();
    expect(code.length).toBe(17);
  });

  it("生成的码只包含允许字符（大写字母+数字，排除 0/1/I/O）", () => {
    const allowedChars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    for (let i = 0; i < 20; i++) {
      const code = generateRedeemCode();
      const body = code.slice(5); // 去掉前缀
      for (const ch of body) {
        expect(allowedChars.includes(ch)).toBe(true);
      }
    }
  });

  it("多次生成结果不全部相同（随机性）", () => {
    const codes = new Set<string>();
    for (let i = 0; i < 50; i++) {
      codes.add(generateRedeemCode());
    }
    // 50 次生成至少应该有 40 个不同的码
    expect(codes.size).toBeGreaterThan(40);
  });
});

// ========== 2. 输入规范化 ==========
describe("normalizeCode", () => {
  it("转为大写", () => {
    expect(normalizeCode("mimi-abc123")).toBe("MIMI-ABC123");
  });

  it("去除前后空格", () => {
    expect(normalizeCode("  MIMI-TEST  ")).toBe("MIMI-TEST");
  });

  it("同时处理大小写和空格", () => {
    expect(normalizeCode("  mimi-hello  ")).toBe("MIMI-HELLO");
  });
});

// ========== 3. 验证码逻辑 ==========
describe("verifyCodeLogic", () => {
  it("兑换码不存在时返回错误", () => {
    const result = verifyCodeLogic(null, FIXED_NOW);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("兑换码不存在");
  });

  it("禁用的兑换码返回错误", () => {
    const code = makeCode({ status: "disabled" });
    const result = verifyCodeLogic(code, FIXED_NOW);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("兑换码已禁用");
  });

  it("过期的兑换码返回错误", () => {
    const code = makeCode({ expires_at: "2026-08-01T00:00:00.000Z" });
    const result = verifyCodeLogic(code, FIXED_NOW);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("兑换码已过期");
  });

  it("恰好到期的兑换码也视为过期", () => {
    const code = makeCode({ expires_at: "2026-08-15T12:00:00.000Z" });
    const result = verifyCodeLogic(code, FIXED_NOW);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("兑换码已过期");
  });

  it("未过期且未来到期的兑换码有效", () => {
    const code = makeCode({ expires_at: "2026-09-01T00:00:00.000Z" });
    const result = verifyCodeLogic(code, FIXED_NOW);
    expect(result.valid).toBe(true);
  });

  it("已达到最大使用次数的兑换码返回错误", () => {
    const code = makeCode({ max_uses: 3, used_count: 3 });
    const result = verifyCodeLogic(code, FIXED_NOW);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("兑换码已达到最大使用次数");
  });

  it("使用次数超过上限也返回错误", () => {
    const code = makeCode({ max_uses: 2, used_count: 5 });
    const result = verifyCodeLogic(code, FIXED_NOW);
    expect(result.valid).toBe(false);
  });

  it("正常的兑换码返回有效及剩余次数", () => {
    const code = makeCode({ max_uses: 10, used_count: 3 });
    const result = verifyCodeLogic(code, FIXED_NOW);
    expect(result.valid).toBe(true);
    expect(result.remainingUses).toBe(7);
  });

  it("无过期时间的兑换码不受过期限制", () => {
    const code = makeCode({ expires_at: null });
    const result = verifyCodeLogic(code, FIXED_NOW);
    expect(result.valid).toBe(true);
  });

  it("max_uses=1 且 used_count=0 时有效", () => {
    const code = makeCode({ max_uses: 1, used_count: 0 });
    const result = verifyCodeLogic(code, FIXED_NOW);
    expect(result.valid).toBe(true);
    expect(result.remainingUses).toBe(1);
  });

  it("max_uses=1 且 used_count=1 时无效", () => {
    const code = makeCode({ max_uses: 1, used_count: 1 });
    const result = verifyCodeLogic(code, FIXED_NOW);
    expect(result.valid).toBe(false);
  });
});

// ========== 4. 兑换金额计算 ==========
describe("calculateRedeemAmount", () => {
  it("正常金额原样返回", () => {
    expect(calculateRedeemAmount(100)).toBe(100);
  });

  it("0 返回 0", () => {
    expect(calculateRedeemAmount(0)).toBe(0);
  });

  it("负数返回 0", () => {
    expect(calculateRedeemAmount(-50)).toBe(0);
  });

  it("大额正常返回", () => {
    expect(calculateRedeemAmount(99999)).toBe(99999);
  });
});

// ========== 5. 余额计算 ==========
describe("calculateNewBalance", () => {
  it("余额加上奖励金额", () => {
    expect(calculateNewBalance(500, 100)).toBe(600);
  });

  it("零余额加奖励", () => {
    expect(calculateNewBalance(0, 50)).toBe(50);
  });

  it("大余额加奖励", () => {
    expect(calculateNewBalance(100000, 100)).toBe(100100);
  });
});

// ========== 6. 用户兑换次数判定 ==========
describe("canUserRedeem", () => {
  it("用户未兑换过，max_uses=1，可以兑换", () => {
    expect(canUserRedeem(0, 1)).toBe(true);
  });

  it("用户已兑换1次，max_uses=1，不能再兑换", () => {
    expect(canUserRedeem(1, 1)).toBe(false);
  });

  it("用户未兑换过，max_uses=5，可以兑换", () => {
    expect(canUserRedeem(0, 5)).toBe(true);
  });

  it("用户已兑换3次，max_uses=5，还可以兑换", () => {
    expect(canUserRedeem(3, 5)).toBe(true);
  });

  it("用户已兑换5次，max_uses=5，不能再兑换", () => {
    expect(canUserRedeem(5, 5)).toBe(false);
  });

  it("用户已兑换超过max_uses，不能兑换", () => {
    expect(canUserRedeem(10, 5)).toBe(false);
  });
});

// ========== 7. 输入验证 ==========
describe("validateCodeInput", () => {
  it("空字符串无效", () => {
    const result = validateCodeInput("");
    expect(result.valid).toBe(false);
    expect(result.error).toBe("请输入兑换码");
  });

  it("纯空格无效", () => {
    const result = validateCodeInput("   ");
    expect(result.valid).toBe(false);
  });

  it("太短的码无效", () => {
    const result = validateCodeInput("ABC");
    expect(result.valid).toBe(false);
    expect(result.error).toBe("兑换码格式不正确");
  });

  it("长度足够的码有效", () => {
    const result = validateCodeInput("MIMI-ABCDE");
    expect(result.valid).toBe(true);
  });

  it("刚好5个字符有效", () => {
    const result = validateCodeInput("ABCDE");
    expect(result.valid).toBe(true);
  });
});

describe("validateRewardAmount", () => {
  it("正整数有效", () => {
    expect(validateRewardAmount(100).valid).toBe(true);
  });

  it("1有效", () => {
    expect(validateRewardAmount(1).valid).toBe(true);
  });

  it("0无效", () => {
    const result = validateRewardAmount(0);
    expect(result.valid).toBe(false);
  });

  it("负数无效", () => {
    const result = validateRewardAmount(-10);
    expect(result.valid).toBe(false);
  });

  it("小数无效", () => {
    const result = validateRewardAmount(10.5);
    expect(result.valid).toBe(false);
  });

  it("超过100000无效", () => {
    const result = validateRewardAmount(100001);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("单次奖励数量不能超过 100000");
  });

  it("100000有效（边界值）", () => {
    expect(validateRewardAmount(100000).valid).toBe(true);
  });
});

describe("validateMaxUses", () => {
  it("正整数有效", () => {
    expect(validateMaxUses(5).valid).toBe(true);
  });

  it("1有效", () => {
    expect(validateMaxUses(1).valid).toBe(true);
  });

  it("0无效", () => {
    const result = validateMaxUses(0);
    expect(result.valid).toBe(false);
  });

  it("负数无效", () => {
    const result = validateMaxUses(-1);
    expect(result.valid).toBe(false);
  });

  it("小数无效", () => {
    const result = validateMaxUses(3.5);
    expect(result.valid).toBe(false);
  });

  it("超过10000无效", () => {
    const result = validateMaxUses(10001);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("可用次数不能超过 10000");
  });

  it("10000有效（边界值）", () => {
    expect(validateMaxUses(10000).valid).toBe(true);
  });
});
