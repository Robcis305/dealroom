import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/dal/index', () => ({ verifySession: vi.fn() }));
const mockReturning = vi.fn();
vi.mock('@/db', () => ({
  db: {
    update: () => ({ set: () => ({ where: () => ({ returning: mockReturning }) }) }),
  },
}));

import { verifySession } from '@/lib/dal/index';
import { POST } from '@/app/api/user/preferences/route';

const session = { sessionId: 's1', userId: 'u1', userEmail: 'a@b.com', isAdmin: false };

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/user/preferences', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/user/preferences', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when no session', async () => {
    vi.mocked(verifySession).mockResolvedValue(null);
    const res = await POST(makeRequest({ notificationDigest: true }));
    expect(res.status).toBe(401);
  });

  it('returns 400 when notificationDigest not a boolean', async () => {
    vi.mocked(verifySession).mockResolvedValue(session);
    const res = await POST(makeRequest({ notificationDigest: 'yes' }));
    expect(res.status).toBe(400);
  });

  it('returns 200 on successful update', async () => {
    vi.mocked(verifySession).mockResolvedValue(session);
    mockReturning.mockResolvedValue([{ id: 'u1', notificationDigest: true }]);
    const res = await POST(makeRequest({ notificationDigest: true }));
    expect(res.status).toBe(200);
  });
});
