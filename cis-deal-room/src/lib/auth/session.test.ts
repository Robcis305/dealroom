import { describe, it, expect, vi } from 'vitest';

// Wave 0 stubs — these tests must FAIL (RED) until implemented in Plan 01-02.
describe('createSession()', () => {
  it('inserts a sessions row and returns a UUID sessionId', () => {
    // TODO: mock db.insert, call createSession(userId), assert returned UUID format
    expect(true).toBe(false);
  });
});

describe('getSession()', () => {
  it('returns a Session object when row exists and lastActiveAt is within 24h', () => {
    // TODO: mock db.select to return valid row, assert session shape
    expect(true).toBe(false);
  });

  it('returns null when session row is not found', () => {
    // TODO: mock db.select to return empty, assert null
    expect(true).toBe(false);
  });

  it('returns null when lastActiveAt is older than 24h (expired)', () => {
    // TODO: mock db.select with old lastActiveAt, assert null
    expect(true).toBe(false);
  });

  it('slides the lastActiveAt window on valid access', () => {
    // TODO: mock db.update, assert it was called with new timestamp
    expect(true).toBe(false);
  });
});

describe('destroySession()', () => {
  it('deletes the session row from the database', () => {
    // TODO: mock db.delete, call destroySession(sessionId), assert delete was called
    expect(true).toBe(false);
  });
});
