import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/dal/index', () => ({
  verifySession: vi.fn(),
}));
vi.mock('@/lib/dal/access', () => ({
  requireFolderAccess: vi.fn(),
}));
vi.mock('@/lib/dal/activity', () => ({
  logActivity: vi.fn(),
}));
vi.mock('@/db', () => ({
  db: {
    select: vi.fn(),
  },
}));

import { POST } from '@/app/api/files/[id]/log-preview/route';
import { verifySession } from '@/lib/dal/index';
import { requireFolderAccess } from '@/lib/dal/access';
import { logActivity } from '@/lib/dal/activity';
import { db } from '@/db';

const session = { sessionId: 's1', userId: 'u1', userEmail: 'a@b.com', isAdmin: false };

describe('POST /api/files/[id]/log-preview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function makeRequest(fileId: string) {
    return new Request(`http://localhost/api/files/${fileId}/log-preview`, { method: 'POST' });
  }

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(verifySession).mockResolvedValue(null);
    const res = await POST(makeRequest('11111111-1111-1111-1111-111111111111'), {
      params: Promise.resolve({ id: '11111111-1111-1111-1111-111111111111' }),
    });
    expect(res.status).toBe(401);
  });

  it('returns 404 when file does not exist', async () => {
    vi.mocked(verifySession).mockResolvedValue(session as never);
    const chain = {
      from: () => ({ innerJoin: () => ({ where: () => ({ limit: async () => [] }) }) }),
    };
    vi.mocked(db.select).mockReturnValue(chain as never);
    const res = await POST(makeRequest('22222222-2222-2222-2222-222222222222'), {
      params: Promise.resolve({ id: '22222222-2222-2222-2222-222222222222' }),
    });
    expect(res.status).toBe(404);
  });

  it('returns 403 when user lacks folder access', async () => {
    vi.mocked(verifySession).mockResolvedValue(session as never);
    const chain = {
      from: () => ({
        innerJoin: () => ({
          where: () => ({
            limit: async () => [{ id: 'f1', folderId: 'fd1', workspaceId: 'w1' }],
          }),
        }),
      }),
    };
    vi.mocked(db.select).mockReturnValue(chain as never);
    vi.mocked(requireFolderAccess).mockRejectedValue(new Error('forbidden'));
    const res = await POST(makeRequest('33333333-3333-3333-3333-333333333333'), {
      params: Promise.resolve({ id: '33333333-3333-3333-3333-333333333333' }),
    });
    expect(res.status).toBe(403);
  });

  it('returns 200 and calls logActivity with action=previewed', async () => {
    vi.mocked(verifySession).mockResolvedValue(session as never);
    const chain = {
      from: () => ({
        innerJoin: () => ({
          where: () => ({
            limit: async () => [{ id: 'f1', folderId: 'fd1', workspaceId: 'w1' }],
          }),
        }),
      }),
    };
    vi.mocked(db.select).mockReturnValue(chain as never);
    vi.mocked(requireFolderAccess).mockResolvedValue(undefined as never);
    vi.mocked(logActivity).mockResolvedValue(undefined as never);

    const res = await POST(makeRequest('44444444-4444-4444-4444-444444444444'), {
      params: Promise.resolve({ id: '44444444-4444-4444-4444-444444444444' }),
    });
    expect(res.status).toBe(200);
    expect(logActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: 'previewed',
        targetType: 'file',
        targetId: 'f1',
        workspaceId: 'w1',
        userId: 'u1',
      })
    );
  });
});
