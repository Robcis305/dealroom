import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- mocks ---
const { mockInsert, mockSelect, mockDelete } = vi.hoisted(() => ({
  mockInsert: vi.fn(),
  mockSelect: vi.fn(),
  mockDelete: vi.fn(),
}));

vi.mock('@/db', () => ({
  db: {
    insert: () => ({ values: () => ({ returning: mockInsert }) }),
    select: mockSelect,
    delete: () => ({ where: mockDelete }),
  },
}));

vi.mock('@/lib/dal/index', () => ({
  verifySession: vi.fn(),
}));

vi.mock('@/lib/dal/activity', () => ({
  logActivity: vi.fn(),
}));

import { verifySession } from '@/lib/dal/index';
import {
  getFilesForFolder,
  getFileById,
  checkDuplicate,
  createFile,
  deleteFile,
} from '@/lib/dal/files';

const mockSession = { sessionId: 's1', userId: 'u1', userEmail: 'a@b.com', isAdmin: true };

beforeEach(() => {
  vi.clearAllMocks();
  mockInsert.mockReset();
  mockSelect.mockReset();
  mockDelete.mockReset();
});

describe('getFilesForFolder', () => {
  it('throws Unauthorized when no session', async () => {
    vi.mocked(verifySession).mockResolvedValue(null);
    await expect(getFilesForFolder('folder-1')).rejects.toThrow('Unauthorized');
  });

  it('queries files for the given folderId ordered by createdAt desc', async () => {
    vi.mocked(verifySession).mockResolvedValue(mockSession);
    const rows = [{ id: 'f1', name: 'report.pdf', version: 1 }];
    const chain = { from: vi.fn().mockReturnThis(), innerJoin: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), orderBy: vi.fn().mockResolvedValue(rows) };
    mockSelect.mockReturnValue(chain);
    const result = await getFilesForFolder('folder-1');
    expect(result).toEqual(rows);
  });
});

describe('checkDuplicate', () => {
  it('returns null when no file exists with that name in the folder', async () => {
    vi.mocked(verifySession).mockResolvedValue(mockSession);
    const chain = { from: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), orderBy: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue([]) };
    mockSelect.mockReturnValue(chain);
    const result = await checkDuplicate('folder-1', 'report.pdf');
    expect(result).toBeNull();
  });

  it('returns the existing file when a duplicate exists', async () => {
    vi.mocked(verifySession).mockResolvedValue(mockSession);
    const existing = { id: 'f1', name: 'report.pdf', version: 2 };
    const chain = { from: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), orderBy: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue([existing]) };
    mockSelect.mockReturnValue(chain);
    const result = await checkDuplicate('folder-1', 'report.pdf');
    expect(result).toEqual(existing);
  });
});

describe('createFile', () => {
  it('throws Unauthorized when no session', async () => {
    vi.mocked(verifySession).mockResolvedValue(null);
    await expect(createFile({ folderId: 'f1', name: 'x.pdf', s3Key: 'k', sizeBytes: 100, mimeType: 'application/pdf', workspaceId: 'w1' })).rejects.toThrow('Unauthorized');
  });

  it('inserts a file row and returns it', async () => {
    vi.mocked(verifySession).mockResolvedValue(mockSession);
    const newFile = { id: 'file-1', folderId: 'f1', name: 'x.pdf', version: 1 };
    mockInsert.mockResolvedValue([newFile]);
    const result = await createFile({ folderId: 'f1', name: 'x.pdf', s3Key: 'k/x.pdf', sizeBytes: 100, mimeType: 'application/pdf', workspaceId: 'w1' });
    expect(result).toEqual(newFile);
  });

  it('sets version to previousVersion + 1 when a duplicate exists', async () => {
    vi.mocked(verifySession).mockResolvedValue(mockSession);
    const newFile = { id: 'file-2', folderId: 'f1', name: 'x.pdf', version: 3 };
    mockInsert.mockResolvedValue([newFile]);
    const result = await createFile({ folderId: 'f1', name: 'x.pdf', s3Key: 'k/x-v3.pdf', sizeBytes: 100, mimeType: 'application/pdf', workspaceId: 'w1', previousVersion: 2 });
    expect(result.version).toBe(3);
  });
});

describe('deleteFile', () => {
  it('throws Unauthorized when no session', async () => {
    vi.mocked(verifySession).mockResolvedValue(null);
    await expect(deleteFile('file-1')).rejects.toThrow('Unauthorized');
  });

  it('throws Admin required when non-admin', async () => {
    vi.mocked(verifySession).mockResolvedValue({ ...mockSession, isAdmin: false });
    await expect(deleteFile('file-1')).rejects.toThrow('Admin required');
  });
});

describe('getFileById', () => {
  it('throws Unauthorized when no session', async () => {
    vi.mocked(verifySession).mockResolvedValue(null);
    await expect(getFileById('file-1')).rejects.toThrow('Unauthorized');
  });

  it('returns null when file is not found', async () => {
    vi.mocked(verifySession).mockResolvedValue(mockSession);
    const chain = { from: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue([]) };
    mockSelect.mockReturnValue(chain);
    const result = await getFileById('nonexistent');
    expect(result).toBeNull();
  });
});
