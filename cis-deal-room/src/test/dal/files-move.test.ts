import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// DB mock — transaction captures the callback and runs it with a tx object
// whose select chain is driven by mockTxSelect (queued resolved values).
// ---------------------------------------------------------------------------
const mockLogActivity = vi.fn().mockResolvedValue(undefined);

vi.mock('@/lib/dal/activity', () => ({
  logActivity: (...args: unknown[]) => mockLogActivity(...args),
}));

vi.mock('@/lib/dal/index', () => ({
  verifySession: vi.fn(),
}));

// Shared queued tx select mock
const mockTxSelect = vi.fn();

function makeTxSelectChain() {
  return {
    from: () => ({
      where: () => ({
        limit: mockTxSelect,
        // For queries without .limit (e.g. inArray lookups without limit)
        then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
          return mockTxSelect().then(onFulfilled, onRejected);
        },
      }),
      innerJoin: () => ({
        where: () => ({
          then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
            return mockTxSelect().then(onFulfilled, onRejected);
          },
        }),
      }),
    }),
  };
}

const mockTxUpdate = vi.fn().mockResolvedValue([]);
const mockTransactionFn = vi.fn();

vi.mock('@/db', () => ({
  db: {
    transaction: (...args: Parameters<typeof mockTransactionFn>) => mockTransactionFn(...args),
  },
}));

import { verifySession } from '@/lib/dal/index';
import { moveFiles } from '@/lib/dal/files';

const ADMIN_SESSION = { userId: 'admin-1', isAdmin: true, userEmail: 'admin@cis.com', sessionId: 's1' };
const NON_ADMIN_SESSION = { userId: 'user-1', isAdmin: false, userEmail: 'user@cis.com', sessionId: 's2' };

const WORKSPACE_ID = '00000000-0000-0000-0000-000000000001';
const DEST_FOLDER_ID = '00000000-0000-0000-0000-000000000010';
const SRC_FOLDER_ID  = '00000000-0000-0000-0000-000000000011';
const FILE_ID_A      = '00000000-0000-0000-0000-000000000100';
const FILE_ID_B      = '00000000-0000-0000-0000-000000000101';

