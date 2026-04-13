import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/dal/files', () => ({
  checkDuplicate: vi.fn(),
}));

vi.mock('@/lib/storage/s3', () => ({
  getS3Client: vi.fn(() => ({})),
  S3_BUCKET: undefined,
}));

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://s3.example.com/presigned'),
}));

vi.mock('@/lib/dal/index', () => ({
  verifySession: vi.fn(),
}));

vi.mock('@/lib/dal/access', () => ({
  requireFolderAccess: vi.fn().mockResolvedValue(undefined),
}));

import { verifySession } from '@/lib/dal/index';
import { checkDuplicate } from '@/lib/dal/files';
import { POST } from '@/app/api/files/presign-upload/route';

const mockSession = { sessionId: 's1', userId: 'u1', userEmail: 'a@b.com', isAdmin: true };

function makeRequest(body: object) {
  return new Request('http://localhost/api/files/presign-upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/files/presign-upload', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when not authenticated', async () => {
    vi.mocked(verifySession).mockResolvedValue(null);
    const res = await POST(makeRequest({ folderId: 'f1', fileName: 'x.pdf', mimeType: 'application/pdf', sizeBytes: 100, workspaceId: 'w1' }));
    expect(res.status).toBe(401);
  });

  it('returns 400 when file type is not allowed', async () => {
    vi.mocked(verifySession).mockResolvedValue(mockSession);
    const res = await POST(makeRequest({ folderId: 'f1', fileName: 'virus.exe', mimeType: 'application/x-msdownload', sizeBytes: 100, workspaceId: 'w1' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/file type/i);
  });

  it('returns 400 when file exceeds 500MB', async () => {
    vi.mocked(verifySession).mockResolvedValue(mockSession);
    const res = await POST(makeRequest({ folderId: 'f1', fileName: 'huge.pdf', mimeType: 'application/pdf', sizeBytes: 501 * 1024 * 1024, workspaceId: 'w1' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/size/i);
  });

  it('returns duplicate:true when filename exists in folder', async () => {
    vi.mocked(verifySession).mockResolvedValue(mockSession);
    vi.mocked(checkDuplicate).mockResolvedValue({ id: 'existing-file', version: 1 } as any);
    const res = await POST(makeRequest({ folderId: 'f1', fileName: 'report.pdf', mimeType: 'application/pdf', sizeBytes: 1000, workspaceId: 'w1' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.duplicate).toBe(true);
    expect(body.existingFileId).toBe('existing-file');
  });

  it('returns stub response when AWS_S3_BUCKET is not set', async () => {
    vi.mocked(verifySession).mockResolvedValue(mockSession);
    vi.mocked(checkDuplicate).mockResolvedValue(null as any);
    const res = await POST(makeRequest({ folderId: 'f1', fileName: 'report.pdf', mimeType: 'application/pdf', sizeBytes: 1000, workspaceId: 'w1' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.presignedUrl).toBeNull();
    expect(body.s3Key).toMatch(/^stub\//);
  });
});
