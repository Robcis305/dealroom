import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSelectLimit = vi.fn();

vi.mock('@/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          innerJoin: () => ({
            where: () => ({ limit: mockSelectLimit }),
          }),
        }),
        where: () => ({ limit: mockSelectLimit }),
      }),
    }),
  },
}));

import { requireDealAccess } from '@/lib/dal/access';

const adminSession = { sessionId: 's1', userId: 'u1', userEmail: 'admin@cis.com', isAdmin: true };
const clientSession = { sessionId: 's2', userId: 'u2', userEmail: 'client@acme.com', isAdmin: false };
const WORKSPACE_ID = '550e8400-e29b-41d4-a716-446655440000';

describe('requireDealAccess', () => {
  beforeEach(() => vi.clearAllMocks());

  it('admin bypasses and does not query DB', async () => {
    await requireDealAccess(WORKSPACE_ID, adminSession);
    expect(mockSelectLimit).not.toHaveBeenCalled();
  });

  it('non-admin with active participant row resolves', async () => {
    mockSelectLimit.mockResolvedValue([{ id: 'p1', status: 'active' }]);
    await expect(requireDealAccess(WORKSPACE_ID, clientSession)).resolves.toBeUndefined();
  });

  it('non-admin with no participant row throws Unauthorized', async () => {
    mockSelectLimit.mockResolvedValue([]);
    await expect(requireDealAccess(WORKSPACE_ID, clientSession)).rejects.toThrow('Unauthorized');
  });

  it('non-admin with only an invited (not active) row throws Unauthorized', async () => {
    mockSelectLimit.mockResolvedValue([]);
    await expect(requireDealAccess(WORKSPACE_ID, clientSession)).rejects.toThrow('Unauthorized');
  });
});

import { requireFolderAccess } from '@/lib/dal/access';

const FOLDER_ID = '6ba7b810-9dad-41d1-80b4-00c04fd430c8';

describe('requireFolderAccess', () => {
  beforeEach(() => vi.clearAllMocks());

  it('admin bypasses and does not query DB', async () => {
    await requireFolderAccess(FOLDER_ID, adminSession, 'upload');
    expect(mockSelectLimit).not.toHaveBeenCalled();
  });

  it('throws Unauthorized when user has no folder_access row', async () => {
    mockSelectLimit.mockResolvedValue([]);
    await expect(
      requireFolderAccess(FOLDER_ID, clientSession, 'download')
    ).rejects.toThrow('Unauthorized');
  });

  it('client with folder_access can download', async () => {
    mockSelectLimit.mockResolvedValue([{ role: 'client' }]);
    await expect(
      requireFolderAccess(FOLDER_ID, clientSession, 'download')
    ).resolves.toBeUndefined();
  });

  it('client with folder_access can upload', async () => {
    mockSelectLimit.mockResolvedValue([{ role: 'client' }]);
    await expect(
      requireFolderAccess(FOLDER_ID, clientSession, 'upload')
    ).resolves.toBeUndefined();
  });

  it('view_only with folder_access can download', async () => {
    mockSelectLimit.mockResolvedValue([{ role: 'view_only' }]);
    await expect(
      requireFolderAccess(FOLDER_ID, clientSession, 'download')
    ).resolves.toBeUndefined();
  });

  it('view_only with folder_access cannot upload', async () => {
    mockSelectLimit.mockResolvedValue([{ role: 'view_only' }]);
    await expect(
      requireFolderAccess(FOLDER_ID, clientSession, 'upload')
    ).rejects.toThrow('Forbidden');
  });
});
