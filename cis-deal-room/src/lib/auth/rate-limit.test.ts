import { describe, it, expect, vi } from 'vitest';

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
