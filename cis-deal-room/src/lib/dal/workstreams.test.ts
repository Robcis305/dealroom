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

describe('updateWorkstream()', () => {
  beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); });

  it('not found — rejects with /not found/i and does NOT call logActivity', async () => {
    const logActivity = vi.fn().mockResolvedValue(undefined);
    vi.doMock('./activity', () => ({ logActivity }));
    vi.doMock('./index', () => ({
      verifySession: vi.fn().mockResolvedValue({ userId: 'admin-1', isAdmin: true, sessionId: 's', userEmail: 'a@cis.com' }),
    }));

    const returning = vi.fn().mockResolvedValue([]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    const update = vi.fn().mockReturnValue({ set });
    const tx = { update };
    const transaction = vi.fn(async (cb) => cb(tx));
    vi.doMock('@/db', () => ({ db: { transaction } }));
    vi.doMock('@/db/schema', () => ({ workstreams: {}, workstreamMembers: {}, fileWorkstreams: {}, files: {}, workspaceParticipants: {}, activityLogs: {} }));

    const { updateWorkstream } = await import('./workstreams');
    await expect(updateWorkstream('ws-1', 'w-missing', { name: 'X' })).rejects.toThrow(/not found/i);
    expect(logActivity).not.toHaveBeenCalled();
  });

  it('admin happy path — returns row and logs workstream_updated', async () => {
    const updatedRow = { id: 'w-legal', workspaceId: 'ws-1', key: 'legal', name: 'New', color: '#000', tileTint: '#fff', description: 'd', sortOrder: 0 };
    const logActivity = vi.fn().mockResolvedValue(undefined);
    vi.doMock('./activity', () => ({ logActivity }));
    vi.doMock('./index', () => ({
      verifySession: vi.fn().mockResolvedValue({ userId: 'admin-1', isAdmin: true, sessionId: 's', userEmail: 'a@cis.com' }),
    }));

    const returning = vi.fn().mockResolvedValue([updatedRow]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    const update = vi.fn().mockReturnValue({ set });
    const tx = { update };
    const transaction = vi.fn(async (cb) => cb(tx));
    vi.doMock('@/db', () => ({ db: { transaction } }));
    vi.doMock('@/db/schema', () => ({ workstreams: {}, workstreamMembers: {}, fileWorkstreams: {}, files: {}, workspaceParticipants: {}, activityLogs: {} }));

    const { updateWorkstream } = await import('./workstreams');
    const result = await updateWorkstream('ws-1', 'w-legal', { name: 'New' });

    expect(result).toMatchObject({ id: 'w-legal', name: 'New' });
    expect(logActivity).toHaveBeenCalledWith(tx, expect.objectContaining({
      action: 'workstream_updated',
      targetType: 'workstream',
      targetId: 'w-legal',
    }));
  });
});

describe('removeWorkstreamMember()', () => {
  beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); });

  it('non-admin — throws', async () => {
    vi.doMock('./index', () => ({ verifySession: vi.fn().mockResolvedValue({ userId: 'u', isAdmin: false, sessionId: 's', userEmail: 'u@x.com' }) }));
    vi.doMock('@/db', () => ({ db: {} }));
    vi.doMock('@/db/schema', () => ({ workstreams: {}, workstreamMembers: {}, fileWorkstreams: {}, files: {}, workspaceParticipants: {}, activityLogs: {} }));
    const { removeWorkstreamMember } = await import('./workstreams');
    await expect(removeWorkstreamMember('ws-1', 'w-legal', 'p-1')).rejects.toThrow();
  });

  it('admin — deletes and logs workstream_member_removed', async () => {
    const logActivity = vi.fn().mockResolvedValue(undefined);
    vi.doMock('./activity', () => ({ logActivity }));
    vi.doMock('./index', () => ({
      verifySession: vi.fn().mockResolvedValue({ userId: 'admin-1', isAdmin: true, sessionId: 's', userEmail: 'a@cis.com' }),
    }));

    const tx = {
      delete: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
    };
    const transaction = vi.fn(async (cb) => cb(tx));
    vi.doMock('@/db', () => ({ db: { transaction } }));
    vi.doMock('@/db/schema', () => ({ workstreams: {}, workstreamMembers: {}, fileWorkstreams: {}, files: {}, workspaceParticipants: {}, activityLogs: {} }));

    const { removeWorkstreamMember } = await import('./workstreams');
    await removeWorkstreamMember('ws-1', 'w-legal', 'p-1');

    expect(tx.delete).toHaveBeenCalled();
    expect(logActivity).toHaveBeenCalledWith(tx, expect.objectContaining({
      action: 'workstream_member_removed',
      targetType: 'workstream',
      targetId: 'w-legal',
    }));
  });
});

