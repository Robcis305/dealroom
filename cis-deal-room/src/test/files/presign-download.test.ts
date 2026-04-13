import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/dal/files', () => ({
  getFileById: vi.fn(),
}));

vi.mock('@/lib/storage/s3', () => ({
  getS3Client: vi.fn(() => ({})),
  S3_BUCKET: undefined,
}));

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://s3.example.com/download'),
}));

vi.mock('@/lib/dal/index', () => ({
  verifySession: vi.fn(),
}));

vi.mock('@/lib/dal/access', () => ({
  requireFolderAccess: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/dal/activity', () => ({
  logActivity: vi.fn(),
}));

vi.mock('@/db', () => ({ db: {} }));

import { verifySession } from '@/lib/dal/index';
import { getFileById } from '@/lib/dal/files';
import { GET } from '@/app/api/files/[id]/presign-download/route';

const mockSession = { sessionId: 's1', userId: 'u1', userEmail: 'a@b.com', isAdmin: true };
const mockFile = { id: 'file-1', folderId: 'folder-1', name: 'report.pdf', s3Key: 'workspaces/w1/folders/f1/report.pdf', sizeBytes: 1000, mimeType: 'application/pdf', version: 1, uploadedBy: 'u2' };

function makeRequest(fileId: string) {
  return new Request(`http://localhost/api/files/${fileId}/presign-download`);
}

describe('GET /api/files/[id]/presign-download', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when not authenticated', async () => {
    vi.mocked(verifySession).mockResolvedValue(null);
    const res = await GET(makeRequest('file-1'), { params: Promise.resolve({ id: 'file-1' }) });
    expect(res.status).toBe(401);
  });

  it('returns 404 when file does not exist', async () => {
    vi.mocked(verifySession).mockResolvedValue(mockSession);
    vi.mocked(getFileById).mockResolvedValue(null as any);
    const res = await GET(makeRequest('nope'), { params: Promise.resolve({ id: 'nope' }) });
    expect(res.status).toBe(404);
  });

  it('returns stub download URL when AWS_S3_BUCKET is not set', async () => {
    vi.mocked(verifySession).mockResolvedValue(mockSession);
    vi.mocked(getFileById).mockResolvedValue(mockFile as any);
    const res = await GET(makeRequest('file-1'), { params: Promise.resolve({ id: 'file-1' }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.url).toMatch(/^stub:\/\//);
    expect(body.fileName).toBe('report.pdf');
  });
});
