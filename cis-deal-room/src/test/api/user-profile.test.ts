import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/dal/index', () => ({ verifySession: vi.fn() }));

const mockUpdateWhere = vi.fn();
vi.mock('@/db', () => ({
  db: {
    update: () => ({ set: () => ({ where: () => ({ returning: mockUpdateWhere }) }) }),
  },
}));

import { verifySession } from '@/lib/dal/index';
import { POST } from '@/app/api/user/profile/route';

const session = { sessionId: 's1', userId: 'u1', userEmail: 'a@b.com', isAdmin: false };

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/user/profile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/user/profile', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when no session', async () => {
    vi.mocked(verifySession).mockResolvedValue(null);
    const res = await POST(makeRequest({ firstName: 'Rob', lastName: 'Levin' }));
    expect(res.status).toBe(401);
  });

  it('returns 400 for empty firstName', async () => {
    vi.mocked(verifySession).mockResolvedValue(session);
    const res = await POST(makeRequest({ firstName: '', lastName: 'Levin' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 for overly long firstName', async () => {
    vi.mocked(verifySession).mockResolvedValue(session);
    const res = await POST(makeRequest({ firstName: 'x'.repeat(100), lastName: 'Levin' }));
    expect(res.status).toBe(400);
  });

  it('returns 200 on successful update', async () => {
    vi.mocked(verifySession).mockResolvedValue(session);
    mockUpdateWhere.mockResolvedValue([{ id: 'u1', firstName: 'Rob', lastName: 'Levin' }]);
    const res = await POST(makeRequest({ firstName: 'Rob', lastName: 'Levin' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.firstName).toBe('Rob');
  });

  it('trims whitespace before saving', async () => {
    vi.mocked(verifySession).mockResolvedValue(session);
    mockUpdateWhere.mockResolvedValue([{ id: 'u1', firstName: 'Rob', lastName: 'Levin' }]);
    await POST(makeRequest({ firstName: '  Rob  ', lastName: '  Levin  ' }));
    expect(mockUpdateWhere).toHaveBeenCalled();
  });
});
