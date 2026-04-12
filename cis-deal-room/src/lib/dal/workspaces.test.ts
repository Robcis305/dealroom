import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock DAL dependencies ────────────────────────────────────────────────────

vi.mock('./index', () => ({
  verifySession: vi.fn(),
}));

vi.mock('./activity', () => ({
  logActivity: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/db/schema', () => ({
  workspaces: {},
  workspaceParticipants: {},
  folders: {},
}));

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('getWorkspacesForUser()', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('returns all workspaces for admin users', async () => {
    const mockWorkspaces = [
      { id: 'ws-1', name: 'Deal Alpha' },
      { id: 'ws-2', name: 'Deal Beta' },
    ];

    vi.doMock('./index', () => ({
      verifySession: vi.fn().mockResolvedValue({
        userId: 'admin-1',
        isAdmin: true,
        sessionId: 's1',
        userEmail: 'admin@cis.com',
      }),
    }));

    vi.doMock('@/db', () => ({
      db: {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue(mockWorkspaces),
          }),
        }),
      },
    }));

    const { getWorkspacesForUser } = await import('./workspaces');
    const result = await getWorkspacesForUser();
    expect(result).toEqual(mockWorkspaces);
  });

  it('returns only joined workspaces for non-admin users', async () => {
    const mockRows = [{ workspace: { id: 'ws-1', name: 'Deal Alpha' } }];

    vi.doMock('./index', () => ({
      verifySession: vi.fn().mockResolvedValue({
        userId: 'user-1',
        isAdmin: false,
        sessionId: 's2',
        userEmail: 'user@example.com',
      }),
    }));

    vi.doMock('@/db', () => ({
      db: {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            innerJoin: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                orderBy: vi.fn().mockResolvedValue(mockRows),
              }),
            }),
          }),
        }),
      },
    }));

    const { getWorkspacesForUser } = await import('./workspaces');
    const result = await getWorkspacesForUser();
    expect(result).toEqual(mockRows.map((r) => r.workspace));
  });

  it('throws Unauthorized when session is null', async () => {
    vi.doMock('./index', () => ({
      verifySession: vi.fn().mockResolvedValue(null),
    }));

    const { getWorkspacesForUser } = await import('./workspaces');
    await expect(getWorkspacesForUser()).rejects.toThrow('Unauthorized');
  });
});

describe('createWorkspace()', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('creates workspace and 8 default folders in a transaction', async () => {
    const mockWorkspace = {
      id: 'ws-new',
      name: 'Deal Gamma',
      clientName: 'Gamma Corp',
      cisAdvisorySide: 'buyer_side',
      status: 'engagement',
    };

    const folderInsertValuesMock = vi.fn().mockResolvedValue([]);
    const folderInsertMock = vi.fn().mockReturnValue({ values: folderInsertValuesMock });
    const workspaceInsertValuesMock = vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([mockWorkspace]),
    });
    const workspaceInsertMock = vi.fn().mockReturnValue({ values: workspaceInsertValuesMock });

    // Track insert calls to distinguish workspace vs folder inserts
    let insertCallCount = 0;
    const insertMock = vi.fn().mockImplementation(() => {
      insertCallCount++;
      if (insertCallCount === 1) {
        // First call: workspace insert
        return { values: workspaceInsertValuesMock };
      }
      // Second call: folders insert
      return { values: folderInsertValuesMock };
    });

    const txMock = { insert: insertMock };
    const txFn = vi.fn().mockImplementation(async (fn: (tx: typeof txMock) => Promise<unknown>) => {
      return fn(txMock);
    });

    vi.doMock('./index', () => ({
      verifySession: vi.fn().mockResolvedValue({
        userId: 'admin-1',
        isAdmin: true,
        sessionId: 's1',
        userEmail: 'admin@cis.com',
      }),
    }));

    vi.doMock('./activity', () => ({
      logActivity: vi.fn().mockResolvedValue(undefined),
    }));

    vi.doMock('@/db', () => ({
      db: { transaction: txFn },
    }));

    const { createWorkspace } = await import('./workspaces');
    const result = await createWorkspace({
      name: 'Deal Gamma',
      clientName: 'Gamma Corp',
      cisAdvisorySide: 'buyer_side',
      status: 'engagement',
    });

    expect(result).toEqual(mockWorkspace);
    // Workspace + folders = 2 insert calls
    expect(insertMock).toHaveBeenCalledTimes(2);
    // Folders insert receives 8 items
    const foldersCallArg = folderInsertValuesMock.mock.calls[0][0];
    expect(Array.isArray(foldersCallArg)).toBe(true);
    expect(foldersCallArg).toHaveLength(8);
  });

  it('throws Admin required when called by non-admin', async () => {
    vi.doMock('./index', () => ({
      verifySession: vi.fn().mockResolvedValue({
        userId: 'user-1',
        isAdmin: false,
        sessionId: 's2',
        userEmail: 'user@example.com',
      }),
    }));

    const { createWorkspace } = await import('./workspaces');
    await expect(
      createWorkspace({
        name: 'Deal Delta',
        clientName: 'Delta Corp',
        cisAdvisorySide: 'seller_side',
        status: 'engagement',
      })
    ).rejects.toThrow('Admin required');
  });
});
