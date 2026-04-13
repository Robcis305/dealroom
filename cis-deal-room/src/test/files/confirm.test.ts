import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/dal/files', () => ({
  createFile: vi.fn(),
  checkDuplicate: vi.fn(),
}));

vi.mock('@/lib/dal/index', () => ({
  verifySession: vi.fn(),
}));

vi.mock('@/lib/dal/access', () => ({
  requireFolderAccess: vi.fn().mockResolvedValue(undefined),
}));

import { verifySession } from '@/lib/dal/index';
import { createFile, checkDuplicate } from '@/lib/dal/files';
import { POST } from '@/app/api/files/confirm/route';

const mockSession = { sessionId: 's1', userId: 'u1', userEmail: 'a@b.com', isAdmin: true };

const FOLDER_ID = '550e8400-e29b-41d4-a716-446655440000';
const WORKSPACE_ID = '6ba7b810-9dad-41d1-80b4-00c04fd430c8';

function makeRequest(body: object) {
  return new Request('http://localhost/api/files/confirm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/files/confirm', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when not authenticated', async () => {
    vi.mocked(verifySession).mockResolvedValue(null);
    const res = await POST(makeRequest({ folderId: FOLDER_ID, fileName: 'x.pdf', s3Key: 'k', sizeBytes: 100, mimeType: 'application/pdf', workspaceId: WORKSPACE_ID }));
    expect(res.status).toBe(401);
  });

  it('creates file record and returns 201 on success', async () => {
    vi.mocked(verifySession).mockResolvedValue(mockSession);
    vi.mocked(checkDuplicate).mockResolvedValue(null as any);
    const newFile = { id: 'file-1', name: 'x.pdf', version: 1 };
    vi.mocked(createFile).mockResolvedValue(newFile as any);

    const res = await POST(makeRequest({ folderId: FOLDER_ID, fileName: 'x.pdf', s3Key: 'k/x.pdf', sizeBytes: 100, mimeType: 'application/pdf', workspaceId: WORKSPACE_ID }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe('file-1');
  });

  it('passes previousVersion when a duplicate was confirmed by the user', async () => {
    vi.mocked(verifySession).mockResolvedValue(mockSession);
    vi.mocked(checkDuplicate).mockResolvedValue({ id: 'existing', version: 2 } as any);
    const newFile = { id: 'file-2', name: 'x.pdf', version: 3 };
    vi.mocked(createFile).mockResolvedValue(newFile as any);

    const res = await POST(makeRequest({ folderId: FOLDER_ID, fileName: 'x.pdf', s3Key: 'k/x-v3.pdf', sizeBytes: 100, mimeType: 'application/pdf', workspaceId: WORKSPACE_ID, confirmedVersioning: true }));
    expect(res.status).toBe(201);
    expect(vi.mocked(createFile)).toHaveBeenCalledWith(expect.objectContaining({ previousVersion: 2 }));
  });
});
