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

const mockFolderQuery = vi.fn();
vi.mock('@/db', () => ({
  db: {
    select: () => ({
      from: () => ({ where: () => ({ limit: mockFolderQuery }) }),
    }),
  },
}));

import { verifySession } from '@/lib/dal/index';
import { getFileById } from '@/lib/dal/files';
import { logActivity } from '@/lib/dal/activity';
import * as s3Module from '@/lib/storage/s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { GET } from '@/app/api/files/[id]/presign-download/route';

const mockSession = { sessionId: 's1', userId: 'u1', userEmail: 'a@b.com', isAdmin: true };
const mockFile = { id: 'file-1', folderId: 'folder-1', name: 'report.pdf', s3Key: 'workspaces/w1/folders/f1/report.pdf', sizeBytes: 1000, mimeType: 'application/pdf', version: 1, uploadedBy: 'u2' };
const mockFolder = { id: 'folder-1', workspaceId: '550e8400-e29b-41d4-a716-446655440000', name: 'Financials', sortOrder: 0 };

function makeRequest(fileId: string, search = '') {
  return new Request(`http://localhost/api/files/${fileId}/presign-download${search}`);
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
    mockFolderQuery.mockResolvedValue([mockFolder]);
    const res = await GET(makeRequest('file-1'), { params: Promise.resolve({ id: 'file-1' }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.url).toMatch(/^stub:\/\//);
    expect(body.fileName).toBe('report.pdf');
  });

  describe('disposition=attachment (default)', () => {
    it('logs downloaded when no disposition param is passed (stub mode)', async () => {
      vi.mocked(verifySession).mockResolvedValue(mockSession);
      vi.mocked(getFileById).mockResolvedValue(mockFile as any);
      mockFolderQuery.mockResolvedValue([mockFolder]);

      await GET(makeRequest('file-1'), { params: Promise.resolve({ id: 'file-1' }) });

      expect(vi.mocked(logActivity)).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ action: 'downloaded' })
      );
    });

    it('logs downloaded when disposition=attachment is explicit (stub mode)', async () => {
      vi.mocked(verifySession).mockResolvedValue(mockSession);
      vi.mocked(getFileById).mockResolvedValue(mockFile as any);
      mockFolderQuery.mockResolvedValue([mockFolder]);

      await GET(makeRequest('file-1', '?disposition=attachment'), { params: Promise.resolve({ id: 'file-1' }) });

      expect(vi.mocked(logActivity)).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ action: 'downloaded' })
      );
    });
  });

  describe('disposition=inline', () => {
    it('does NOT log downloaded when disposition=inline (stub mode)', async () => {
      vi.mocked(verifySession).mockResolvedValue(mockSession);
      vi.mocked(getFileById).mockResolvedValue(mockFile as any);
      mockFolderQuery.mockResolvedValue([mockFolder]);

      await GET(makeRequest('file-1', '?disposition=inline'), { params: Promise.resolve({ id: 'file-1' }) });

      expect(vi.mocked(logActivity)).not.toHaveBeenCalled();
    });
  });

  describe('with S3 bucket configured', () => {
    beforeEach(() => {
      vi.spyOn(s3Module, 'S3_BUCKET', 'get').mockReturnValue('my-bucket');
    });

    it('returns signed URL and logs downloaded for default attachment disposition', async () => {
      vi.mocked(verifySession).mockResolvedValue(mockSession);
      vi.mocked(getFileById).mockResolvedValue(mockFile as any);
      mockFolderQuery.mockResolvedValue([mockFolder]);

      const res = await GET(makeRequest('file-1'), { params: Promise.resolve({ id: 'file-1' }) });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.url).toBe('https://s3.example.com/download');

      expect(vi.mocked(getSignedUrl)).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          input: expect.objectContaining({
            ResponseContentDisposition: 'attachment; filename="report.pdf"',
          }),
        }),
        expect.anything()
      );

      // ResponseContentType must NOT be set for attachment disposition
      const attachmentCall = vi.mocked(getSignedUrl).mock.calls[0];
      const attachmentCmd = attachmentCall[1] as { input: Record<string, unknown> };
      expect(attachmentCmd.input).not.toHaveProperty('ResponseContentType');

      expect(vi.mocked(logActivity)).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ action: 'downloaded' })
      );
    });

    it('returns inline signed URL and does NOT log downloaded for disposition=inline', async () => {
      vi.mocked(verifySession).mockResolvedValue(mockSession);
      vi.mocked(getFileById).mockResolvedValue(mockFile as any);
      mockFolderQuery.mockResolvedValue([mockFolder]);

      const res = await GET(makeRequest('file-1', '?disposition=inline'), { params: Promise.resolve({ id: 'file-1' }) });
      expect(res.status).toBe(200);

      expect(vi.mocked(getSignedUrl)).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          input: expect.objectContaining({
            ResponseContentDisposition: 'inline; filename="report.pdf"',
            ResponseContentType: 'application/pdf',
          }),
        }),
        expect.anything()
      );

      expect(vi.mocked(logActivity)).not.toHaveBeenCalled();
    });
  });
});
