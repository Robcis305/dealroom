import { describe, it, expect, vi } from 'vitest';

// Wave 0 stubs — these tests must FAIL (RED) until implemented in Plan 01-02.
describe('authSendLimiter', () => {
  it('is exported and has a limit() method', () => {
    // TODO: mock Upstash Redis, import authSendLimiter, assert it has .limit()
    expect(true).toBe(false);
  });

  it('allows up to 5 requests per email per 15 minutes', () => {
    // TODO: mock Redis, call limit() 5 times and assert success, 6th should fail
    expect(true).toBe(false);
  });
});

describe('authVerifyLimiter', () => {
  it('is exported and has a limit() method', () => {
    // TODO: mock Upstash Redis, import authVerifyLimiter, assert it has .limit()
    expect(true).toBe(false);
  });

  it('allows up to 10 requests per IP per 15 minutes', () => {
    // TODO: mock Redis, call limit() 10 times and assert success, 11th should fail
    expect(true).toBe(false);
  });
});
