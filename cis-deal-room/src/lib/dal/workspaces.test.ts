import { describe, it, expect, vi } from 'vitest';

// Wave 0 stubs — these tests must FAIL (RED) until implemented in Plan 01-02.
describe('getWorkspacesForUser()', () => {
  it('returns all workspaces for admin users', () => {
    // TODO: mock verifySession to return admin, mock db.select, assert all workspaces returned
    expect(true).toBe(false);
  });

  it('returns only joined workspaces for non-admin users', () => {
    // TODO: mock verifySession to return non-admin, mock db join query, assert filtered result
    expect(true).toBe(false);
  });

  it('throws Unauthorized when session is null', () => {
    // TODO: mock verifySession to return null, assert throws
    expect(true).toBe(false);
  });
});

describe('createWorkspace()', () => {
  it('creates workspace and 8 default folders in a transaction', () => {
    // TODO: mock db.transaction, assert workspace and 8 folders inserted
    expect(true).toBe(false);
  });

  it('throws Admin required when called by non-admin', () => {
    // TODO: mock verifySession to return non-admin, assert throws
    expect(true).toBe(false);
  });
});
