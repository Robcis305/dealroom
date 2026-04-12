import { describe, it, expect, vi } from 'vitest';

// Wave 0 stubs — these tests must FAIL (RED) until implemented in Plan 01-02.
describe('logActivity()', () => {
  it('inserts an immutable activity log row with correct fields', () => {
    // TODO: mock db.insert, call logActivity(), assert insertion with action/targetType/workspaceId
    expect(true).toBe(false);
  });

  it('works within a transaction context', () => {
    // TODO: mock transaction object, assert logActivity uses tx not db directly
    expect(true).toBe(false);
  });

  it('stores metadata as jsonb when provided', () => {
    // TODO: call logActivity with metadata, assert jsonb field written
    expect(true).toBe(false);
  });
});
