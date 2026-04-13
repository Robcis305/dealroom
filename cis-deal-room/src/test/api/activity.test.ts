import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSelectOrderBy = vi.fn();

vi.mock('@/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          where: () => ({
            orderBy: () => ({ limit: () => ({ offset: mockSelectOrderBy }) }),
          }),
        }),
      }),
    }),
  },
}));

vi.mock('@/lib/dal/index', () => ({ verifySession: vi.fn() }));
vi.mock('@/lib/dal/access', () => ({ requireDealAccess: vi.fn() }));

import { verifySession } from '@/lib/dal/index';
import { requireDealAccess } from '@/lib/dal/access';
import { GET } from '@/app/api/workspaces/[id]/activity/route';

const adminSession = { sessionId: 's1', userId: 'admin-u', userEmail: 'admin@cis.com', isAdmin: true };
const WORKSPACE_ID = '550e8400-e29b-41d4-a716-446655440000';

function makeGet(query = '') {
  return new Request(`http://localhost/api/workspaces/${WORKSPACE_ID}/activity${query}`);
}

describe('GET /api/workspaces/[id]/activity', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when not authenticated', async () => {
    vi.mocked(verifySession).mockResolvedValue(null);
    const res = await GET(makeGet(), { params: Promise.resolve({ id: WORKSPACE_ID }) });
    expect(res.status).toBe(401);
  });

  it('returns 403 when user lacks deal access', async () => {
    vi.mocked(verifySession).mockResolvedValue(adminSession);
    vi.mocked(requireDealAccess).mockRejectedValue(new Error('Unauthorized'));
    const res = await GET(makeGet(), { params: Promise.resolve({ id: WORKSPACE_ID }) });
    expect(res.status).toBe(403);
  });

  it('returns activity rows on success', async () => {
    vi.mocked(verifySession).mockResolvedValue(adminSession);
    vi.mocked(requireDealAccess).mockResolvedValue(undefined);
    mockSelectOrderBy.mockResolvedValue([
      { id: 'a1', action: 'uploaded', actorEmail: 'u@x.com', createdAt: new Date() },
    ]);
    const res = await GET(makeGet(), { params: Promise.resolve({ id: WORKSPACE_ID }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
  });

  it('accepts ?limit and ?offset query params', async () => {
    vi.mocked(verifySession).mockResolvedValue(adminSession);
    vi.mocked(requireDealAccess).mockResolvedValue(undefined);
    mockSelectOrderBy.mockResolvedValue([]);
    const res = await GET(makeGet('?limit=10&offset=20'), {
      params: Promise.resolve({ id: WORKSPACE_ID }),
    });
    expect(res.status).toBe(200);
  });
});
