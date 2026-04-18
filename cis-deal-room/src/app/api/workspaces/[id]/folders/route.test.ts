import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/dal/index', () => ({ verifySession: vi.fn() }));
vi.mock('@/lib/dal/access', () => ({ requireDealAccess: vi.fn() }));
vi.mock('@/lib/dal/folders', () => ({ createFolder: vi.fn(), getFoldersForWorkspace: vi.fn() }));

import { verifySession } from '@/lib/dal/index';
import { requireDealAccess } from '@/lib/dal/access';
import { createFolder } from '@/lib/dal/folders';
import { POST } from './route';

const W = '11111111-1111-1111-1111-111111111111';

beforeEach(() => vi.clearAllMocks());

describe('POST /api/workspaces/[id]/folders', () => {
  it('returns 401 when not authenticated', async () => {
    vi.mocked(verifySession).mockResolvedValue(null);
    const res = await POST(
      new Request('http://localhost/x', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'F' }),
      }),
      { params: Promise.resolve({ id: W }) }
    );
    expect(res.status).toBe(401);
  });

  it('returns 403 when user has no workspace access', async () => {
    vi.mocked(verifySession).mockResolvedValue({ userId: 'u', isAdmin: false } as any);
    vi.mocked(requireDealAccess).mockRejectedValue(new Error('Unauthorized'));
    const res = await POST(
      new Request('http://localhost/x', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'F' }),
      }),
      { params: Promise.resolve({ id: W }) }
    );
    expect(res.status).toBe(403);
    expect(vi.mocked(createFolder)).not.toHaveBeenCalled();
  });
});
