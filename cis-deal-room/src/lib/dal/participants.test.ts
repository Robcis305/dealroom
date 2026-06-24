import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Static mocks (evaluated once at module-parse time) ───────────────────────

vi.mock('./index', () => ({
  verifySession: vi.fn(),
}));

vi.mock('./activity', () => ({
  logActivity: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/db/schema', () => ({
  users: {},
  workspaceParticipants: {},
  folderAccess: {},
  folders: {},
  magicLinkTokens: {},
  sessions: {},
  workstreams: {},
  workstreamMembers: {},
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ADMIN_SESSION = {
  userId: 'admin-1',
  isAdmin: true,
  sessionId: 's1',
  userEmail: 'admin@cis.com',
};

/** Build a tx mock whose insert/delete chains are tracked via spies. */
function buildTxMock({
  selectResponses = [] as unknown[],
  insertValuesMock = vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([]) }),
  deleteMock = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
} = {}) {
  let selectCallIdx = 0;
  const selectMock = vi.fn().mockImplementation(() => {
    const response = selectResponses[selectCallIdx++] ?? { from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }) };
    return response;
  });
  const insertMock = vi.fn().mockReturnValue({ values: insertValuesMock });
  return { select: selectMock, insert: insertMock, delete: deleteMock, update: vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }) }) };
}

// ─── inviteParticipant ────────────────────────────────────────────────────────

describe('inviteParticipant() — workstream membership', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('deletes existing workstream memberships and inserts new ones', async () => {
    const participantId = 'part-1';
    const userId = 'user-1';
    const workstreamId = 'w1';

    vi.doMock('./index', () => ({
      verifySession: vi.fn().mockResolvedValue(ADMIN_SESSION),
    }));

    vi.doMock('./activity', () => ({
      logActivity: vi.fn().mockResolvedValue(undefined),
    }));

    // Capture insert/delete calls inside the transaction
    const insertValuesSpy = vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([]) });
    const deleteWhereSpy = vi.fn().mockResolvedValue(undefined);
    const deleteSpy = vi.fn().mockReturnValue({ where: deleteWhereSpy });
    const insertSpy = vi.fn().mockReturnValue({ values: insertValuesSpy });

    // update mock
    const updateSpy = vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }) });

    const txMock = {
      select: vi.fn()
        // 1st call: find existing user → returns [{ id: userId }]
        .mockReturnValueOnce({ from: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([{ id: userId }]) }) }) })
        // 2nd call: find existing participant → returns [] (new participant)
        .mockReturnValueOnce({ from: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }) }) })
        // 3rd call: assertAllFoldersInWorkspace — no folderIds, so this won't be called
        // 3rd call: assertAllWorkstreamsInWorkspace → workstream belongs to correct workspace
        .mockReturnValueOnce({ from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([{ id: workstreamId, workspaceId: 'ws-1' }]) }) }),
      insert: insertSpy,
      delete: deleteSpy,
      update: updateSpy,
    };

    const txFn = vi.fn().mockImplementation(async (fn: (tx: typeof txMock) => Promise<unknown>) => fn(txMock));

    // insertSpy is called multiple times; returning behaviour per call:
    // 1st insert: users.insert returning userId (already exists so won't be called)
    // 1st insert: workspaceParticipants.insert returning participantId
    // 2nd insert: magicLinkTokens.insert
    // 3rd insert: workstreamMembers.insert
    insertValuesSpy
      .mockReturnValueOnce({ returning: vi.fn().mockResolvedValue([{ id: participantId, workspaceId: 'ws-1', userId, role: 'client', status: 'invited' }]) })
      .mockReturnValueOnce(undefined) // magicLinkTokens insert (no returning needed)
      .mockReturnValueOnce(undefined); // workstreamMembers insert

    vi.doMock('@/db', () => ({
      db: { transaction: txFn },
    }));

    const { inviteParticipant } = await import('./participants');
    await inviteParticipant({
      workspaceId: 'ws-1',
      email: 'user@example.com',
      role: 'client',
      folderIds: [],
      workstreamIds: [workstreamId],
    });

    // Verify delete was called for workstream_members
    // The delete mock returns { where: deleteWhereSpy } for every call
    // deleteSpy is called: 1) folderAccess delete, 2) magicLinkTokens delete, 3) workstreamMembers delete
    expect(deleteSpy).toHaveBeenCalledTimes(3);

    // Verify workstreamMembers insert was called with correct payload
    const allInsertValueCalls = insertValuesSpy.mock.calls.map((c) => c[0]);
    const workstreamInsert = allInsertValueCalls.find(
      (v) => Array.isArray(v) && v[0]?.workstreamId === workstreamId
    );
    expect(workstreamInsert).toBeDefined();
    expect(workstreamInsert[0]).toMatchObject({
      workstreamId,
      participantId,
      addedBy: ADMIN_SESSION.userId,
    });
  });
});

