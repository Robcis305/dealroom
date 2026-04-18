import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth/rate-limit', () => ({
  authSendLimiter: { limit: vi.fn().mockResolvedValue({ success: true }) },
}));
vi.mock('@/lib/auth/tokens', () => ({
  generateToken: vi.fn().mockReturnValue('raw'),
  hashToken: vi.fn().mockReturnValue('h'),
}));
vi.mock('@/lib/email/send', () => ({ sendEmail: vi.fn().mockResolvedValue({ id: 'stub' }) }));
vi.mock('@/lib/email/magic-link', () => ({ MagicLinkEmail: () => null }));
vi.mock('@/db', () => ({
  db: {
    delete: () => ({ where: () => Promise.resolve() }),
    insert: () => ({ values: () => Promise.resolve() }),
  },
}));

beforeEach(() => {
  process.env.NEXT_PUBLIC_APP_URL = 'https://dealroom.cispartners.co';
});

describe('POST /api/auth/send CSRF', () => {
  it('returns 403 when Origin is cross-origin', async () => {
    const { POST } = await import('./route');
    const res = await POST(new Request('https://dealroom.cispartners.co/api/auth/send', {
      method: 'POST',
      headers: { origin: 'https://evil.example', 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'u@x.com' }),
    }) as any);
    expect(res.status).toBe(403);
  });

  it('returns 200 with matching Origin', async () => {
    const { POST } = await import('./route');
    const res = await POST(new Request('https://dealroom.cispartners.co/api/auth/send', {
      method: 'POST',
      headers: { origin: 'https://dealroom.cispartners.co', 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'u@x.com' }),
    }) as any);
    expect(res.status).toBe(200);
  });
});
