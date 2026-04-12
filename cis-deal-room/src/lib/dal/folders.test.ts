import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/db/schema', () => ({
  folders: {},
}));

describe('getFolders()', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('returns folders for a workspace ordered by sortOrder', async () => {
    const mockFolders = [
      { id: 'f-1', name: 'Financials', sortOrder: 0 },
      { id: 'f-2', name: 'Legal', sortOrder: 1 },
    ];

    vi.doMock('./index', () => ({
      verifySession: vi.fn().mockResolvedValue({
        userId: 'user-1',
        isAdmin: false,
        sessionId: 's1',
        userEmail: 'user@example.com',
      }),
    }));

    vi.doMock('@/db', () => ({
      db: {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockResolvedValue(mockFolders),
            }),
          }),
        }),
      },
    }));

    const { getFoldersForWorkspace } = await import('./folders');
    const result = await getFoldersForWorkspace('ws-1');
    expect(result).toEqual(mockFolders);
  });
});

describe('createFolder()', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('inserts a new folder and returns the created row', async () => {
    const mockFolder = { id: 'f-new', name: 'Contracts', sortOrder: 8, workspaceId: 'ws-1' };

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
      db: {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([{ maxOrder: 7 }]),
          }),
        }),
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([mockFolder]),
          }),
        }),
      },
    }));

    const { createFolder } = await import('./folders');
    const result = await createFolder('ws-1', 'Contracts');
    expect(result).toEqual(mockFolder);
  });
});

describe('renameFolder()', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('updates the folder name by id', async () => {
    const existingFolder = { id: 'f-1', name: 'Legal', sortOrder: 1, workspaceId: 'ws-1' };
    const updatedFolder = { ...existingFolder, name: 'Legal Docs' };

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

    let selectCallCount = 0;
    vi.doMock('@/db', () => ({
      db: {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([existingFolder]),
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([updatedFolder]),
            }),
          }),
        }),
      },
    }));

    const { renameFolder } = await import('./folders');
    const result = await renameFolder('f-1', 'Legal Docs');
    expect(result).toEqual(updatedFolder);
  });
});

describe('deleteFolder()', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('deletes a folder by id', async () => {
    const existingFolder = { id: 'f-1', name: 'Legal', sortOrder: 1, workspaceId: 'ws-1' };

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

    const deleteMock = vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    });

    vi.doMock('@/db', () => ({
      db: {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([existingFolder]),
            }),
          }),
        }),
        delete: deleteMock,
      },
    }));

    const { deleteFolder } = await import('./folders');
    await deleteFolder('f-1');
    expect(deleteMock).toHaveBeenCalledTimes(1);
  });
});
