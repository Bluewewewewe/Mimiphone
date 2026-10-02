import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabase: SupabaseClient | null = null;
let initError: string | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (initError) {
    throw new Error(initError);
  }
  if (!supabase) {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY =
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '';

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      // 开发/build 阶段尚未注入环境变量时返回 mock，不阻断构建
      const mock: any = {
        from: () => ({
          select: () => ({ data: null, error: null, count: 0 }),
          insert: (v: any) => ({ select: () => ({ data: v, error: null, single: () => ({ data: v, error: null }) }) }),
          update: () => ({ eq: () => ({ data: null, error: null }) }),
          delete: () => ({ eq: () => ({ data: null, error: null }) }),
          eq: () => ({ data: null, error: null }),
          in: () => ({ data: null, error: null }),
          order: () => ({ range: () => ({ data: [], error: null, count: 0 }), data: null, error: null }),
          range: () => ({ data: [], error: null, count: 0 }),
          single: () => ({ data: null, error: null }),
          limit: () => ({ data: [], error: null }),
          ilike: () => ({ order: () => ({ limit: () => ({ data: [], error: null }) }) }),
          contains: () => ({ data: null, error: null }),
          rpc: () => ({ data: null, error: null }),
        }),
      };
      return mock as SupabaseClient;
    }

    try {
      supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
    } catch (error) {
      initError = '[Supabase] 初始化失败: ' + (error instanceof Error ? error.message : String(error));
      throw new Error(initError);
    }
  }
  return supabase;
}

export default getSupabaseClient;