// ─── assertAllWorkstreamsInWorkspace (exercised via inviteParticipant) ─────────

describe('assertAllWorkstreamsInWorkspace — guard paths', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('throws "Forbidden" when a workstream belongs to another workspace', async () => {
    vi.doMock('./index', () => ({
      verifySession: vi.fn().mockResolvedValue(ADMIN_SESSION),
    }));

    vi.doMock('./activity', () => ({
      logActivity: vi.fn().mockResolvedValue(undefined),
    }));

    const txMock = {
      select: vi.fn()
        .mockReturnValueOnce({ from: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([{ id: 'user-1' }]) }) }) })
        .mockReturnValueOnce({ from: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }) }) })
        // assertAllWorkstreamsInWorkspace: workstream belongs to 'ws-OTHER'
        .mockReturnValueOnce({ from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([{ id: 'w-bad', workspaceId: 'ws-OTHER' }]) }) }),
      insert: vi.fn().mockReturnValue({ values: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([{ id: 'part-1', workspaceId: 'ws-1', userId: 'user-1', role: 'client', status: 'invited' }]) }) }),
      delete: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
      update: vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }) }),
    };

    const txFn = vi.fn().mockImplementation(async (fn: (tx: typeof txMock) => Promise<unknown>) => fn(txMock));

    vi.doMock('@/db', () => ({
      db: { transaction: txFn },
    }));

    const { inviteParticipant } = await import('./participants');
    await expect(
      inviteParticipant({
        workspaceId: 'ws-1',
        email: 'user@example.com',
        role: 'client',
        folderIds: [],
        workstreamIds: ['w-bad'],
      })
    ).rejects.toThrow('Forbidden');
  });

  it('throws "Workstream not found" when a workstream id does not exist', async () => {
    vi.doMock('./index', () => ({
      verifySession: vi.fn().mockResolvedValue(ADMIN_SESSION),
    }));

    vi.doMock('./activity', () => ({
      logActivity: vi.fn().mockResolvedValue(undefined),
    }));

    const txMock = {
      select: vi.fn()
        .mockReturnValueOnce({ from: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([{ id: 'user-1' }]) }) }) })
        .mockReturnValueOnce({ from: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }) }) })
        // assertAllWorkstreamsInWorkspace: returns empty (workstream not found)
        .mockReturnValueOnce({ from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }) }),
      insert: vi.fn().mockReturnValue({ values: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([{ id: 'part-1', workspaceId: 'ws-1', userId: 'user-1', role: 'client', status: 'invited' }]) }) }),
      delete: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
      update: vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }) }),
    };

    const txFn = vi.fn().mockImplementation(async (fn: (tx: typeof txMock) => Promise<unknown>) => fn(txMock));

    vi.doMock('@/db', () => ({
      db: { transaction: txFn },
    }));

    const { inviteParticipant } = await import('./participants');
    await expect(
      inviteParticipant({
        workspaceId: 'ws-1',
        email: 'user@example.com',
        role: 'client',
        folderIds: [],
        workstreamIds: ['w-missing'],
      })
    ).rejects.toThrow('Workstream not found');
  });
});

// ─── markOnboarded ────────────────────────────────────────────────────────────

describe('markOnboarded()', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('issues UPDATE on workspace_participants setting onboardedAt, scoped to workspaceId + userId', async () => {
    const session = {
      userId: 'user-42',
      isAdmin: false,
      sessionId: 's1',
      userEmail: 'user@example.com',
    };

    const whereSpy = vi.fn().mockResolvedValue(undefined);
    const setSpy = vi.fn().mockReturnValue({ where: whereSpy });
    const updateSpy = vi.fn().mockReturnValue({ set: setSpy });

    vi.doMock('@/db', () => ({
      db: { update: updateSpy },
    }));

    const { markOnboarded } = await import('./participants');
    await markOnboarded('ws-1', session);

    expect(updateSpy).toHaveBeenCalledTimes(1);
    expect(setSpy).toHaveBeenCalledTimes(1);
    const setArg = setSpy.mock.calls[0][0];
    expect(setArg).toHaveProperty('onboardedAt');
    expect(setArg.onboardedAt).toBeInstanceOf(Date);
    expect(whereSpy).toHaveBeenCalledTimes(1);
  });
});

