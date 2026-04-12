import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

/**
 * Rate limiter for /api/auth/send — keyed by email address.
 * Allows 5 magic link requests per email per 15 minutes.
 */
export const authSendLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, '15 m'),
  prefix: 'rl:auth:send',
});

/**
 * Rate limiter for /api/auth/verify — keyed by IP address.
 * Allows 10 verify attempts per IP per 15 minutes.
 * Prevents token enumeration attacks.
 */
export const authVerifyLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, '15 m'),
  prefix: 'rl:auth:verify',
});
