import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./index', () => ({ verifySession: vi.fn() }));
vi.mock('./activity', () => ({ logActivity: vi.fn().mockResolvedValue(undefined) }));

describe('listWorkstreamsWithCounts()', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('does NOT seed — returns rows (and empty [] if none) without calling insert', async () => {
    const insert = vi.fn();

    // listWorkstreamsWithCounts reads: workstreams rows, doc counts, member counts, qna counts
    const wsRows = [
      { id: 'w-legal', workspaceId: 'ws-1', key: 'legal', name: 'Legal', color: '#33322F', tileTint: '#ECEBE6', description: 'd', sortOrder: 0 },
    ];
    const select = vi.fn()
      // 1st select: workstreams
      .mockReturnValueOnce({ from: () => ({ where: () => ({ orderBy: vi.fn().mockResolvedValue(wsRows) }) }) })
      // 2nd select: doc counts grouped
      .mockReturnValueOnce({ from: () => ({ innerJoin: () => ({ where: () => ({ groupBy: vi.fn().mockResolvedValue([{ workstreamId: 'w-legal', count: 31 }]) }) }) }) })
      // 3rd select: member counts grouped
      .mockReturnValueOnce({ from: () => ({ innerJoin: () => ({ where: () => ({ groupBy: vi.fn().mockResolvedValue([{ workstreamId: 'w-legal', count: 6 }]) }) }) }) })
      // 4th select: qna counts grouped (openQa=4, overdue=1)
      .mockReturnValueOnce({ from: () => ({ innerJoin: () => ({ where: () => ({ groupBy: vi.fn().mockResolvedValue([{ workstreamId: 'w-legal', openQa: 4, overdue: 1 }]) }) }) }) });

    vi.doMock('@/db', () => ({ db: { insert, select } }));
    vi.doMock('@/db/schema', () => ({ workstreams: {}, workstreamMembers: {}, fileWorkstreams: {}, files: {}, workspaceParticipants: {}, qnaQuestions: {}, qnaQuestionWorkstreams: {} }));

    const { listWorkstreamsWithCounts } = await import('./workstreams');
    const result = await listWorkstreamsWithCounts('ws-1');

    expect(insert).not.toHaveBeenCalled(); // no seeding
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ key: 'legal', docCount: 31, memberCount: 6, openQaCount: 4, overdueCount: 1 });
  });

  it('returns [] when workspace has no workstreams (no seeding)', async () => {
    const insert = vi.fn();
    const select = vi.fn()
      .mockReturnValueOnce({ from: () => ({ where: () => ({ orderBy: vi.fn().mockResolvedValue([]) }) }) })
      .mockReturnValueOnce({ from: () => ({ innerJoin: () => ({ where: () => ({ groupBy: vi.fn().mockResolvedValue([]) }) }) }) })
      .mockReturnValueOnce({ from: () => ({ innerJoin: () => ({ where: () => ({ groupBy: vi.fn().mockResolvedValue([]) }) }) }) })
      .mockReturnValueOnce({ from: () => ({ innerJoin: () => ({ where: () => ({ groupBy: vi.fn().mockResolvedValue([]) }) }) }) });

    vi.doMock('@/db', () => ({ db: { insert, select } }));
    vi.doMock('@/db/schema', () => ({ workstreams: {}, workstreamMembers: {}, fileWorkstreams: {}, files: {}, workspaceParticipants: {}, qnaQuestions: {}, qnaQuestionWorkstreams: {} }));

    const { listWorkstreamsWithCounts } = await import('./workstreams');
    const result = await listWorkstreamsWithCounts('ws-1');

    expect(insert).not.toHaveBeenCalled();
    expect(result).toEqual([]);
  });
});