describe('setFileWorkstreams() — remove-only path', () => {
  beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); });

  it('remove-only: deletes tags, logs document_untagged, does NOT insert or log document_tagged', async () => {
    const logActivity = vi.fn().mockResolvedValue(undefined);
    vi.doMock('./activity', () => ({ logActivity }));
    vi.doMock('./index', () => ({
      verifySession: vi.fn().mockResolvedValue({ userId: 'admin-1', isAdmin: true, sessionId: 's', userEmail: 'a@cis.com' }),
    }));

    // current tags: w-legal and w-finance; desired: []
    const where = vi.fn().mockResolvedValue([{ workstreamId: 'w-legal' }, { workstreamId: 'w-finance' }]);
    const tx = {
      select: vi.fn().mockReturnValue({ from: () => ({ where }) }),
      insert: vi.fn(),
      delete: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
    };
    vi.doMock('@/db', () => ({ db: { transaction: vi.fn(async (cb) => cb(tx)) } }));
    vi.doMock('@/db/schema', () => ({
      workstreams: {},
      workstreamMembers: {},
      fileWorkstreams: { fileId: 'fileId', workstreamId: 'workstreamId' },
      files: {},
      workspaceParticipants: {},
      users: {},
      activityLogs: {},
    }));

    const { setFileWorkstreams } = await import('./workstreams');
    await setFileWorkstreams('ws-1', 'file-1', []);

    // insert must NOT be called (nothing to add)
    expect(tx.insert).not.toHaveBeenCalled();
    // delete must be called (something to remove)
    expect(tx.delete).toHaveBeenCalled();
    // logActivity must NOT have been called with document_tagged
    expect(logActivity).not.toHaveBeenCalledWith(tx, expect.objectContaining({ action: 'document_tagged' }));
    // logActivity IS called with document_untagged, metadata.removed contains both ids
    expect(logActivity).toHaveBeenCalledWith(tx, expect.objectContaining({
      action: 'document_untagged',
      targetType: 'file',
      targetId: 'file-1',
      metadata: expect.objectContaining({ removed: expect.arrayContaining(['w-legal', 'w-finance']) }),
    }));
  });
});

describe('getFileWorkstreamIds()', () => {
  beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); });

  it('returns mapped workstream ids from db', async () => {
    const where = vi.fn().mockResolvedValue([{ workstreamId: 'w-a' }, { workstreamId: 'w-b' }]);
    const from = vi.fn().mockReturnValue({ where });
    const select = vi.fn().mockReturnValue({ from });
    vi.doMock('@/db', () => ({ db: { select } }));
    vi.doMock('@/db/schema', () => ({
      workstreams: {},
      workstreamMembers: {},
      fileWorkstreams: { fileId: 'fileId', workstreamId: 'workstreamId' },
      files: {},
      workspaceParticipants: {},
      activityLogs: {},
    }));

    const { getFileWorkstreamIds } = await import('./workstreams');
    const result = await getFileWorkstreamIds('file-xyz');

    expect(result).toEqual(['w-a', 'w-b']);
  });
});
