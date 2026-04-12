import { describe, it, expect, vi } from 'vitest';

// Wave 0 stub — these tests must FAIL (RED) until Plan 01-02 implements the route.
// Task ID: 1-03 per VALIDATION.md
describe('GET /api/auth/verify', () => {
  it('redirects to ?error=expired when token row exists but expiresAt is in the past', () => {
    // TODO: implement in Plan 01-02 — mock db to return expired row and assert redirect URL contains error=expired
    expect(true).toBe(false);
  });

  it('redirects to ?error=used when no token row is found (already consumed)', () => {
    // TODO: implement in Plan 01-02 — mock db to return null and assert redirect URL contains error=used
    expect(true).toBe(false);
  });
});
