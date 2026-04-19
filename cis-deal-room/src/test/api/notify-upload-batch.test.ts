import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/dal/index', () => ({ verifySession: vi.fn() }));
vi.mock('@/lib/dal/access', () => ({ requireFolderAccess: vi.fn() }));
vi.mock('@/lib/notifications/enqueue-or-send', () => ({ enqueueOrSend: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/dal/activity', () => ({ logActivity: vi.fn() }));

const mockFetchBatch = vi.fn();
vi.mock('@/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          innerJoin: () => ({
            where: () => mockFetchBatch(),
          }),
          where: () => mockFetchBatch(),
        }),
        where: () => mockFetchBatch(),
      }),
    }),
  },
}));

import { verifySession } from '@/lib/dal/index';
import { requireFolderAccess } from '@/lib/dal/access';
import { enqueueOrSend } from '@/lib/notifications/enqueue-or-send';
import { POST } from '@/app/api/workspaces/[id]/notify-upload-batch/route';

const adminSession = { sessionId: 's1', userId: 'admin-u', userEmail: 'admin@cis.com', isAdmin: true };
const WORKSPACE_ID = '550e8400-e29b-41d4-a716-446655440000';
const FOLDER_ID = '6ba7b810-9dad-41d1-80b4-00c04fd430c8';
const FILE_ID = '7aa8c920-aebe-42e2-9102-00d15fd542d9';

function makePost(body: object) {
  return new Request(`http://localhost/api/workspaces/${WORKSPACE_ID}/notify-upload-batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/workspaces/[id]/notify-upload-batch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.UNSUBSCRIBE_SECRET = 'a-strong-secret-at-least-thirty-two-chars';
  });

  it('returns 401 when not authenticated', async () => {
    vi.mocked(verifySession).mockResolvedValue(null);
    const res = await POST(
      makePost({ folderId: FOLDER_ID, fileIds: [FILE_ID] }),
      { params: Promise.resolve({ id: WORKSPACE_ID }) }
    );
    expect(res.status).toBe(401);
  });

  it('returns 403 when user lacks folder upload access', async () => {
    vi.mocked(verifySession).mockResolvedValue(adminSession);
    vi.mocked(requireFolderAccess).mockRejectedValue(new Error('Unauthorized'));
    const res = await POST(
      makePost({ folderId: FOLDER_ID, fileIds: [FILE_ID] }),
      { params: Promise.resolve({ id: WORKSPACE_ID }) }
    );
    expect(res.status).toBe(403);
  });

  it('returns 400 for invalid body', async () => {
    vi.mocked(verifySession).mockResolvedValue(adminSession);
    const res = await POST(
      makePost({ folderId: FOLDER_ID, fileIds: [] }),
      { params: Promise.resolve({ id: WORKSPACE_ID }) }
    );
    expect(res.status).toBe(400);
  });

  it('sends no emails when no other participants have download access', async () => {
    vi.mocked(verifySession).mockResolvedValue(adminSession);
    vi.mocked(requireFolderAccess).mockResolvedValue(undefined);
    // First query: files → [{id, name, sizeBytes}]  (uses .where().limit())
    // Second query: workspace → [{name}]             (uses .where().limit())
    // Third query: folder → [{name}]                 (uses .where().limit())
    // Fourth query: participants with download access → []  (uses .innerJoin().where())
    mockFetchBatch
      .mockResolvedValueOnce([{ id: FILE_ID, name: 'x.pdf', sizeBytes: 100 }])
      .mockResolvedValueOnce([{ name: 'Workspace' }])
      .mockResolvedValueOnce([{ name: 'Folder' }])
      .mockResolvedValueOnce([]);
    const res = await POST(
      makePost({ folderId: FOLDER_ID, fileIds: [FILE_ID] }),
      { params: Promise.resolve({ id: WORKSPACE_ID }) }
    );
    expect(res.status).toBe(200);
    expect(vi.mocked(enqueueOrSend)).not.toHaveBeenCalled();
  });

  it('sends one email per eligible recipient', async () => {
    vi.mocked(verifySession).mockResolvedValue(adminSession);
    vi.mocked(requireFolderAccess).mockResolvedValue(undefined);
    mockFetchBatch
      .mockResolvedValueOnce([{ id: FILE_ID, name: 'x.pdf', sizeBytes: 100 }])
      .mockResolvedValueOnce([{ name: 'Workspace' }])
      .mockResolvedValueOnce([{ name: 'Folder' }])
      .mockResolvedValueOnce([
        { email: 'a@x.com', userId: 'u-a', role: 'client' },
        { email: 'b@x.com', userId: 'u-b', role: 'view_only' },
      ]);
    const res = await POST(
      makePost({ folderId: FOLDER_ID, fileIds: [FILE_ID] }),
      { params: Promise.resolve({ id: WORKSPACE_ID }) }
    );
    expect(res.status).toBe(200);
    expect(vi.mocked(enqueueOrSend)).toHaveBeenCalledTimes(2);
  });
});
