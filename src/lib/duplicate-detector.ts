/**
 * 多用户重复内容检测模块
 *
 * 核心机制：
 * 1. 对每条记忆内容生成指纹（character bigram hash）
 * 2. 查询 promotion_candidates 表中其他用户的相似内容
 * 3. 基于 Jaccard 相似度判断是否为重复/相似内容
 * 4. 达到阈值（2+ 不同用户）自动触发晋升
 */

import { getSupabaseClient } from '@/storage/database/supabase-client';
import type { SupabaseClient } from '@supabase/supabase-js';

let supabase: SupabaseClient | null = null;
function getClient(): SupabaseClient {
  if (!supabase) supabase = getSupabaseClient();
  return supabase;
}

// ========== 中文文本相似度计算 ==========

/**
 * 提取字符 bigram（二元组），适合中文短文本比较
 * 例："喜欢猫耳" → ["喜欢", "欢猫", "猫耳"]
 */
function extractBigrams(text: string): string[] {
  const cleaned = text.replace(/\s+/g, '').replace(/[，。！？、；：""''（）【】《》…—\.,!?;:'"()\[\]{}]/g, '');
  if (cleaned.length < 2) return [cleaned];
  const bigrams: string[] = [];
  for (let i = 0; i < cleaned.length - 1; i++) {
    bigrams.push(cleaned.slice(i, i + 2));
  }
  return bigrams;
}

/**
 * Jaccard 相似度：两个集合的交集大小 / 并集大小
 */
function jaccardSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection++;
  }
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

/**
 * 计算内容指纹（用于数据库快速检索）
 * 取前20个 bigram 的 hash 组合
 */
export function computeContentFingerprint(text: string): string {
  const bigrams = extractBigrams(text);
  const top20 = bigrams.slice(0, 20);
  // 简单 hash：每个 bigram 取 charCode 累加
  const hash = top20.reduce((acc, bg) => {
    let h = 0;
    for (let i = 0; i < bg.length; i++) h = ((h << 5) - h) + bg.charCodeAt(i);
    return acc + h;
  }, 0);
  return `fp_${Math.abs(hash).toString(36)}`;
}

// ========== 相似度阈值 ==========
const SIMILARITY_THRESHOLD = 0.35;   // Jaccard ≥ 0.35 视为相似
 // Jaccard ≥ 0.6 视为高度相似
const MIN_DIFFERENT_USERS_FOR_BOOST = 2; // 至少 2 个不同用户提及才触发增强

// ========== 跨用户重复检测 ==========

export interface DuplicateMatch {
  candidateId: string;
  userId: string;
  originalMessage: string;
  similarity: number;
  status: string;
  createdAt: string;
}

export interface DuplicateDetectionResult {
  /** 是否有跨用户重复 */
  hasDuplicates: boolean;
  /** 不同用户数（含当前用户） */
  uniqueUserCount: number;
  /** 匹配的相似候选项 */
  matches: DuplicateMatch[];
  /** 是否建议自动晋升 */
  shouldAutoPromote: boolean;
  /** 晋升增强理由 */
  boostReason: string | null;
}

/**
 * 检测跨用户重复内容
 * @param content 待检测的内容
 * @param currentUserId 当前用户ID（排除自身）
 * @param excludeCandidateId 排除的候选ID（编辑场景）
 */
export async function detectCrossUserDuplicates(
  content: string,
  currentUserId: string,
  excludeCandidateId?: string
): Promise<DuplicateDetectionResult> {
  try {
        const bigrams = extractBigrams(content);

    // 查询所有 pending + approved 的候选（排除当前用户）
    let query = getClient()
      .from('promotion_candidates')
      .select('id, user_id, original_message, status, created_at')
      .neq('user_id', currentUserId)
      .in('status', ['pending', 'approved']);

    if (excludeCandidateId) {
      query = query.neq('id', excludeCandidateId);
    }

    const { data, error } = await query;

    if (error || !data || data.length === 0) {
      return {
        hasDuplicates: false,
        uniqueUserCount: 1,
        matches: [],
        shouldAutoPromote: false,
        boostReason: null,
      };
    }

    // 计算每条候选项与当前内容的相似度
    const matches: DuplicateMatch[] = [];
    const uniqueUsers = new Set<string>();

    for (const row of data) {
      const rowBigrams = extractBigrams(row.original_message);
      const sim = jaccardSimilarity(bigrams, rowBigrams);

      if (sim >= SIMILARITY_THRESHOLD) {
        matches.push({
          candidateId: row.id,
          userId: row.user_id,
          originalMessage: row.original_message,
          similarity: Math.round(sim * 100) / 100,
          status: row.status,
          createdAt: row.created_at,
        });
        uniqueUsers.add(row.user_id);
      }
    }

    // 按相似度降序排列
    matches.sort((a, b) => b.similarity - a.similarity);

    // 含当前用户的总独立用户数
    uniqueUsers.add(currentUserId);
    const uniqueUserCount = uniqueUsers.size;

    const hasDuplicates = matches.length > 0;

    // 自动晋升判断：
    // 1. 有跨用户重复
    // 2. 至少 2 个不同用户提及
    // 3. 至少有 1 条高度相似匹配
        const shouldAutoPromote = hasDuplicates && uniqueUserCount >= MIN_DIFFERENT_USERS_FOR_BOOST;

    let boostReason: string | null = null;
    if (shouldAutoPromote) {
      const otherUsers = [...new Set(matches.map(m => m.userId))];
      boostReason = `多用户重复提及（${uniqueUserCount}位用户），最高相似度${Math.round(matches[0].similarity * 100)}%。来自用户: ${otherUsers.slice(0, 3).join(', ')}${otherUsers.length > 3 ? '等' : ''}`;
    }

    return {
      hasDuplicates,
      uniqueUserCount,
      matches: matches.slice(0, 10),
      shouldAutoPromote,
      boostReason,
    };
  } catch (e) {
    console.error('跨用户重复检测失败:', e);
    return {
      hasDuplicates: false,
      uniqueUserCount: 1,
      matches: [],
      shouldAutoPromote: false,
      boostReason: null,
    };
  }
}

/**
 * 批量检测：对一组记忆内容逐一检测跨用户重复
 */
export async function batchDetectDuplicates(
  entries: Array<{ content: string; userId: string }>
): Promise<Map<string, DuplicateDetectionResult>> {
  const results = new Map<string, DuplicateDetectionResult>();
  for (const entry of entries) {
    const key = entry.content.slice(0, 30);
    results.set(key, await detectCrossUserDuplicates(entry.content, entry.userId));
  }
  return results;
}

/**
 * 按分类统计跨用户重复情况
 */
export async function getDuplicateStatsByCategory(): Promise<
  Array<{ category: string; content: string; uniqueUsers: number; matchCount: number }>
> {
  try {
    const { data, error } = await getClient()
      .from('promotion_candidates')
      .select('category, original_message, user_id')
      .in('status', ['pending', 'approved']);

    if (error || !data) return [];

    // 按 category 分组
    const byCategory = new Map<string, Array<{ content: string; userId: string }>>();
    for (const row of data) {
      const cat = row.category || 'general';
      const list = byCategory.get(cat) || [];
      list.push({ content: row.original_message, userId: row.user_id });
      byCategory.set(cat, list);
    }

    const stats: Array<{ category: string; content: string; uniqueUsers: number; matchCount: number }> = [];

    for (const [category, entries] of byCategory) {
      // 对每个分类内的内容做两两比较
      const processed = new Set<number>();
      for (let i = 0; i < entries.length; i++) {
        if (processed.has(i)) continue;
        const bigramsI = extractBigrams(entries[i].content);
        const group = [entries[i]];
        const groupUsers = new Set([entries[i].userId]);

        for (let j = i + 1; j < entries.length; j++) {
          if (processed.has(j)) continue;
          const bigramsJ = extractBigrams(entries[j].content);
          if (jaccardSimilarity(bigramsI, bigramsJ) >= SIMILARITY_THRESHOLD) {
            group.push(entries[j]);
            groupUsers.add(entries[j].userId);
            processed.add(j);
          }
        }

        if (group.length >= 2) {
          stats.push({
            category,
            content: group[0].content.slice(0, 50),
            uniqueUsers: groupUsers.size,
            matchCount: group.length,
          });
        }
        processed.add(i);
      }
    }

    return stats.sort((a, b) => b.uniqueUsers - a.uniqueUsers);
  } catch {
    return [];
  }
}
