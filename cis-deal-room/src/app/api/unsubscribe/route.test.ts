import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockUpdate = vi.fn();
vi.mock('@/db', () => ({
  db: { update: () => ({ set: (x: unknown) => ({ where: () => mockUpdate(x) }) }) },
}));

import { GET } from './route';

beforeEach(() => {
  process.env.UNSUBSCRIBE_SECRET = 'a-strong-secret-at-least-thirty-two-chars';
  vi.clearAllMocks();
});

describe('GET /api/unsubscribe', () => {
  it('rejects invalid token with 400', async () => {
    const res = await GET(new Request('http://localhost/api/unsubscribe?t=nope'));
    expect(res.status).toBe(400);
  });

  it('sets notifyUploads=false for channel=uploads', async () => {
    const { signUnsubscribeToken } = await import('@/lib/email/unsubscribe');
    const t = signUnsubscribeToken({ userId: 'u1', channel: 'uploads' });
    const res = await GET(new Request(`http://localhost/api/unsubscribe?t=${t}`));
    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ notifyUploads: false }));
  });

  it('sets notifyDigest=false for channel=digest', async () => {
    const { signUnsubscribeToken } = await import('@/lib/email/unsubscribe');
    const t = signUnsubscribeToken({ userId: 'u1', channel: 'digest' });
    const res = await GET(new Request(`http://localhost/api/unsubscribe?t=${t}`));
    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ notifyDigest: false }));
  });
});
