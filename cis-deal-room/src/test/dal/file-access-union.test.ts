import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FolderAction } from '@/lib/dal/permissions';

/**
 * Build a fluent Drizzle-style mock chain that terminates with `.limit()`
 * returning the given result. Supports up to 4 chained `.innerJoin()` calls.
 */
function makeSelectChain(limitResult: unknown[]) {
  const limitFn = vi.fn().mockResolvedValue(limitResult);
  const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
  const ij4 = vi.fn().mockReturnValue({ where: whereFn });
  const ij3 = vi.fn().mockReturnValue({ innerJoin: ij4, where: whereFn });
  const ij2 = vi.fn().mockReturnValue({ innerJoin: ij3, where: whereFn });
  const ij1 = vi.fn().mockReturnValue({ innerJoin: ij2, where: whereFn });
  const fromFn = vi.fn().mockReturnValue({ innerJoin: ij1 });
  return vi.fn().mockReturnValue({ from: fromFn });
}

describe('requireFileAccess()', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('admin bypasses without hitting the db', async () => {
    vi.doMock('@/db', () => ({ db: {} }));
    vi.doMock('@/db/schema', () => ({
      workspaceParticipants: {},
      folderAccess: {},
      folders: {},
      files: {},
      fileWorkstreams: {},
      workstreamMembers: {},
    }));
    const { requireFileAccess } = await import('@/lib/dal/access');
    const action: FolderAction = 'download';
    await expect(
      requireFileAccess('file-1', { isAdmin: true, userId: 'a', sessionId: 's', userEmail: 'a@x' }, action)
    ).resolves.toBeUndefined();
  });

  it('grants access via workstream membership when folder access is absent', async () => {
    // 1st db.select() call → folder-access path → returns []
    // 2nd db.select() call → workstream-membership path → returns [{ id: 'm-1' }]
    let callCount = 0;
    const select = vi.fn().mockImplementation(() => {
      const result = callCount === 0 ? [] : [{ id: 'm-1' }];
      callCount++;
      const chain = makeSelectChain(result);
      return chain();
    });

    vi.doMock('@/db', () => ({ db: { select } }));
    vi.doMock('@/db/schema', () => ({
      workspaceParticipants: {},
      folderAccess: {},
      folders: {},
      files: {},
      fileWorkstreams: {},
      workstreamMembers: {},
    }));

    const { requireFileAccess } = await import('@/lib/dal/access');
    const action: FolderAction = 'download';
    await expect(
      requireFileAccess('file-1', { isAdmin: false, userId: 'u', sessionId: 's', userEmail: 'u@x' }, action)
    ).resolves.toBeUndefined();
  });

  it('throws Unauthorized when both folder access and workstream membership are absent', async () => {
    const select = vi.fn().mockImplementation(() => {
      const chain = makeSelectChain([]);
      return chain();
    });

    vi.doMock('@/db', () => ({ db: { select } }));
    vi.doMock('@/db/schema', () => ({
      workspaceParticipants: {},
      folderAccess: {},
      folders: {},
      files: {},
      fileWorkstreams: {},
      workstreamMembers: {},
    }));

    const { requireFileAccess } = await import('@/lib/dal/access');
    const action: FolderAction = 'download';
    await expect(
      requireFileAccess('file-1', { isAdmin: false, userId: 'u', sessionId: 's', userEmail: 'u@x' }, action)
    ).rejects.toThrow(/unauthorized/i);
  });

  it('grants access via folder role when canPerform returns true (client + download)', async () => {
    // 1st db.select() call → folder-access path → returns [{ role: 'client' }]
    // canPerform('client', 'download') === true  →  resolves without hitting workstream path
    // 2nd db.select() call → workstream-membership path → returns [] (should NOT be reached)
    let callCount = 0;
    const select = vi.fn().mockImplementation(() => {
      const result = callCount === 0 ? [{ role: 'client' }] : [];
      callCount++;
      const chain = makeSelectChain(result);
      return chain();
    });

    vi.doMock('@/db', () => ({ db: { select } }));
    vi.doMock('@/db/schema', () => ({
      workspaceParticipants: {},
      folderAccess: {},
      folders: {},
      files: {},
      fileWorkstreams: {},
      workstreamMembers: {},
    }));

    const { requireFileAccess } = await import('@/lib/dal/access');
    const action: FolderAction = 'download';
    await expect(
      requireFileAccess('file-1', { isAdmin: false, userId: 'u', sessionId: 's', userEmail: 'u@x' }, action)
    ).resolves.toBeUndefined();
  });

  it('throws Unauthorized when folder role blocks the action and workstream membership is absent (view_only + upload)', async () => {
    // canPerform('view_only', 'upload') === false  →  falls through to workstream check
    // workstream-membership path → returns []  →  throws Unauthorized
    let callCount = 0;
    const select = vi.fn().mockImplementation(() => {
      const result = callCount === 0 ? [{ role: 'view_only' }] : [];
      callCount++;
      const chain = makeSelectChain(result);
      return chain();
    });

    vi.doMock('@/db', () => ({ db: { select } }));
    vi.doMock('@/db/schema', () => ({
      workspaceParticipants: {},
      folderAccess: {},
      folders: {},
      files: {},
      fileWorkstreams: {},
      workstreamMembers: {},
    }));

    const { requireFileAccess } = await import('@/lib/dal/access');
    const action: FolderAction = 'upload';
    await expect(
      requireFileAccess('file-1', { isAdmin: false, userId: 'u', sessionId: 's', userEmail: 'u@x' }, action)
    ).rejects.toThrow(/unauthorized/i);
  });
});
