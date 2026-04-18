import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { destroySession } from '@/lib/auth/session';

vi.mock('@/lib/auth/session', () => ({
  destroySession: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({ get: () => ({ value: 's1' }) }),
}));

beforeEach(() => {
  vi.mocked(destroySession).mockClear();
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://dealroom.cispartners.co');
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('POST /api/auth/logout CSRF', () => {
  it('returns 403 when Origin is missing and does not destroy session', async () => {
    const { POST } = await import('./route');
    const res = await POST(new Request('https://dealroom.cispartners.co/api/auth/logout', {
      method: 'POST',
    }));
    expect(res.status).toBe(403);
    expect(vi.mocked(destroySession)).not.toHaveBeenCalled();
  });

  it('returns 403 when Origin is cross-origin and does not destroy session', async () => {
    const { POST } = await import('./route');
    const res = await POST(new Request('https://dealroom.cispartners.co/api/auth/logout', {
      method: 'POST',
      headers: { origin: 'https://evil.example' },
    }));
    expect(res.status).toBe(403);
    expect(vi.mocked(destroySession)).not.toHaveBeenCalled();
  });

  it('returns 200 with matching Origin and destroys the session', async () => {
    const { POST } = await import('./route');
    const res = await POST(new Request('https://dealroom.cispartners.co/api/auth/logout', {
      method: 'POST',
      headers: { origin: 'https://dealroom.cispartners.co' },
    }));
    expect(res.status).toBe(200);
    expect(vi.mocked(destroySession)).toHaveBeenCalledWith('s1');
  });
});
