/**
 * 管理员记忆审核 API
 * GET: 获取晋升候选列表 + 统计 + 跨用户重复检测
 * POST: 审批/拒绝候选
 */

import { NextRequest } from 'next/server';
import {
  getPromotionCandidates,
  getPromotionStats,
  approvePromotionCandidate,
  rejectPromotionCandidate,
  getDuplicateGroups,
  getDuplicateSummary,
} from '@/lib/public-memory';
import { requireAdminRequest } from '@/lib/auth';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
        const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') as 'pending' | 'approved' | 'rejected' | null;
    const includeDuplicates = searchParams.get('duplicates') !== 'false';

    const promises: Promise<unknown>[] = [
      getPromotionCandidates(status || undefined),
      getPromotionStats(),
    ];

    if (includeDuplicates) {
      promises.push(getDuplicateGroups());
      promises.push(getDuplicateSummary());
    }

    const [candidates, stats, duplicateGroups, duplicateSummary] = await Promise.all(promises);

    return new Response(JSON.stringify({
      success: true,
      candidates,
      stats,
      duplicateGroups: duplicateGroups || [],
      duplicateSummary: duplicateSummary || null,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('获取审核列表失败:', error);
    return new Response(JSON.stringify({ error: '获取失败' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authUser = await requireAdminRequest(request);
    const { action, candidateId, category, editedContent } = await request.json();

    if (!candidateId || !action) {
      return new Response(JSON.stringify({ error: '缺少参数' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    let success = false;

    if (action === 'approve') {
      success = await approvePromotionCandidate(
        candidateId,
        authUser.username || 'admin',
        category || 'general',
        editedContent
      );
    } else if (action === 'reject') {
      success = await rejectPromotionCandidate(candidateId);
    }

    return new Response(JSON.stringify({ success }), {
      status: success ? 200 : 500,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('审核操作失败:', error);
    return new Response(JSON.stringify({ error: '操作失败' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
