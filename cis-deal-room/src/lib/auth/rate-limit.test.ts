import { describe, it, expect, vi, afterEach } from 'vitest';

// Mock Upstash modules at import time so rate-limit.ts can be loaded
// without real Redis credentials. These limiters are instantiated at
// module-load, so the mocks must be in place before the import below.
vi.mock('@upstash/redis', () => ({
  Redis: class MockRedis {
    constructor(public opts: unknown) {}
  },
}));

vi.mock('@upstash/ratelimit', () => {
  class MockRatelimit {
    public opts: { redis: unknown; limiter: unknown; prefix: string };
    constructor(opts: { redis: unknown; limiter: unknown; prefix: string }) {
      this.opts = opts;
    }
    limit = vi.fn();
    static slidingWindow = (requests: number, window: string) => ({ requests, window });
  }
  return { Ratelimit: MockRatelimit };
});

// Env vars must be set before rate-limit.ts is first evaluated.
// vi.hoisted() runs before the module imports below.
vi.hoisted(() => {
  process.env.UPSTASH_REDIS_REST_URL = 'https://test.upstash.io';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
});

import { authSendLimiter, authVerifyLimiter } from './rate-limit';

describe('authSendLimiter', () => {
  it('is exported and has a limit() method', () => {
    expect(authSendLimiter).toBeDefined();
    expect(typeof authSendLimiter.limit).toBe('function');
  });

  it('allows up to 5 requests per email per 15 minutes', () => {
    // The sliding-window algorithm is trusted (it's a library); we verify
    // our configuration is what the spec requires.
    const opts = (authSendLimiter as unknown as { opts: { limiter: { requests: number; window: string }; prefix: string } }).opts;
    expect(opts.limiter).toEqual({ requests: 5, window: '15 m' });
    expect(opts.prefix).toBe('rl:auth:send');
  });
});

describe('authVerifyLimiter', () => {
  it('is exported and has a limit() method', () => {
    expect(authVerifyLimiter).toBeDefined();
    expect(typeof authVerifyLimiter.limit).toBe('function');
  });

  it('allows up to 10 requests per IP per 15 minutes', () => {
    const opts = (authVerifyLimiter as unknown as { opts: { limiter: { requests: number; window: string }; prefix: string } }).opts;
    expect(opts.limiter).toEqual({ requests: 10, window: '15 m' });
    expect(opts.prefix).toBe('rl:auth:verify');
  });
});

describe('stub mode (Upstash env absent)', () => {
  it('returns a permissive stub limiter when env vars are unset', async () => {
    // Clear env + reset modules + dynamic import to get a fresh module load
    // that takes the stub branch.
    vi.resetModules();
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    const mod = await import('./rate-limit');
    const result = await mod.authSendLimiter.limit('any@example.com');
    expect(result.success).toBe(true);
  });
});

describe('rate limiter fail-closed', () => {
  const origEnv = { ...process.env };
  afterEach(() => {
    process.env = { ...origEnv };
    vi.resetModules();
  });

  it('throws at import time when NODE_ENV=production and Upstash URL missing', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    vi.resetModules();
    await expect(() => import('./rate-limit')).rejects.toThrow(/Upstash/i);
  });
});
