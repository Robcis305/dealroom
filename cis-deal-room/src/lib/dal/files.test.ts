import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./index', () => ({ verifySession: vi.fn() }));
vi.mock('./activity', () => ({ logActivity: vi.fn().mockResolvedValue(undefined) }));

import { verifySession } from './index';

// Minimal schema stub — the DAL only references these as opaque table objects.
const mockSchema = {
  files: {}, folders: {}, users: {}, checklistItems: {}, checklistItemFiles: {},
  fileWorkstreams: {}, folderAccess: {}, workspaceParticipants: {},
};

describe('getFilesForWorkstream()', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.doMock('./index', () => ({ verifySession }));
    vi.doMock('@/db/schema', () => mockSchema);
  });

  it('throws Unauthorized when there is no session', async () => {
    vi.mocked(verifySession).mockResolvedValue(null);
    vi.doMock('@/db', () => ({ db: {} }));

    const { getFilesForWorkstream } = await import('./files');
    await expect(getFilesForWorkstream('ws-1', 'wstream-1')).rejects.toThrow('Unauthorized');
  });

  it('returns [] for a non-admin with no folder access (never runs the file query)', async () => {
    vi.mocked(verifySession).mockResolvedValue({
      userId: 'user-1', isAdmin: false, sessionId: 's', userEmail: 'u@cis.com',
    });

    // folderAccess query → no rows
    const accessWhere = vi.fn().mockResolvedValue([]);
    const accessInnerJoin = vi.fn().mockReturnValue({ where: accessWhere });
    const accessFrom = vi.fn().mockReturnValue({ innerJoin: accessInnerJoin });
    const select = vi.fn().mockReturnValue({ from: accessFrom });

    vi.doMock('@/db', () => ({ db: { select } }));

    const { getFilesForWorkstream } = await import('./files');
    const result = await getFilesForWorkstream('ws-1', 'wstream-1');

    expect(result).toEqual([]);
    // Only the access-scope query ran — the file-listing query was never reached.
    expect(select).toHaveBeenCalledTimes(1);
  });

  it('admin skips folder-access scoping and returns the tagged files', async () => {
    vi.mocked(verifySession).mockResolvedValue({
      userId: 'admin-1', isAdmin: true, sessionId: 's', userEmail: 'admin@cis.com',
    });

    const rows = [{ id: 'f1', folderName: 'Legal', name: 'NDA.pdf' }];
    const orderBy = vi.fn().mockResolvedValue(rows);
    const where = vi.fn().mockReturnValue({ orderBy });
    const innerJoin3 = vi.fn().mockReturnValue({ where });
    const innerJoin2 = vi.fn().mockReturnValue({ innerJoin: innerJoin3 });
    const innerJoin1 = vi.fn().mockReturnValue({ innerJoin: innerJoin2 });
    const from = vi.fn().mockReturnValue({ innerJoin: innerJoin1 });
    const select = vi.fn().mockReturnValue({ from });

    vi.doMock('@/db', () => ({ db: { select } }));

    const { getFilesForWorkstream } = await import('./files');
    const result = await getFilesForWorkstream('ws-1', 'wstream-1');

    expect(result).toEqual(rows);
    // Admin runs exactly one query (no separate access-scope query).
    expect(select).toHaveBeenCalledTimes(1);
  });
});