describe('createWorkstreamByKey()', () => {
  beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); });

  it('non-cis/admin (isCisTeamOrAdmin→false) → throws Forbidden', async () => {
    vi.doMock('./index', () => ({ verifySession: vi.fn().mockResolvedValue({ userId: 'u-1', isAdmin: false, sessionId: 's', userEmail: 'u@x.com' }) }));
    vi.doMock('./access', () => ({ isCisTeamOrAdmin: vi.fn().mockResolvedValue(false) }));
    vi.doMock('@/db', () => ({ db: {} }));
    vi.doMock('@/db/schema', () => ({ workstreams: {}, workstreamMembers: {}, fileWorkstreams: {}, files: {}, workspaceParticipants: {}, activityLogs: {}, qnaQuestions: {}, qnaQuestionWorkstreams: {} }));

    const { createWorkstreamByKey } = await import('./workstreams');
    await expect(createWorkstreamByKey('ws-1', 'legal')).rejects.toThrow('Forbidden');
  });

  it('invalid key → throws Invalid workstream key', async () => {
    vi.doMock('./index', () => ({ verifySession: vi.fn().mockResolvedValue({ userId: 'admin-1', isAdmin: true, sessionId: 's', userEmail: 'a@cis.com' }) }));
    vi.doMock('./access', () => ({ isCisTeamOrAdmin: vi.fn().mockResolvedValue(true) }));
    vi.doMock('@/db', () => ({ db: {} }));
    vi.doMock('@/db/schema', () => ({ workstreams: {}, workstreamMembers: {}, fileWorkstreams: {}, files: {}, workspaceParticipants: {}, activityLogs: {}, qnaQuestions: {}, qnaQuestionWorkstreams: {} }));

    const { createWorkstreamByKey } = await import('./workstreams');
    await expect(createWorkstreamByKey('ws-1', 'bogus')).rejects.toThrow('Invalid workstream key');
  });

  it('valid key + authorized → inserts with canonical values and returns the row', async () => {
    const logActivity = vi.fn().mockResolvedValue(undefined);
    vi.doMock('./activity', () => ({ logActivity }));
    vi.doMock('./index', () => ({ verifySession: vi.fn().mockResolvedValue({ userId: 'admin-1', isAdmin: true, sessionId: 's', userEmail: 'a@cis.com' }) }));
    vi.doMock('./access', () => ({ isCisTeamOrAdmin: vi.fn().mockResolvedValue(true) }));

    const createdRow = { id: 'w-new', workspaceId: 'ws-1', key: 'legal', name: 'Legal', color: '#33322F', tileTint: '#ECEBE6', description: 'Contracts, corporate governance, regulatory & intellectual property', sortOrder: 0 };
    const onConflictDoNothing = vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([createdRow]) });
    const insertValues = vi.fn().mockReturnValue({ onConflictDoNothing });
    const tx = {
      insert: vi.fn().mockReturnValue({ values: insertValues }),
      select: vi.fn(),
    };
    vi.doMock('@/db', () => ({ db: { transaction: vi.fn(async (cb) => cb(tx)) } }));
    vi.doMock('@/db/schema', () => ({ workstreams: {}, workstreamMembers: {}, fileWorkstreams: {}, files: {}, workspaceParticipants: {}, activityLogs: {}, qnaQuestions: {}, qnaQuestionWorkstreams: {} }));

    const { createWorkstreamByKey } = await import('./workstreams');
    const result = await createWorkstreamByKey('ws-1', 'legal');

    expect(tx.insert).toHaveBeenCalled();
    // check values included canonical fields
    expect(insertValues).toHaveBeenCalledWith(expect.objectContaining({ key: 'legal', name: 'Legal', workspaceId: 'ws-1' }));
    expect(logActivity).toHaveBeenCalledWith(tx, expect.objectContaining({ action: 'workstream_updated', targetType: 'workstream', metadata: expect.objectContaining({ created: true, key: 'legal' }) }));
    expect(result).toMatchObject({ id: 'w-new', key: 'legal', name: 'Legal' });
  });

  it('idempotent — conflict returns existing row without logging activity', async () => {
    const logActivity = vi.fn().mockResolvedValue(undefined);
    vi.doMock('./activity', () => ({ logActivity }));
    vi.doMock('./index', () => ({ verifySession: vi.fn().mockResolvedValue({ userId: 'admin-1', isAdmin: true, sessionId: 's', userEmail: 'a@cis.com' }) }));
    vi.doMock('./access', () => ({ isCisTeamOrAdmin: vi.fn().mockResolvedValue(true) }));

    const existingRow = { id: 'w-existing', workspaceId: 'ws-1', key: 'legal', name: 'Legal', color: '#33322F', tileTint: '#ECEBE6', description: 'd', sortOrder: 0 };
    // insert returns [] (conflict), then select returns existing row
    const onConflictDoNothing = vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([]) });
    const insertValues = vi.fn().mockReturnValue({ onConflictDoNothing });
    const limit = vi.fn().mockResolvedValue([existingRow]);
    const where = vi.fn().mockReturnValue({ limit });
    const from = vi.fn().mockReturnValue({ where });
    const tx = {
      insert: vi.fn().mockReturnValue({ values: insertValues }),
      select: vi.fn().mockReturnValue({ from }),
    };
    vi.doMock('@/db', () => ({ db: { transaction: vi.fn(async (cb) => cb(tx)) } }));
    vi.doMock('@/db/schema', () => ({ workstreams: {}, workstreamMembers: {}, fileWorkstreams: {}, files: {}, workspaceParticipants: {}, activityLogs: {}, qnaQuestions: {}, qnaQuestionWorkstreams: {} }));

    const { createWorkstreamByKey } = await import('./workstreams');
    const result = await createWorkstreamByKey('ws-1', 'legal');

    expect(logActivity).not.toHaveBeenCalled();
    expect(result).toMatchObject({ id: 'w-existing', key: 'legal' });
  });
});