function makeTx() {
  return {
    select: () => makeTxSelectChain(),
    update: () => ({
      set: () => ({
        where: mockTxUpdate,
      }),
    }),
    insert: () => ({
      values: mockLogActivity,
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockTxUpdate.mockResolvedValue([]);
  mockLogActivity.mockResolvedValue(undefined);
});

describe('moveFiles', () => {
  it('returns { moved: [], failed: [] } for empty fileIds', async () => {
    vi.mocked(verifySession).mockResolvedValueOnce(ADMIN_SESSION as any);
    const result = await moveFiles({ fileIds: [], destinationFolderId: DEST_FOLDER_ID });
    expect(result).toEqual({ moved: [], failed: [] });
    expect(mockTransactionFn).not.toHaveBeenCalled();
  });

  it('throws Admin required for non-admin sessions', async () => {
    vi.mocked(verifySession).mockResolvedValueOnce(NON_ADMIN_SESSION as any);
    await expect(
      moveFiles({ fileIds: [FILE_ID_A], destinationFolderId: DEST_FOLDER_ID })
    ).rejects.toThrow('Admin required');
  });

  it('returns failed=destination not found when destination folder missing', async () => {
    vi.mocked(verifySession).mockResolvedValueOnce(ADMIN_SESSION as any);

    const tx = makeTx();
    // First select: destination folder lookup → []
    mockTxSelect.mockResolvedValueOnce([]);

    mockTransactionFn.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(tx));

    const result = await moveFiles({ fileIds: [FILE_ID_A, FILE_ID_B], destinationFolderId: DEST_FOLDER_ID });
    expect(result.moved).toEqual([]);
    expect(result.failed).toEqual([
      { id: FILE_ID_A, reason: 'destination not found' },
      { id: FILE_ID_B, reason: 'destination not found' },
    ]);
  });

  it('returns cross-workspace files in failed', async () => {
    vi.mocked(verifySession).mockResolvedValueOnce(ADMIN_SESSION as any);

    const tx = makeTx();
    // First select: destination folder → found in workspace A
    mockTxSelect.mockResolvedValueOnce([{ id: DEST_FOLDER_ID, workspaceId: WORKSPACE_ID }]);
    // Second select: file lookup → file belongs to workspace B (different)
    mockTxSelect.mockResolvedValueOnce([
      { id: FILE_ID_A, folderId: SRC_FOLDER_ID, folderWorkspaceId: 'workspace-B' },
    ]);

    mockTransactionFn.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(tx));

    const result = await moveFiles({ fileIds: [FILE_ID_A], destinationFolderId: DEST_FOLDER_ID });
    expect(result.moved).toEqual([]);
    expect(result.failed).toEqual([{ id: FILE_ID_A, reason: 'cross-workspace move not allowed' }]);
  });

  it('returns file already in destination as moved (idempotent)', async () => {
    vi.mocked(verifySession).mockResolvedValueOnce(ADMIN_SESSION as any);

    const tx = makeTx();
    // Destination folder
    mockTxSelect.mockResolvedValueOnce([{ id: DEST_FOLDER_ID, workspaceId: WORKSPACE_ID }]);
    // File already in dest folder
    mockTxSelect.mockResolvedValueOnce([
      { id: FILE_ID_A, folderId: DEST_FOLDER_ID, folderWorkspaceId: WORKSPACE_ID },
    ]);

    mockTransactionFn.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(tx));

    const result = await moveFiles({ fileIds: [FILE_ID_A], destinationFolderId: DEST_FOLDER_ID });
    expect(result.moved).toEqual([FILE_ID_A]);
    expect(result.failed).toEqual([]);
    expect(mockLogActivity).not.toHaveBeenCalled();
    expect(mockTxUpdate).not.toHaveBeenCalled();
  });

  it('successful move calls logActivity per moved file with file_moved action and metadata', async () => {
    vi.mocked(verifySession).mockResolvedValueOnce(ADMIN_SESSION as any);

    const tx = makeTx();
    // Destination folder
    mockTxSelect.mockResolvedValueOnce([{ id: DEST_FOLDER_ID, workspaceId: WORKSPACE_ID }]);
    // Both files found in source folder, same workspace
    mockTxSelect.mockResolvedValueOnce([
      { id: FILE_ID_A, folderId: SRC_FOLDER_ID, folderWorkspaceId: WORKSPACE_ID },
      { id: FILE_ID_B, folderId: SRC_FOLDER_ID, folderWorkspaceId: WORKSPACE_ID },
    ]);

    mockTransactionFn.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(tx));

    const result = await moveFiles({ fileIds: [FILE_ID_A, FILE_ID_B], destinationFolderId: DEST_FOLDER_ID });

    expect(result.moved).toContain(FILE_ID_A);
    expect(result.moved).toContain(FILE_ID_B);
    expect(result.failed).toEqual([]);

    // logActivity called once per moved file
    expect(mockLogActivity).toHaveBeenCalledTimes(2);

    const calls = mockLogActivity.mock.calls;
    // Each call: (tx, params)
    for (const [, params] of calls) {
      expect(params.action).toBe('file_moved');
      expect(params.targetType).toBe('file');
      expect(params.workspaceId).toBe(WORKSPACE_ID);
      expect(params.userId).toBe(ADMIN_SESSION.userId);
      expect(params.metadata).toMatchObject({
        sourceFolderId: SRC_FOLDER_ID,
        destinationFolderId: DEST_FOLDER_ID,
      });
    }

    const loggedFileIds = calls.map(([, p]) => p.targetId);
    expect(loggedFileIds).toContain(FILE_ID_A);
    expect(loggedFileIds).toContain(FILE_ID_B);
  });

  it('returns file not found for ids not present in DB', async () => {
    vi.mocked(verifySession).mockResolvedValueOnce(ADMIN_SESSION as any);

    const MISSING_ID = '00000000-0000-0000-0000-000000000999';
    const tx = makeTx();
    // Destination folder found
    mockTxSelect.mockResolvedValueOnce([{ id: DEST_FOLDER_ID, workspaceId: WORKSPACE_ID }]);
    // DB returns only FILE_ID_A, MISSING_ID absent
    mockTxSelect.mockResolvedValueOnce([
      { id: FILE_ID_A, folderId: SRC_FOLDER_ID, folderWorkspaceId: WORKSPACE_ID },
    ]);

    mockTransactionFn.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(tx));

    const result = await moveFiles({ fileIds: [FILE_ID_A, MISSING_ID], destinationFolderId: DEST_FOLDER_ID });
    expect(result.moved).toContain(FILE_ID_A);
    expect(result.failed).toEqual([{ id: MISSING_ID, reason: 'file not found' }]);
  });
});
