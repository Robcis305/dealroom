import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('@/lib/auth/rate-limit', () => ({
  authVerifyLimiter: {
    limit: vi.fn().mockResolvedValue({ success: true }),
  },
}));

vi.mock('@/lib/auth/tokens', () => ({
  hashToken: vi.fn().mockReturnValue('hashed-token'),
}));

vi.mock('@/lib/auth/session', () => ({
  createSession: vi.fn().mockResolvedValue('session-id-123'),
  setSessionCookie: vi.fn(),
}));

vi.mock('@/db/schema', () => ({
  magicLinkTokens: {},
  users: { email: 'email' },
}));

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GET /api/auth/verify', () => {
  const APP_URL = 'http://localhost:3000';

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_APP_URL = APP_URL;
  });

  it('redirects to ?error=expired when token row exists but expiresAt is in the past', async () => {
    const expiredRow = {
      id: 'token-1',
      email: 'user@example.com',
      tokenHash: 'hashed-token',
      expiresAt: new Date(Date.now() - 60_000), // 1 minute ago
      createdAt: new Date(),
    };

    vi.doMock('@/lib/auth/rate-limit', () => ({
      authVerifyLimiter: { limit: vi.fn().mockResolvedValue({ success: true }) },
    }));
    vi.doMock('@/lib/auth/tokens', () => ({
      hashToken: vi.fn().mockReturnValue('hashed-token'),
    }));
    vi.doMock('@/lib/auth/session', () => ({
      createSession: vi.fn().mockResolvedValue('session-id'),
      setSessionCookie: vi.fn(),
    }));
    vi.doMock('@/db', () => ({
      db: {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([expiredRow]),
            }),
          }),
        }),
        delete: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      },
    }));

    const { GET } = await import('./route');

    const url = `${APP_URL}/api/auth/verify?token=raw-token&email=user%40example.com`;
    const request = new Request(url);

    const response = await GET(request as unknown as import('next/server').NextRequest);

    // Accept any redirect status (302 or 307)
    expect([302, 307]).toContain(response.status);
    const location = response.headers.get('Location') ?? '';
    expect(location).toContain('error=expired');
  });

  it('redirects to ?error=used when no token row is found (already consumed)', async () => {
    vi.doMock('@/lib/auth/rate-limit', () => ({
      authVerifyLimiter: { limit: vi.fn().mockResolvedValue({ success: true }) },
    }));
    vi.doMock('@/lib/auth/tokens', () => ({
      hashToken: vi.fn().mockReturnValue('hashed-token'),
    }));
    vi.doMock('@/lib/auth/session', () => ({
      createSession: vi.fn().mockResolvedValue('session-id'),
      setSessionCookie: vi.fn(),
    }));
    vi.doMock('@/db', () => ({
      db: {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]), // empty — no row found
            }),
          }),
        }),
      },
    }));

    const { GET } = await import('./route');

    const url = `${APP_URL}/api/auth/verify?token=used-token&email=user%40example.com`;
    const request = new Request(url);

    const response = await GET(request as unknown as import('next/server').NextRequest);

    // Accept any redirect status (302 or 307)
    expect([302, 307]).toContain(response.status);
    const location = response.headers.get('Location') ?? '';
    expect(location).toContain('error=used');
  });
});
