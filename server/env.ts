export type Env = {
  DB: D1Database;
  FILES: R2Bucket;
  ASSETS: Fetcher;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  ANALYZE_DAILY_LIMIT?: string;
  SEARCH_DAILY_LIMIT?: string;
  MAX_BODY_BYTES?: string;
};

export function dailyLimit(env: Env, action: 'analyze' | 'search'): number {
  const raw = action === 'analyze' ? env.ANALYZE_DAILY_LIMIT : env.SEARCH_DAILY_LIMIT;
  const parsed = raw ? Number(raw) : 0;
  if (!Number.isFinite(parsed) || parsed <= 0) return action === 'analyze' ? 30 : 50;
  return Math.floor(parsed);
}

export function effectiveMaxBodyBytes(env: Env): number {
  const parsed = env.MAX_BODY_BYTES ? Number(env.MAX_BODY_BYTES) : 0;
  if (!Number.isFinite(parsed) || parsed <= 0) return 6_000_000;
  return Math.floor(parsed);
}
