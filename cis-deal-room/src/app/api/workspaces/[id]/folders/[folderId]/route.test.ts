import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/dal/index', () => ({ verifySession: vi.fn() }));
vi.mock('@/lib/dal/access', () => ({ requireDealAccess: vi.fn() }));
vi.mock('@/lib/dal/assertions', () => ({ assertFolderInWorkspace: vi.fn() }));
vi.mock('@/lib/dal/folders', () => ({
  renameFolder: vi.fn(),
  deleteFolder: vi.fn(),
}));

import { verifySession } from '@/lib/dal/index';
import { requireDealAccess } from '@/lib/dal/access';
import { assertFolderInWorkspace } from '@/lib/dal/assertions';
import { renameFolder, deleteFolder } from '@/lib/dal/folders';
import { PATCH, DELETE } from './route';

const admin = { sessionId: 's', userId: 'u', userEmail: 'a@b', isAdmin: true };
const W = '11111111-1111-1111-1111-111111111111';
const F = '22222222-2222-2222-2222-222222222222';

beforeEach(() => vi.clearAllMocks());

describe('PATCH /api/workspaces/[id]/folders/[folderId]', () => {
  it('returns 401 when not authenticated', async () => {
    vi.mocked(verifySession).mockResolvedValue(null);
    const res = await PATCH(
      new Request('http://localhost/x', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'New' }),
      }),
      { params: Promise.resolve({ id: W, folderId: F }) }
    );
    expect(res.status).toBe(401);
  });

  it('returns 403 when folderId belongs to another workspace', async () => {
    vi.mocked(verifySession).mockResolvedValue(admin);
    vi.mocked(assertFolderInWorkspace).mockRejectedValue(new Error('Forbidden'));
    const res = await PATCH(
      new Request('http://localhost/x', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'New' }),
      }),
      { params: Promise.resolve({ id: W, folderId: F }) }
    );
    expect(res.status).toBe(403);
    expect(vi.mocked(renameFolder)).not.toHaveBeenCalled();
  });

  it('delegates to renameFolder on happy path', async () => {
    vi.mocked(verifySession).mockResolvedValue(admin);
    vi.mocked(assertFolderInWorkspace).mockResolvedValue(undefined);
    vi.mocked(requireDealAccess).mockResolvedValue(undefined);
    vi.mocked(renameFolder).mockResolvedValue({ id: F, name: 'New' } as any);
    const res = await PATCH(
      new Request('http://localhost/x', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'New' }),
      }),
      { params: Promise.resolve({ id: W, folderId: F }) }
    );
    expect(res.status).toBe(200);
    expect(vi.mocked(renameFolder)).toHaveBeenCalledWith(F, 'New');
  });
});

describe('DELETE /api/workspaces/[id]/folders/[folderId]', () => {
  it('returns 403 when folder not in workspace', async () => {
    vi.mocked(verifySession).mockResolvedValue(admin);
    vi.mocked(assertFolderInWorkspace).mockRejectedValue(new Error('Forbidden'));
    const res = await DELETE(
      new Request('http://localhost/x', { method: 'DELETE' }),
      { params: Promise.resolve({ id: W, folderId: F }) }
    );
    expect(res.status).toBe(403);
  });

  it('delegates to deleteFolder on happy path', async () => {
    vi.mocked(verifySession).mockResolvedValue(admin);
    vi.mocked(assertFolderInWorkspace).mockResolvedValue(undefined);
    vi.mocked(requireDealAccess).mockResolvedValue(undefined);
    vi.mocked(deleteFolder).mockResolvedValue(undefined);
    const res = await DELETE(
      new Request('http://localhost/x', { method: 'DELETE' }),
      { params: Promise.resolve({ id: W, folderId: F }) }
    );
    expect(res.status).toBe(204);
  });
});
