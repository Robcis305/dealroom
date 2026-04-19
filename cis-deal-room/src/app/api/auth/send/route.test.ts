import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sendEmail } from '@/lib/email/send';
import { authSendLimiter } from '@/lib/auth/rate-limit';

const dbDelete = vi.fn().mockResolvedValue(undefined);
const dbInsert = vi.fn().mockResolvedValue(undefined);

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
    delete: () => ({ where: dbDelete }),
    insert: () => ({ values: dbInsert }),
  },
}));

beforeEach(() => {
  vi.mocked(sendEmail).mockClear();
  vi.mocked(authSendLimiter.limit).mockClear();
  dbDelete.mockClear();
  dbInsert.mockClear();
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://dealroom.cispartners.co');
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('POST /api/auth/send CSRF', () => {
  it('returns 403 when Origin is cross-origin and skips rate limit + email', async () => {
    const { POST } = await import('./route');
    const res = await POST(new Request('https://dealroom.cispartners.co/api/auth/send', {
      method: 'POST',
      headers: { origin: 'https://evil.example', 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'u@x.com' }),
    }) as any);
    expect(res.status).toBe(403);
    expect(vi.mocked(authSendLimiter.limit)).not.toHaveBeenCalled();
    expect(vi.mocked(sendEmail)).not.toHaveBeenCalled();
  });

  it('returns 200 with matching Origin and sends the magic link', async () => {
    const { POST } = await import('./route');
    const res = await POST(new Request('https://dealroom.cispartners.co/api/auth/send', {
      method: 'POST',
      headers: { origin: 'https://dealroom.cispartners.co', 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'u@x.com' }),
    }) as any);
    expect(res.status).toBe(200);
    expect(vi.mocked(authSendLimiter.limit)).toHaveBeenCalled();
    expect(vi.mocked(sendEmail)).toHaveBeenCalledOnce();
  });
});
