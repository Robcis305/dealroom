import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- mocks ---
const { mockUpdate, mockSelect, mockTransaction } = vi.hoisted(() => ({
  mockUpdate: vi.fn(),
  mockSelect: vi.fn(),
  mockTransaction: vi.fn(),
}));

vi.mock('@/db', () => ({
  db: {
    select: mockSelect,
    update: () => ({ set: () => ({ where: mockUpdate }) }),
    transaction: mockTransaction,
  },
}));

vi.mock('@/lib/dal/index', () => ({
  verifySession: vi.fn(),
}));

vi.mock('@/lib/dal/activity', () => ({
  logActivity: vi.fn(),
}));

import { verifySession } from '@/lib/dal/index';
import { restoreFile } from '@/lib/dal/files';

const mockAdminSession = { sessionId: 's1', userId: 'u1', userEmail: 'admin@test.com', isAdmin: true };
const mockNonAdminSession = { sessionId: 's2', userId: 'u2', userEmail: 'user@test.com', isAdmin: false };

beforeEach(() => {
  vi.clearAllMocks();
  mockUpdate.mockReset();
  mockSelect.mockReset();
  mockTransaction.mockReset();
});

describe('restoreFile', () => {
  it('throws Unauthorized when no session', async () => {
    vi.mocked(verifySession).mockResolvedValue(null);
    await expect(restoreFile('file-1')).rejects.toThrow('Unauthorized');
  });

  it('throws Admin required when non-admin', async () => {
    vi.mocked(verifySession).mockResolvedValue(mockNonAdminSession);
    await expect(restoreFile('file-1')).rejects.toThrow('Admin required');
  });

  it('returns {restored: false} for already-active file (deletedAt === null)', async () => {
    vi.mocked(verifySession).mockResolvedValue(mockAdminSession);

    // Transaction runs the callback with a tx object
    mockTransaction.mockImplementation(async (cb: (tx: unknown) => unknown) => {
      const tx = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnThis(),
          innerJoin: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue([
            { id: 'file-1', deletedAt: null, folderId: 'folder-1', workspaceId: 'ws-1' },
          ]),
        }),
        update: vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn() }) }),
      };
      return cb(tx);
    });

    const result = await restoreFile('file-1');
    expect(result).toEqual({ restored: false });
  });

  it('returns {restored: true} and does not throw for soft-deleted file', async () => {
    vi.mocked(verifySession).mockResolvedValue(mockAdminSession);

    const mockTxUpdate = vi.fn();
    const mockLogActivity = await import('@/lib/dal/activity').then((m) => vi.mocked(m.logActivity));

    mockTransaction.mockImplementation(async (cb: (tx: unknown) => unknown) => {
      const tx = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnThis(),
          innerJoin: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue([
            { id: 'file-1', deletedAt: new Date('2026-05-01'), folderId: 'folder-1', workspaceId: 'ws-1' },
          ]),
        }),
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({ where: mockTxUpdate }),
        }),
      };
      return cb(tx);
    });

    const result = await restoreFile('file-1');
    expect(result).toEqual({ restored: true });
    expect(mockTxUpdate).toHaveBeenCalled();
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'restored', targetId: 'file-1' }),
    );
  });

  it('throws File not found when transaction returns no row', async () => {
    vi.mocked(verifySession).mockResolvedValue(mockAdminSession);

    mockTransaction.mockImplementation(async (cb: (tx: unknown) => unknown) => {
      const tx = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnThis(),
          innerJoin: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue([]),
        }),
      };
      return cb(tx);
    });

    await expect(restoreFile('nonexistent')).rejects.toThrow('File not found');
  });
});