// ─── getWelcomeForParticipant ──────────────────────────────────────────────────

describe('getWelcomeForParticipant()', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('returns null when participant has onboardedAt set', async () => {
    const session = {
      userId: 'user-1',
      isAdmin: false,
      sessionId: 's1',
      userEmail: 'user@example.com',
    };

    // select().from().where().limit() → row with onboardedAt set
    vi.doMock('@/db', () => ({
      db: {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([
                { id: 'part-1', role: 'client', onboardedAt: new Date('2025-01-01') },
              ]),
            }),
          }),
        }),
      },
    }));

    const { getWelcomeForParticipant } = await import('./participants');
    const result = await getWelcomeForParticipant('ws-1', session, 'buyer_side');
    expect(result).toBeNull();
  });

  it('returns null when no participant row exists', async () => {
    const session = {
      userId: 'user-1',
      isAdmin: false,
      sessionId: 's1',
      userEmail: 'user@example.com',
    };

    vi.doMock('@/db', () => ({
      db: {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      },
    }));

    const { getWelcomeForParticipant } = await import('./participants');
    const result = await getWelcomeForParticipant('ws-1', session, 'buyer_side');
    expect(result).toBeNull();
  });

  it('returns { roleLabel, folders, workstreams } when active + onboardedAt null', async () => {
    const session = {
      userId: 'user-1',
      isAdmin: false,
      sessionId: 's1',
      userEmail: 'user@example.com',
    };

    let selectCallIdx = 0;
    vi.doMock('@/db', () => ({
      db: {
        select: vi.fn().mockImplementation(() => {
          const idx = selectCallIdx++;
          if (idx === 0) {
            // participant lookup
            return {
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue([
                    { id: 'part-1', role: 'client', onboardedAt: null },
                  ]),
                }),
              }),
            };
          } else if (idx === 1) {
            // folder names query
            return {
              from: vi.fn().mockReturnValue({
                innerJoin: vi.fn().mockReturnValue({
                  where: vi.fn().mockResolvedValue([
                    { name: 'Financials' },
                    { name: 'Legal' },
                  ]),
                }),
              }),
            };
          } else {
            // workstream names query
            return {
              from: vi.fn().mockReturnValue({
                innerJoin: vi.fn().mockReturnValue({
                  where: vi.fn().mockResolvedValue([
                    { name: 'Due Diligence' },
                  ]),
                }),
              }),
            };
          }
        }),
      },
    }));

    const { getWelcomeForParticipant } = await import('./participants');
    const result = await getWelcomeForParticipant('ws-1', session, 'buyer_side');

    expect(result).not.toBeNull();
    expect(result?.roleLabel).toBe('Client');
    expect(result?.folders).toEqual(['Financials', 'Legal']);
    expect(result?.workstreams).toEqual(['Due Diligence']);
  });
});

// ─── getParticipants — workstreamIds shape ────────────────────────────────────

describe('getParticipants() — returns workstreamIds', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('returns rows carrying workstreamIds from the subquery', async () => {
    const mockRows = [
      {
        id: 'part-1',
        userId: 'user-1',
        email: 'user@example.com',
        firstName: 'Jane',
        lastName: 'Doe',
        role: 'client',
        status: 'active',
        invitedAt: new Date(),
        activatedAt: null,
        folderIds: ['f-1'],
        workstreamIds: ['w-1', 'w-2'],
        lastSeen: null,
      },
    ];

    vi.doMock('./index', () => ({
      verifySession: vi.fn().mockResolvedValue(ADMIN_SESSION),
    }));

    vi.doMock('@/db', () => ({
      db: {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            innerJoin: vi.fn().mockReturnValue({
              leftJoin: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                  groupBy: vi.fn().mockResolvedValue(mockRows),
                }),
              }),
            }),
          }),
        }),
      },
    }));

    const { getParticipants } = await import('./participants');
    const result = await getParticipants('ws-1');

    expect(result).toHaveLength(1);
    expect(result[0]).toHaveProperty('workstreamIds');
    expect(result[0].workstreamIds).toEqual(['w-1', 'w-2']);
  });
});
