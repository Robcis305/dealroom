import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

/**
 * Dev-mode stub. When Upstash env vars are absent (local dev without a
 * Redis instance), `.limit()` returns a permissive response. Mirrors the
 * sendEmail stub pattern — lets the full auth flow be exercisable locally
 * without signing up for Upstash. Real deploys must set the env vars.
 */
interface RateLimiter {
  limit(identifier: string): Promise<{ success: boolean }>;
}

const stubLimiter: RateLimiter = {
  async limit() {
    return { success: true };
  },
};

function buildLimiter(requests: number, window: '15 m', prefix: string): RateLimiter {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        `[ratelimit] ${prefix} requires UPSTASH_REDIS_REST_URL/_TOKEN in production.`
      );
    }
    console.log(`[ratelimit:stub] ${prefix} (${requests}/${window}) — Upstash not configured`);
    return stubLimiter;
  }
  const redis = new Redis({ url, token });
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(requests, window),
    prefix,
  });
}

/**
 * Rate limiter for /api/auth/send — keyed by email address.
 * Allows 5 magic link requests per email per 15 minutes.
 */
export const authSendLimiter = buildLimiter(5, '15 m', 'rl:auth:send');

/**
 * Rate limiter for /api/auth/verify — keyed by IP address.
 * Allows 10 verify attempts per IP per 15 minutes.
 * Prevents token enumeration attacks.
 */
export const authVerifyLimiter = buildLimiter(10, '15 m', 'rl:auth:verify');

/**
 * Per-user-plus-file: 10 preview-log writes per 15 minutes. Plenty for
 * legitimate re-opens, catches tab-flapping or abuse.
 */
export const previewLogLimiter = buildLimiter(10, '15 m', 'rl:preview-log');
