import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./index', () => ({ verifySession: vi.fn() }));
vi.mock('./activity', () => ({ logActivity: vi.fn().mockResolvedValue(undefined) }));

describe('listWorkstreamsWithCounts()', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('seeds then returns 5 workstreams ordered by sortOrder with counts merged', async () => {
    // ensureWorkstreams insert → onConflictDoNothing chain
    const onConflictDoNothing = vi.fn().mockResolvedValue(undefined);
    const values = vi.fn().mockReturnValue({ onConflictDoNothing });
    const insert = vi.fn().mockReturnValue({ values });

    // listWorkstreamsWithCounts reads: workstreams rows, doc counts, member counts
    const wsRows = [
      { id: 'w-legal', workspaceId: 'ws-1', key: 'legal', name: 'Legal', color: '#33322F', tileTint: '#ECEBE6', description: 'd', sortOrder: 0 },
    ];
    const select = vi.fn()
      // 1st select: workstreams
      .mockReturnValueOnce({ from: () => ({ where: () => ({ orderBy: vi.fn().mockResolvedValue(wsRows) }) }) })
      // 2nd select: doc counts grouped
      .mockReturnValueOnce({ from: () => ({ innerJoin: () => ({ where: () => ({ groupBy: vi.fn().mockResolvedValue([{ workstreamId: 'w-legal', count: 31 }]) }) }) }) })
      // 3rd select: member counts grouped
      .mockReturnValueOnce({ from: () => ({ innerJoin: () => ({ where: () => ({ groupBy: vi.fn().mockResolvedValue([{ workstreamId: 'w-legal', count: 6 }]) }) }) }) });

    vi.doMock('@/db', () => ({ db: { insert, select } }));
    vi.doMock('@/db/schema', () => ({ workstreams: {}, workstreamMembers: {}, fileWorkstreams: {}, files: {}, workspaceParticipants: {} }));

    const { listWorkstreamsWithCounts } = await import('./workstreams');
    const result = await listWorkstreamsWithCounts('ws-1');

    expect(insert).toHaveBeenCalled(); // seeded
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ key: 'legal', docCount: 31, memberCount: 6, openQaCount: 0, overdueCount: 0 });
  });
});

describe('setFileWorkstreams()', () => {
  beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); });

  it('admin: diffs current vs desired and logs document_tagged when adding', async () => {
    const logActivity = vi.fn().mockResolvedValue(undefined);
    vi.doMock('./activity', () => ({ logActivity }));
    vi.doMock('./index', () => ({ verifySession: vi.fn().mockResolvedValue({ userId: 'admin-1', isAdmin: true, sessionId: 's', userEmail: 'a@cis.com' }) }));

    // current tags: none
    const where = vi.fn().mockResolvedValue([]);
    const onConflictDoNothing = vi.fn().mockResolvedValue(undefined);
    const insertValues = vi.fn().mockReturnValue({ onConflictDoNothing });
    const tx = {
      select: vi.fn().mockReturnValue({ from: () => ({ where }) }),
      insert: vi.fn().mockReturnValue({ values: insertValues }),
      delete: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
    };
    vi.doMock('@/db', () => ({ db: { transaction: vi.fn(async (cb) => cb(tx)) } }));
    vi.doMock('@/db/schema', () => ({ workstreams: {}, workstreamMembers: {}, fileWorkstreams: { fileId: 'fileId', workstreamId: 'workstreamId' }, files: {}, workspaceParticipants: {}, users: {}, activityLogs: {} }));

    const { setFileWorkstreams } = await import('./workstreams');
    await setFileWorkstreams('ws-1', 'file-1', ['w-legal', 'w-finance']);

    expect(tx.insert).toHaveBeenCalled();
    expect(logActivity).toHaveBeenCalledWith(tx, expect.objectContaining({ action: 'document_tagged', targetType: 'file', targetId: 'file-1' }));
  });
});

describe('addWorkstreamMember()', () => {
  beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); });

  it('admin: inserts membership and logs activity in a transaction', async () => {
    const logActivity = vi.fn().mockResolvedValue(undefined);
    vi.doMock('./activity', () => ({ logActivity }));
    vi.doMock('./index', () => ({
      verifySession: vi.fn().mockResolvedValue({ userId: 'admin-1', isAdmin: true, sessionId: 's', userEmail: 'a@cis.com' }),
    }));

    const onConflictDoNothing = vi.fn().mockResolvedValue(undefined);
    const insertValues = vi.fn().mockReturnValue({ onConflictDoNothing });
    const tx = { insert: vi.fn().mockReturnValue({ values: insertValues }) };
    const transaction = vi.fn(async (cb) => cb(tx));
    vi.doMock('@/db', () => ({ db: { transaction } }));
    vi.doMock('@/db/schema', () => ({ workstreams: {}, workstreamMembers: {}, fileWorkstreams: {}, files: {}, workspaceParticipants: {}, activityLogs: {} }));

    const { addWorkstreamMember } = await import('./workstreams');
    await addWorkstreamMember('ws-1', 'w-legal', 'p-1');

    expect(tx.insert).toHaveBeenCalled();
    expect(logActivity).toHaveBeenCalledWith(tx, expect.objectContaining({ action: 'workstream_member_added', targetType: 'workstream', targetId: 'w-legal' }));
  });

  it('non-admin: throws', async () => {
    vi.doMock('./index', () => ({ verifySession: vi.fn().mockResolvedValue({ userId: 'u', isAdmin: false, sessionId: 's', userEmail: 'u@x.com' }) }));
    vi.doMock('@/db', () => ({ db: {} }));
    vi.doMock('@/db/schema', () => ({ workstreams: {}, workstreamMembers: {}, fileWorkstreams: {}, files: {}, workspaceParticipants: {}, activityLogs: {} }));
    const { addWorkstreamMember } = await import('./workstreams');
    await expect(addWorkstreamMember('ws-1', 'w-legal', 'p-1')).rejects.toThrow();
  });
});
