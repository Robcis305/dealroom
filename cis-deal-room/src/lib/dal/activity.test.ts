import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the db module (also mocked globally in setup.ts)
vi.mock('@/db', () => {
  const insertMock = vi.fn().mockReturnValue({
    values: vi.fn().mockResolvedValue([]),
  });
  return { db: { insert: insertMock } };
});

vi.mock('@/db/schema', () => ({
  activityLogs: { id: 'id', workspaceId: 'workspace_id' },
}));

describe('logActivity()', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('inserts an immutable activity log row with correct fields', async () => {
    const valuesMock = vi.fn().mockResolvedValue([]);
    const insertMock = vi.fn().mockReturnValue({ values: valuesMock });
    const mockDb = { insert: insertMock } as unknown as typeof import('@/db').db;

    const { logActivity } = await import('./activity');
    await logActivity(mockDb, {
      workspaceId: 'ws-1',
      userId: 'user-1',
      action: 'created_workspace',
      targetType: 'workspace',
      targetId: 'ws-1',
    });

    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws-1',
        userId: 'user-1',
        action: 'created_workspace',
        targetType: 'workspace',
        targetId: 'ws-1',
      })
    );
  });

  it('works within a transaction context', async () => {
    const valuesMock = vi.fn().mockResolvedValue([]);
    const insertMock = vi.fn().mockReturnValue({ values: valuesMock });
    // Simulate a transaction object (same interface as db)
    const txMock = { insert: insertMock } as unknown as typeof import('@/db').db;

    const { logActivity } = await import('./activity');
    await logActivity(txMock, {
      workspaceId: 'ws-2',
      userId: 'user-2',
      action: 'created_folder',
      targetType: 'folder',
    });

    // logActivity must use the tx object, not import db directly
    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws-2',
        action: 'created_folder',
      })
    );
  });

  it('stores metadata as jsonb when provided', async () => {
    const valuesMock = vi.fn().mockResolvedValue([]);
    const insertMock = vi.fn().mockReturnValue({ values: valuesMock });
    const mockDb = { insert: insertMock } as unknown as typeof import('@/db').db;

    const { logActivity } = await import('./activity');
    const metadata = { oldName: 'Legal', newName: 'Legal Docs' };

    await logActivity(mockDb, {
      workspaceId: 'ws-3',
      userId: 'user-3',
      action: 'renamed_folder',
      targetType: 'folder',
      metadata,
    });

    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({ metadata })
    );
  });
});
