import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/lib/dal/index', () => ({
  verifySession: vi.fn(),
}));

vi.mock('@/lib/dal/files', () => ({
  getFilesForBulkDownload: vi.fn(),
}));

vi.mock('@/lib/dal/access', () => ({
  requireFileAccess: vi.fn(),
}));

vi.mock('@/lib/storage/s3', () => ({
  getS3Client: vi.fn(() => ({ send: vi.fn() })),
  S3_BUCKET: 'test-bucket',
}));

vi.mock('@/lib/dal/activity', () => ({
  logActivity: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/db', () => ({
  db: {},
}));

// Minimal archiver mock — enough for the early-exit paths we test.
// The happy-path (actual zip body) is verified manually on a preview deploy.
vi.mock('archiver', () => ({
  default: vi.fn(() => ({
    on: vi.fn(),
    append: vi.fn(),
    finalize: vi.fn().mockResolvedValue(undefined),
    destroy: vi.fn(),
  })),
}));

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { verifySession } from '@/lib/dal/index';
import { getFilesForBulkDownload } from '@/lib/dal/files';
import { requireFileAccess } from '@/lib/dal/access';
import { POST } from '@/app/api/files/download-zip/route';

// ─── Test data ────────────────────────────────────────────────────────────────

const ADMIN_SESSION = {
  sessionId: 's1',
  userId: 'u1',
  userEmail: 'admin@example.com',
  isAdmin: true,
};

const UUID_A = '550e8400-e29b-41d4-a716-446655440001';
const UUID_B = '550e8400-e29b-41d4-a716-446655440002';
const WS_ID  = '550e8400-e29b-41d4-a716-446655440010';
const WS_ID2 = '550e8400-e29b-41d4-a716-446655440011';

function makeFileRow(id: string, workspaceId: string) {
  return {
    id,
    name: `file-${id}.pdf`,
    s3Key: `workspaces/${workspaceId}/file-${id}.pdf`,
    folderId: 'folder-1',
    workspaceId,
  };
}

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/files/download-zip', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/files/download-zip', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: the caller may access every file. Individual tests override
    // with mockRejectedValue to simulate a file the caller can't download.
    vi.mocked(requireFileAccess).mockResolvedValue(undefined);
  });

  // ── Auth ──────────────────────────────────────────────────────────────────

  it('returns 401 when no session', async () => {
    vi.mocked(verifySession).mockResolvedValue(null);
    const res = await POST(makeRequest({ fileIds: [UUID_A] }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
  });

  it('allows a non-admin who can access the file (per-file authorization)', async () => {
    vi.mocked(verifySession).mockResolvedValue({ ...ADMIN_SESSION, isAdmin: false });
    vi.mocked(getFilesForBulkDownload).mockResolvedValue([makeFileRow(UUID_A, WS_ID)]);
    vi.mocked(requireFileAccess).mockResolvedValue(undefined);
    const res = await POST(makeRequest({ fileIds: [UUID_A] }));
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/zip');
  });

  it('returns 404 when a non-admin cannot access any requested file', async () => {
    vi.mocked(verifySession).mockResolvedValue({ ...ADMIN_SESSION, isAdmin: false });
    vi.mocked(getFilesForBulkDownload).mockResolvedValue([makeFileRow(UUID_A, WS_ID)]);
    vi.mocked(requireFileAccess).mockRejectedValue(new Error('Unauthorized'));
    const res = await POST(makeRequest({ fileIds: [UUID_A] }));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('No accessible files');
  });

  it('drops files the caller cannot access and zips only the accessible ones', async () => {
    vi.mocked(verifySession).mockResolvedValue({ ...ADMIN_SESSION, isAdmin: false });
    vi.mocked(getFilesForBulkDownload).mockResolvedValue([
      makeFileRow(UUID_A, WS_ID),
      makeFileRow(UUID_B, WS_ID),
    ]);
    // Deny the first file, allow the second.
    vi.mocked(requireFileAccess).mockImplementation(async (fileId: string) => {
      if (fileId === UUID_A) throw new Error('Unauthorized');
    });
    const res = await POST(makeRequest({ fileIds: [UUID_A, UUID_B] }));
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/zip');
  });

  // ── Validation ────────────────────────────────────────────────────────────

  it('returns 400 when fileIds is empty', async () => {
    vi.mocked(verifySession).mockResolvedValue(ADMIN_SESSION);
    const res = await POST(makeRequest({ fileIds: [] }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when fileIds contains a non-uuid string', async () => {
    vi.mocked(verifySession).mockResolvedValue(ADMIN_SESSION);
    const res = await POST(makeRequest({ fileIds: ['not-a-uuid'] }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when body is missing fileIds', async () => {
    vi.mocked(verifySession).mockResolvedValue(ADMIN_SESSION);
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it('returns 400 when body is not JSON-parseable', async () => {
    vi.mocked(verifySession).mockResolvedValue(ADMIN_SESSION);
    const req = new Request('http://localhost/api/files/download-zip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json at all',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  // ── Not found ─────────────────────────────────────────────────────────────

  it('returns 404 when none of the file IDs match', async () => {
    vi.mocked(verifySession).mockResolvedValue(ADMIN_SESSION);
    vi.mocked(getFilesForBulkDownload).mockResolvedValue([]);
    const res = await POST(makeRequest({ fileIds: [UUID_A, UUID_B] }));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('No accessible files');
  });

  // ── Cross-workspace guard ─────────────────────────────────────────────────

  it('returns 400 when files span multiple workspaces', async () => {
    vi.mocked(verifySession).mockResolvedValue(ADMIN_SESSION);
    vi.mocked(getFilesForBulkDownload).mockResolvedValue([
      makeFileRow(UUID_A, WS_ID),
      makeFileRow(UUID_B, WS_ID2),
    ]);
    const res = await POST(makeRequest({ fileIds: [UUID_A, UUID_B] }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Files span multiple workspaces');
  });
});
