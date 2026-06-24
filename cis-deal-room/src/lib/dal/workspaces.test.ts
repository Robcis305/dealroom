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
  files: {},
  activityLogs: {},
}));

// Stable references to the hoisted mock fns — always resolve to these objects
import { verifySession } from './index';
import { logActivity } from './activity';

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('getWorkspacesForUser()', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.doMock('./index', () => ({ verifySession }));
    vi.doMock('./activity', () => ({ logActivity }));
  });

  it('returns all workspaces for admin users', async () => {
    const mockWorkspaces = [
      { id: 'ws-1', name: 'Deal Alpha' },
      { id: 'ws-2', name: 'Deal Beta' },
    ];

    vi.mocked(verifySession).mockResolvedValue({
      userId: 'admin-1',
      isAdmin: true,
      sessionId: 's1',
      userEmail: 'admin@cis.com',
    });

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
    const mockRows = [{ id: 'ws-1', name: 'Deal Alpha' }];

    vi.mocked(verifySession).mockResolvedValue({
      userId: 'user-1',
      isAdmin: false,
      sessionId: 's2',
      userEmail: 'user@example.com',
    });

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
    expect(result).toEqual(mockRows);
  });

  it('throws Unauthorized when session is null', async () => {
    vi.mocked(verifySession).mockResolvedValue(null);

    const { getWorkspacesForUser } = await import('./workspaces');
    await expect(getWorkspacesForUser()).rejects.toThrow('Unauthorized');
  });
});

describe('deleteWorkspace()', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.doMock('./index', () => ({ verifySession }));
    vi.doMock('./activity', () => ({ logActivity }));
  });

  it('throws Admin required and does NOT call db.delete when called by non-admin', async () => {
    vi.mocked(verifySession).mockResolvedValue({
      userId: 'user-1',
      isAdmin: false,
      sessionId: 's2',
      userEmail: 'user@example.com',
    });

    const deleteMock = vi.fn();
    vi.doMock('@/db', () => ({
      db: { delete: deleteMock },
    }));

    const { deleteWorkspace } = await import('./workspaces');
    await expect(deleteWorkspace('ws-123')).rejects.toThrow('Admin required');
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it('calls db.delete with the workspace id when called by admin', async () => {
    vi.mocked(verifySession).mockResolvedValue({
      userId: 'admin-1',
      isAdmin: true,
      sessionId: 's1',
      userEmail: 'admin@cis.com',
    });

    const whereMock = vi.fn().mockResolvedValue(undefined);
    const deleteMock = vi.fn().mockReturnValue({ where: whereMock });
    vi.doMock('@/db', () => ({
      db: { delete: deleteMock },
    }));

    const { deleteWorkspace } = await import('./workspaces');
    await deleteWorkspace('ws-123');
    expect(deleteMock).toHaveBeenCalledTimes(1);
  });
});

describe('createWorkspace()', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.doMock('./index', () => ({ verifySession }));
    vi.doMock('./activity', () => ({ logActivity }));
  });

  it('creates the workspace + creator participant, without seeding folders', async () => {
    const mockWorkspace = {
      id: 'ws-new',
      name: 'Deal Gamma',
      clientName: 'Gamma Corp',
      cisAdvisorySide: 'buyer_side',
      status: 'engagement',
    };

    const workspaceInsertValuesMock = vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([mockWorkspace]),
    });

    const insertMock = vi.fn().mockReturnValue({ values: workspaceInsertValuesMock });

    const txMock = { insert: insertMock };
    const txFn = vi.fn().mockImplementation(async (fn: (tx: typeof txMock) => Promise<unknown>) => {
      return fn(txMock);
    });

    vi.mocked(verifySession).mockResolvedValue({
      userId: 'admin-1',
      isAdmin: true,
      sessionId: 's1',
      userEmail: 'admin@cis.com',
    });

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
    // Workspace insert + creator-participant insert — and NO folder seeding (would be a 3rd).
    expect(insertMock).toHaveBeenCalledTimes(2);
    // The creator is added as an active CIS Team participant.
    const participantValues = workspaceInsertValuesMock.mock.calls
      .map((c) => c[0])
      .find((v) => v && v.role === 'cis_team');
    expect(participantValues).toMatchObject({
      userId: 'admin-1',
      role: 'cis_team',
      status: 'active',
    });
    expect(participantValues.onboardedAt).toBeInstanceOf(Date);
  });

  it('throws Admin required when called by non-admin', async () => {
    vi.mocked(verifySession).mockResolvedValue({
      userId: 'user-1',
      isAdmin: false,
      sessionId: 's2',
      userEmail: 'user@example.com',
    });

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

describe('updateWorkspaceName()', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.doMock('./index', () => ({ verifySession }));
    vi.doMock('./activity', () => ({ logActivity }));
  });

  function adminSession() {
    vi.mocked(verifySession).mockResolvedValue({
      userId: 'admin-1',
      isAdmin: true,
      sessionId: 's1',
      userEmail: 'admin@cis.com',
    });
  }

  it('throws Admin required and does NOT update when called by non-admin', async () => {
    vi.mocked(verifySession).mockResolvedValue({
      userId: 'user-1',
      isAdmin: false,
      sessionId: 's2',
      userEmail: 'user@example.com',
    });

    const updateMock = vi.fn();
    vi.doMock('@/db', () => ({ db: { update: updateMock } }));

    const { updateWorkspaceName } = await import('./workspaces');
    await expect(updateWorkspaceName('ws-1', 'New Name')).rejects.toThrow('Admin required');
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('throws Name required for blank/whitespace names', async () => {
    adminSession();
    const updateMock = vi.fn();
    vi.doMock('@/db', () => ({ db: { update: updateMock } }));

    const { updateWorkspaceName } = await import('./workspaces');
    await expect(updateWorkspaceName('ws-1', '   ')).rejects.toThrow('Name required');
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('trims, updates, and logs renamed_workspace when called by admin', async () => {
    adminSession();

    const renamed = { id: 'ws-1', name: 'Project Lighthouse' };
    const returningMock = vi.fn().mockResolvedValue([renamed]);
    const whereMock = vi.fn().mockReturnValue({ returning: returningMock });
    const setMock = vi.fn().mockReturnValue({ where: whereMock });
    const updateMock = vi.fn().mockReturnValue({ set: setMock });
    vi.doMock('@/db', () => ({ db: { update: updateMock } }));

    const { updateWorkspaceName } = await import('./workspaces');
    const result = await updateWorkspaceName('ws-1', '  Project Lighthouse  ');

    expect(result).toEqual(renamed);
    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Project Lighthouse' }),
    );
    expect(vi.mocked(logActivity)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'renamed_workspace', metadata: { newName: 'Project Lighthouse' } }),
    );
  });

  it('throws Workspace not found when no row is updated', async () => {
    adminSession();

    const returningMock = vi.fn().mockResolvedValue([]);
    const whereMock = vi.fn().mockReturnValue({ returning: returningMock });
    const setMock = vi.fn().mockReturnValue({ where: whereMock });
    const updateMock = vi.fn().mockReturnValue({ set: setMock });
    vi.doMock('@/db', () => ({ db: { update: updateMock } }));

    const { updateWorkspaceName } = await import('./workspaces');
    await expect(updateWorkspaceName('ws-missing', 'X')).rejects.toThrow('Workspace not found');
  });
});