describe('setFileWorkstreams()', () => {
  beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); });

  it('admin: diffs current vs desired and logs document_tagged when adding', async () => {
    const logActivity = vi.fn().mockResolvedValue(undefined);
    vi.doMock('./activity', () => ({ logActivity }));
    vi.doMock('./index', () => ({ verifySession: vi.fn().mockResolvedValue({ userId: 'admin-1', isAdmin: true, sessionId: 's', userEmail: 'a@cis.com' }) }));
    vi.doMock('./access', () => ({ isCisTeamOrAdmin: vi.fn().mockResolvedValue(true) }));

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

  function makeAddMemberDb(participantRow: { status: string; role: string } | null) {
    // db.select() outside transaction: participant eligibility lookup
    const limit = vi.fn().mockResolvedValue(participantRow ? [participantRow] : []);
    const selectWhere = vi.fn().mockReturnValue({ limit });
    const selectFrom = vi.fn().mockReturnValue({ where: selectWhere });
    const outerSelect = vi.fn().mockReturnValue({ from: selectFrom });

    const onConflictDoNothing = vi.fn().mockResolvedValue(undefined);
    const insertValues = vi.fn().mockReturnValue({ onConflictDoNothing });
    const tx = { insert: vi.fn().mockReturnValue({ values: insertValues }) };
    const transaction = vi.fn(async (cb: (t: typeof tx) => Promise<unknown>) => cb(tx));

    const db = { select: outerSelect, transaction };
    return { db, tx };
  }

  it('admin: inserts membership and logs activity in a transaction', async () => {
    const logActivity = vi.fn().mockResolvedValue(undefined);
    vi.doMock('./activity', () => ({ logActivity }));
    vi.doMock('./index', () => ({
      verifySession: vi.fn().mockResolvedValue({ userId: 'admin-1', isAdmin: true, sessionId: 's', userEmail: 'a@cis.com' }),
    }));
    vi.doMock('./access', () => ({ isCisTeamOrAdmin: vi.fn().mockResolvedValue(true) }));

    const { db, tx } = makeAddMemberDb({ status: 'active', role: 'participant' });
    vi.doMock('@/db', () => ({ db }));
    vi.doMock('@/db/schema', () => ({ workstreams: {}, workstreamMembers: {}, fileWorkstreams: {}, files: {}, workspaceParticipants: { id: 'id', status: 'status', role: 'role' }, activityLogs: {} }));

    const { addWorkstreamMember } = await import('./workstreams');
    await addWorkstreamMember('ws-1', 'w-legal', 'p-1');

    expect(tx.insert).toHaveBeenCalled();
    expect(logActivity).toHaveBeenCalledWith(tx, expect.objectContaining({ action: 'workstream_member_added', targetType: 'workstream', targetId: 'w-legal' }));
  });

  it('non-admin (helper→false): throws Forbidden', async () => {
    vi.doMock('./index', () => ({ verifySession: vi.fn().mockResolvedValue({ userId: 'u', isAdmin: false, sessionId: 's', userEmail: 'u@x.com' }) }));
    vi.doMock('./access', () => ({ isCisTeamOrAdmin: vi.fn().mockResolvedValue(false) }));
    vi.doMock('@/db', () => ({ db: {} }));
    vi.doMock('@/db/schema', () => ({ workstreams: {}, workstreamMembers: {}, fileWorkstreams: {}, files: {}, workspaceParticipants: {}, activityLogs: {} }));
    const { addWorkstreamMember } = await import('./workstreams');
    await expect(addWorkstreamMember('ws-1', 'w-legal', 'p-1')).rejects.toThrow('Forbidden');
  });

  it('target participant inactive → throws ParticipantNotActive', async () => {
    vi.doMock('./activity', () => ({ logActivity: vi.fn().mockResolvedValue(undefined) }));
    vi.doMock('./index', () => ({
      verifySession: vi.fn().mockResolvedValue({ userId: 'admin-1', isAdmin: true, sessionId: 's', userEmail: 'a@cis.com' }),
    }));
    vi.doMock('./access', () => ({ isCisTeamOrAdmin: vi.fn().mockResolvedValue(true) }));

    const { db, tx } = makeAddMemberDb({ status: 'invited', role: 'participant' });
    vi.doMock('@/db', () => ({ db }));
    vi.doMock('@/db/schema', () => ({ workstreams: {}, workstreamMembers: {}, fileWorkstreams: {}, files: {}, workspaceParticipants: { id: 'id', status: 'status', role: 'role' }, activityLogs: {} }));

    const { addWorkstreamMember } = await import('./workstreams');
    await expect(addWorkstreamMember('ws-1', 'w-legal', 'p-inactive')).rejects.toThrow('ParticipantNotActive');
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it('target participant view_only → throws ParticipantViewOnly', async () => {
    vi.doMock('./activity', () => ({ logActivity: vi.fn().mockResolvedValue(undefined) }));
    vi.doMock('./index', () => ({
      verifySession: vi.fn().mockResolvedValue({ userId: 'admin-1', isAdmin: true, sessionId: 's', userEmail: 'a@cis.com' }),
    }));
    vi.doMock('./access', () => ({ isCisTeamOrAdmin: vi.fn().mockResolvedValue(true) }));

    const { db, tx } = makeAddMemberDb({ status: 'active', role: 'view_only' });
    vi.doMock('@/db', () => ({ db }));
    vi.doMock('@/db/schema', () => ({ workstreams: {}, workstreamMembers: {}, fileWorkstreams: {}, files: {}, workspaceParticipants: { id: 'id', status: 'status', role: 'role' }, activityLogs: {} }));

    const { addWorkstreamMember } = await import('./workstreams');
    await expect(addWorkstreamMember('ws-1', 'w-legal', 'p-vo')).rejects.toThrow('ParticipantViewOnly');
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it('active non-view_only participant → proceeds', async () => {
    const logActivity = vi.fn().mockResolvedValue(undefined);
    vi.doMock('./activity', () => ({ logActivity }));
    vi.doMock('./index', () => ({
      verifySession: vi.fn().mockResolvedValue({ userId: 'admin-1', isAdmin: true, sessionId: 's', userEmail: 'a@cis.com' }),
    }));
    vi.doMock('./access', () => ({ isCisTeamOrAdmin: vi.fn().mockResolvedValue(true) }));

    const { db, tx } = makeAddMemberDb({ status: 'active', role: 'participant' });
    vi.doMock('@/db', () => ({ db }));
    vi.doMock('@/db/schema', () => ({ workstreams: {}, workstreamMembers: {}, fileWorkstreams: {}, files: {}, workspaceParticipants: { id: 'id', status: 'status', role: 'role' }, activityLogs: {} }));

    const { addWorkstreamMember } = await import('./workstreams');
    await addWorkstreamMember('ws-1', 'w-legal', 'p-1');

    expect(tx.insert).toHaveBeenCalled();
    expect(logActivity).toHaveBeenCalledWith(tx, expect.objectContaining({ action: 'workstream_member_added' }));
  });

  it('cis_team non-global-admin (helper→true): inserts membership and logs activity', async () => {
    const logActivity = vi.fn().mockResolvedValue(undefined);
    vi.doMock('./activity', () => ({ logActivity }));
    vi.doMock('./index', () => ({
      verifySession: vi.fn().mockResolvedValue({ userId: 'cis-1', isAdmin: false, sessionId: 's', userEmail: 'cis@cis.com' }),
    }));
    vi.doMock('./access', () => ({ isCisTeamOrAdmin: vi.fn().mockResolvedValue(true) }));

    const { db, tx } = makeAddMemberDb({ status: 'active', role: 'participant' });
    vi.doMock('@/db', () => ({ db }));
    vi.doMock('@/db/schema', () => ({ workstreams: {}, workstreamMembers: {}, fileWorkstreams: {}, files: {}, workspaceParticipants: { id: 'id', status: 'status', role: 'role' }, activityLogs: {} }));

    const { addWorkstreamMember } = await import('./workstreams');
    await addWorkstreamMember('ws-1', 'w-legal', 'p-1');

    expect(tx.insert).toHaveBeenCalled();
    expect(logActivity).toHaveBeenCalledWith(tx, expect.objectContaining({ action: 'workstream_member_added' }));
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
    vi.doMock('./access', () => ({ isCisTeamOrAdmin: vi.fn().mockResolvedValue(true) }));

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
    vi.doMock('./access', () => ({ isCisTeamOrAdmin: vi.fn().mockResolvedValue(true) }));

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

  it('non-admin (helper→false) — throws Forbidden', async () => {
    vi.doMock('./index', () => ({ verifySession: vi.fn().mockResolvedValue({ userId: 'u', isAdmin: false, sessionId: 's', userEmail: 'u@x.com' }) }));
    vi.doMock('./access', () => ({ isCisTeamOrAdmin: vi.fn().mockResolvedValue(false) }));
    vi.doMock('@/db', () => ({ db: {} }));
    vi.doMock('@/db/schema', () => ({ workstreams: {}, workstreamMembers: {}, fileWorkstreams: {}, files: {}, workspaceParticipants: {}, activityLogs: {} }));
    const { removeWorkstreamMember } = await import('./workstreams');
    await expect(removeWorkstreamMember('ws-1', 'w-legal', 'p-1')).rejects.toThrow('Forbidden');
  });

  it('admin — deletes and logs workstream_member_removed', async () => {
    const logActivity = vi.fn().mockResolvedValue(undefined);
    vi.doMock('./activity', () => ({ logActivity }));
    vi.doMock('./index', () => ({
      verifySession: vi.fn().mockResolvedValue({ userId: 'admin-1', isAdmin: true, sessionId: 's', userEmail: 'a@cis.com' }),
    }));
    vi.doMock('./access', () => ({ isCisTeamOrAdmin: vi.fn().mockResolvedValue(true) }));

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
    vi.doMock('./access', () => ({ isCisTeamOrAdmin: vi.fn().mockResolvedValue(true) }));

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

describe('getWorkstreamActivity()', () => {
  beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); });

  it('returns recent rows newest-first with actor names', async () => {
    // First select: fileWorkstreams (from → where) → returns tagged fileIds
    const taggedWhere = vi.fn().mockResolvedValue([{ fileId: 'file-x' }]);
    // Second select: activityLogs (from → innerJoin → where → orderBy → limit) → returns raw db rows
    const dbRows = [{ id: 'a-1', action: 'workstream_member_added', firstName: 'Alice', lastName: 'Okafor', email: 'a@x.com', createdAt: new Date('2026-06-15'), metadata: {} }];
    const limit = vi.fn().mockResolvedValue(dbRows);
    const orderBy = vi.fn().mockReturnValue({ limit });
    const select = vi.fn()
      .mockReturnValueOnce({ from: () => ({ where: taggedWhere }) })
      .mockReturnValueOnce({ from: () => ({ innerJoin: () => ({ where: () => ({ orderBy }) }) }) });
    vi.doMock('@/db', () => ({ db: { select } }));
    vi.doMock('@/db/schema', () => ({ workstreams: {}, workstreamMembers: {}, fileWorkstreams: {}, files: {}, workspaceParticipants: {}, users: {}, activityLogs: {} }));
    vi.doMock('./index', () => ({ verifySession: vi.fn() }));
    vi.doMock('./activity', () => ({ logActivity: vi.fn() }));
    const { getWorkstreamActivity } = await import('./workstreams');
    const result = await getWorkstreamActivity('ws-1', 'w-legal');
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: 'a-1', action: 'workstream_member_added', actorName: 'Alice Okafor' });
    expect(result[0].actorName).toBe('Alice Okafor');
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
