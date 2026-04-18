import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth/session', () => ({
  destroySession: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({ get: () => ({ value: 's1' }) }),
}));

beforeEach(() => {
  process.env.NEXT_PUBLIC_APP_URL = 'https://dealroom.cispartners.co';
});

describe('POST /api/auth/logout CSRF', () => {
  it('returns 403 when Origin is missing', async () => {
    const { POST } = await import('./route');
    const res = await POST(new Request('https://dealroom.cispartners.co/api/auth/logout', {
      method: 'POST',
    }));
    expect(res.status).toBe(403);
  });

  it('returns 403 when Origin is cross-origin', async () => {
    const { POST } = await import('./route');
    const res = await POST(new Request('https://dealroom.cispartners.co/api/auth/logout', {
      method: 'POST',
      headers: { origin: 'https://evil.example' },
    }));
    expect(res.status).toBe(403);
  });

  it('returns 200 with matching Origin', async () => {
    const { POST } = await import('./route');
    const res = await POST(new Request('https://dealroom.cispartners.co/api/auth/logout', {
      method: 'POST',
      headers: { origin: 'https://dealroom.cispartners.co' },
    }));
    expect(res.status).toBe(200);
  });
});
