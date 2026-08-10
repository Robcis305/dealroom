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
  workspaceParticipants: { userId: 'userId', status: 'status' },
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

  it('rejects requests where ?email does not match the token row', async () => {
    const validRow = {
      id: 'token-1',
      email: 'victim@example.com',
      tokenHash: 'hashed-token',
      expiresAt: new Date(Date.now() + 60_000),
      createdAt: new Date(),
      purpose: 'login',
      redirectTo: null,
    };

    vi.doMock('@/lib/auth/rate-limit', () => ({
      authVerifyLimiter: { limit: vi.fn().mockResolvedValue({ success: true }) },
    }));
    vi.doMock('@/lib/auth/tokens', () => ({
      hashToken: vi.fn().mockReturnValue('hashed-token'),
    }));
    vi.doMock('@/lib/auth/session', () => ({
      createSession: vi.fn(),
      setSessionCookie: vi.fn(),
    }));
    vi.doMock('@/db', () => ({
      db: {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([validRow]),
            }),
          }),
        }),
        delete: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
        insert: vi.fn(),
      },
    }));

    const { GET } = await import('./route');
    const url = `${APP_URL}/api/auth/verify?token=raw&email=attacker%40example.com`;
    const response = await GET(new Request(url) as any);

    expect([302, 307]).toContain(response.status);
    const location = response.headers.get('Location') ?? '';
    expect(location).toContain('error=invalid');
  });

  it('flips pending invited participant rows on a login-token verify (race-with-invitation)', async () => {
    // Scenario: external user was invited (participant.status='invited') but
    // the invitation token was clobbered by a fresh /login request before
    // they clicked it. They sign in via /login — purpose='login'. The
    // participant flip must still run, otherwise their deal-rooms list is
    // empty even though they are authenticated.
    const loginRow = {
      id: 't', email: 'cahyo@mrscraper.com', tokenHash: 'hashed-token',
      expiresAt: new Date(Date.now() + 60_000), createdAt: new Date(),
      purpose: 'login', redirectTo: null,
    };
    const updateSet = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
    const updateMock = vi.fn().mockReturnValue({ set: updateSet });

    vi.doMock('@/lib/auth/rate-limit', () => ({
      authVerifyLimiter: { limit: vi.fn().mockResolvedValue({ success: true }) },
    }));
    vi.doMock('@/lib/auth/tokens', () => ({ hashToken: vi.fn().mockReturnValue('hashed-token') }));
    vi.doMock('@/lib/auth/session', () => ({
      createSession: vi.fn().mockResolvedValue('s1'),
      setSessionCookie: vi.fn(),
    }));
    vi.doMock('@/db', () => ({
      db: {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([loginRow]) }),
          }),
        }),
        delete: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            onConflictDoUpdate: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([{ id: 'user-id', firstName: 'Cahyo', lastName: 'Subroto' }]),
            }),
          }),
        }),
        update: updateMock,
      },
    }));
    const { GET } = await import('./route');
    const response = await GET(
      new Request(`${APP_URL}/api/auth/verify?token=t&email=cahyo%40mrscraper.com`) as any,
    );
    // Must redirect (auth succeeded) AND must have called update on participants.
    expect([302, 307]).toContain(response.status);
    expect(updateMock).toHaveBeenCalledOnce();
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'active' }),
    );
  });

  it('accepts magic links where ?email casing differs from token row casing', async () => {
    // Some email clients lowercase URL params in tracking redirects. Without
    // case-insensitive comparison the user would hit ?error=invalid even
    // though the token was issued for them.
    const row = {
      id: 't', email: 'Mixed@Example.com', tokenHash: 'hashed-token',
      expiresAt: new Date(Date.now() + 60_000), createdAt: new Date(),
      purpose: 'login', redirectTo: null,
    };
    vi.doMock('@/lib/auth/rate-limit', () => ({
      authVerifyLimiter: { limit: vi.fn().mockResolvedValue({ success: true }) },
    }));
    vi.doMock('@/lib/auth/tokens', () => ({ hashToken: vi.fn().mockReturnValue('hashed-token') }));
    vi.doMock('@/lib/auth/session', () => ({
      createSession: vi.fn().mockResolvedValue('s'),
      setSessionCookie: vi.fn(),
    }));
    vi.doMock('@/db', () => ({
      db: {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([row]) }),
          }),
        }),
        delete: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            onConflictDoUpdate: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([{ id: 'u', firstName: 'A', lastName: 'B' }]),
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }) }),
      },
    }));
    const { GET } = await import('./route');
    const response = await GET(
      new Request(`${APP_URL}/api/auth/verify?token=t&email=mixed%40example.com`) as any,
    );
    const location = response.headers.get('Location') ?? '';
    expect(location).not.toContain('error=');
  });

  it('ignores redirectTo that is not a safe relative path (protocol-relative)', async () => {
    const row = {
      id: 't', email: 'u@example.com', tokenHash: 'hashed-token',
      expiresAt: new Date(Date.now() + 60_000), createdAt: new Date(),
      purpose: 'invitation', redirectTo: '//evil.example/pwn',
    };
    vi.doMock('@/lib/auth/rate-limit', () => ({
      authVerifyLimiter: { limit: vi.fn().mockResolvedValue({ success: true }) },
    }));
    vi.doMock('@/lib/auth/tokens', () => ({ hashToken: vi.fn().mockReturnValue('hashed-token') }));
    vi.doMock('@/lib/auth/session', () => ({
      createSession: vi.fn().mockResolvedValue('s1'),
      setSessionCookie: vi.fn(),
    }));
    vi.doMock('@/db', () => ({
      db: {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([row]) }),
          }),
        }),
        delete: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            onConflictDoUpdate: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([{ id: 'u1', firstName: 'A', lastName: 'B' }]),
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }) }),
      },
    }));
    const { GET } = await import('./route');
    const response = await GET(new Request(`${APP_URL}/api/auth/verify?token=t&email=u%40example.com`) as any);
    const location = response.headers.get('Location') ?? '';
    expect(location).not.toContain('evil.example');
    expect(location).toContain('/deals');
  });
});
