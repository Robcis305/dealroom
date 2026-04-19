import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/dal/index', () => ({ verifySession: vi.fn() }));
vi.mock('@/lib/dal/access', () => ({ requireFolderAccess: vi.fn() }));
vi.mock('@/lib/dal/files', () => ({ getFileVersions: vi.fn(), getFileById: vi.fn() }));
vi.mock('@/lib/dal/assertions', () => ({ assertFileInWorkspace: vi.fn() }));

import { verifySession } from '@/lib/dal/index';
import { requireFolderAccess } from '@/lib/dal/access';
import { getFileVersions, getFileById } from '@/lib/dal/files';
import { assertFileInWorkspace } from '@/lib/dal/assertions';
import { GET } from '@/app/api/workspaces/[id]/files/[fileId]/versions/route';

const session = { sessionId: 's1', userId: 'u1', userEmail: 'a@b.com', isAdmin: true };
const WS = '550e8400-e29b-41d4-a716-446655440000';
const FILE = '6ba7b810-9dad-41d1-80b4-00c04fd430c8';

function makeReq() {
  return new Request(`http://localhost/api/workspaces/${WS}/files/${FILE}/versions`);
}

describe('GET /workspaces/[id]/files/[fileId]/versions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(assertFileInWorkspace).mockResolvedValue(undefined);
  });

  it('returns 401 when no session', async () => {
    vi.mocked(verifySession).mockResolvedValue(null);
    const res = await GET(makeReq(), { params: Promise.resolve({ id: WS, fileId: FILE }) });
    expect(res.status).toBe(401);
  });

  it('returns 404 when file not found', async () => {
    vi.mocked(verifySession).mockResolvedValue(session);
    vi.mocked(getFileById).mockResolvedValue(null as any);
    const res = await GET(makeReq(), { params: Promise.resolve({ id: WS, fileId: FILE }) });
    expect(res.status).toBe(404);
  });

  it('returns 200 with versions on success', async () => {
    vi.mocked(verifySession).mockResolvedValue(session);
    vi.mocked(getFileById).mockResolvedValue({ id: FILE, folderId: 'f1' } as any);
    vi.mocked(requireFolderAccess).mockResolvedValue(undefined);
    vi.mocked(getFileVersions).mockResolvedValue([
      { id: 'v1', version: 2 },
      { id: 'v2', version: 1 },
    ] as any);
    const res = await GET(makeReq(), { params: Promise.resolve({ id: WS, fileId: FILE }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(2);
  });

  it('returns 403 when fileId belongs to a different workspace', async () => {
    vi.mocked(verifySession).mockResolvedValue(session);
    vi.mocked(getFileById).mockResolvedValue({ id: FILE, folderId: 'f1' } as any);
    vi.mocked(requireFolderAccess).mockResolvedValue(undefined);
    vi.mocked(assertFileInWorkspace).mockRejectedValue(new Error('Forbidden'));
    const res = await GET(
      makeReq(),
      { params: Promise.resolve({ id: WS, fileId: FILE }) }
    );
    expect(res.status).toBe(403);
  });
});
