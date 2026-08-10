import { describe, it, expect, vi, beforeEach } from 'vitest';

const APP_URL = 'http://localhost:3000';

// ─── Shared mock builders ─────────────────────────────────────────────────────

function baseMocks() {
  vi.doMock('@/lib/auth/rate-limit', () => ({
    authVerifyLimiter: { limit: vi.fn().mockResolvedValue({ success: true }) },
  }));
  vi.doMock('@/lib/auth/session', () => ({
    createSession: vi.fn().mockResolvedValue('session-id-123'),
    setSessionCookie: vi.fn(),
  }));
  vi.doMock('@/db/schema', () => ({
    magicLinkTokens: {},
    users: { email: 'email' },
    workspaceParticipants: { userId: 'userId', status: 'status' },
  }));
}

// Builds a db mock whose token lookup returns `rows`. Captures the delete /
// insert / update spies so tests can assert consumption happened (or did not).
function mockDb(rows: unknown[]) {
  const deleteWhere = vi.fn().mockResolvedValue(undefined);
  const deleteMock = vi.fn().mockReturnValue({ where: deleteWhere });
  const updateSet = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
  const updateMock = vi.fn().mockReturnValue({ set: updateSet });
  const insertMock = vi.fn().mockReturnValue({
    values: vi.fn().mockReturnValue({
      onConflictDoUpdate: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: 'user-id', firstName: 'A', lastName: 'B' }]),
      }),
    }),
  });
  vi.doMock('@/db', () => ({
    db: {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue(rows) }),
        }),
      }),
      delete: deleteMock,
      insert: insertMock,
      update: updateMock,
    },
  }));
  return { deleteMock, deleteWhere, updateMock, updateSet, insertMock };
}

function validRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 't', email: 'user@example.com', tokenHash: 'hashed-token',
    expiresAt: new Date(Date.now() + 60_000), createdAt: new Date(),
    purpose: 'login', redirectTo: null, ...overrides,
  };
}

function getReq(token = 'raw', email = 'user@example.com') {
  return new Request(`${APP_URL}/api/auth/verify?token=${token}&email=${encodeURIComponent(email)}`);
}

function postReq(token = 'raw', email = 'user@example.com') {
  return new Request(`${APP_URL}/api/auth/verify`, {
    method: 'POST',
    body: new URLSearchParams({ token, email }),
    headers: { origin: 'http://localhost:3000' },
  });
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_APP_URL = APP_URL;
});

// ─── GET: validate-only, never consumes ──────────────────────────────────────

describe('GET /api/auth/verify (non-consuming)', () => {
  it('redirects a valid token to the confirmation page carrying token+email, and does NOT delete', async () => {
    baseMocks();
    const { deleteMock } = mockDb([validRow()]);
    const { GET } = await import('./route');

    const response = await GET(getReq() as unknown as import('next/server').NextRequest);
    const location = response.headers.get('Location') ?? '';

    expect([302, 307]).toContain(response.status);
    expect(location).toContain('/auth/verify');
    expect(location).toContain('token=raw');
    expect(location).toContain('email=');
    expect(location).not.toContain('error=');
    expect(location).not.toContain('/deals');
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it('two prefetch GETs followed by a POST still signs in (scanner-prefetch regression)', async () => {
    baseMocks();
    const { deleteMock } = mockDb([validRow()]);
    const { GET, POST } = await import('./route');

    await GET(getReq() as unknown as import('next/server').NextRequest);
    await GET(getReq() as unknown as import('next/server').NextRequest);
    expect(deleteMock).not.toHaveBeenCalled(); // scanner could not burn the token

    const response = await POST(postReq() as unknown as import('next/server').NextRequest);
    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toContain('/deals');
    expect(deleteMock).toHaveBeenCalledOnce();
  });

  it('redirects to ?error=used when no row exists', async () => {
    baseMocks();
    mockDb([]);
    const { GET } = await import('./route');
    const response = await GET(getReq('used-token') as unknown as import('next/server').NextRequest);
    expect(response.headers.get('Location') ?? '').toContain('error=used');
  });

  it('redirects to ?error=expired for an expired row (without deleting)', async () => {
    baseMocks();
    const { deleteMock } = mockDb([validRow({ expiresAt: new Date(Date.now() - 60_000) })]);
    const { GET } = await import('./route');
    const response = await GET(getReq() as unknown as import('next/server').NextRequest);
    expect(response.headers.get('Location') ?? '').toContain('error=expired');
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it('redirects to ?error=invalid when email does not match the row', async () => {
    baseMocks();
    mockDb([validRow({ email: 'victim@example.com' })]);
    const { GET } = await import('./route');
    const response = await GET(getReq('raw', 'attacker@example.com') as unknown as import('next/server').NextRequest);
    expect(response.headers.get('Location') ?? '').toContain('error=invalid');
  });

  it('redirects to ?error=invalid when token or email param is missing', async () => {
    baseMocks();
    mockDb([]);
    const { GET } = await import('./route');
    const response = await GET(new Request(`${APP_URL}/api/auth/verify?token=raw`) as unknown as import('next/server').NextRequest);
    expect(response.headers.get('Location') ?? '').toContain('error=invalid');
  });

  it('redirects to ?error=rate_limited when the IP limiter rejects', async () => {
    vi.doMock('@/lib/auth/rate-limit', () => ({
      authVerifyLimiter: { limit: vi.fn().mockResolvedValue({ success: false }) },
    }));
    vi.doMock('@/lib/auth/session', () => ({ createSession: vi.fn(), setSessionCookie: vi.fn() }));
    vi.doMock('@/db/schema', () => ({ magicLinkTokens: {}, users: {}, workspaceParticipants: {} }));
    mockDb([validRow()]);
    const { GET } = await import('./route');
    const response = await GET(getReq() as unknown as import('next/server').NextRequest);
    expect(response.headers.get('Location') ?? '').toContain('error=rate_limited');
  });
});

// ─── POST: the only consuming path ────────────────────────────────────────────

describe('POST /api/auth/verify (consuming)', () => {
  it('consumes the token, creates a session, and redirects (303) to /deals', async () => {
    baseMocks();
    const { deleteMock } = mockDb([validRow()]);
    const session = await import('@/lib/auth/session');
    const { POST } = await import('./route');

    const response = await POST(postReq() as unknown as import('next/server').NextRequest);

    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toContain('/deals');
    expect(deleteMock).toHaveBeenCalledOnce();
    expect(session.createSession).toHaveBeenCalledWith('user-id');
    expect(session.setSessionCookie).toHaveBeenCalled();
  });

  it('flips pending invited participant rows on a login-token verify', async () => {
    baseMocks();
    const { updateMock, updateSet } = mockDb([validRow({ email: 'cahyo@mrscraper.com' })]);
    const { POST } = await import('./route');
    const response = await POST(postReq('raw', 'cahyo@mrscraper.com') as unknown as import('next/server').NextRequest);
    expect(response.status).toBe(303);
    expect(updateMock).toHaveBeenCalledOnce();
    expect(updateSet).toHaveBeenCalledWith(expect.objectContaining({ status: 'active' }));
  });

  it('accepts links where ?email casing differs from the row', async () => {
    baseMocks();
    mockDb([validRow({ email: 'Mixed@Example.com' })]);
    const { POST } = await import('./route');
    const response = await POST(postReq('raw', 'mixed@example.com') as unknown as import('next/server').NextRequest);
    expect(response.status).toBe(303);
    const location = response.headers.get('Location') ?? '';
    expect(location).not.toContain('error=');
    expect(location).toContain('/deals');
  });

  it('ignores a protocol-relative redirectTo and falls back to /deals', async () => {
    baseMocks();
    mockDb([validRow({ purpose: 'invitation', redirectTo: '//evil.example/pwn' })]);
    const { POST } = await import('./route');
    const response = await POST(postReq() as unknown as import('next/server').NextRequest);
    const location = response.headers.get('Location') ?? '';
    expect(location).not.toContain('evil.example');
    expect(location).toContain('/deals');
  });

  it('honors a safe relative redirectTo for invitation tokens', async () => {
    baseMocks();
    mockDb([validRow({ purpose: 'invitation', redirectTo: '/workspace/abc' })]);
    const { POST } = await import('./route');
    const response = await POST(postReq() as unknown as import('next/server').NextRequest);
    expect(response.headers.get('Location') ?? '').toContain('/workspace/abc');
  });

  it('redirects to /complete-profile when the user has no name yet', async () => {
    baseMocks();
    // Custom db mock: the user upsert returns a user with no first/last name.
    const deleteWhere = vi.fn().mockResolvedValue(undefined);
    vi.doMock('@/db', () => ({
      db: {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([validRow()]) }),
          }),
        }),
        delete: vi.fn().mockReturnValue({ where: deleteWhere }),
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            onConflictDoUpdate: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([{ id: 'u', firstName: null, lastName: null }]),
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }) }),
      },
    }));
    const { POST } = await import('./route');
    const response = await POST(postReq() as unknown as import('next/server').NextRequest);
    expect(response.headers.get('Location') ?? '').toContain('/complete-profile');
  });

  it('redirects to ?error=used when the token was already consumed', async () => {
    baseMocks();
    const { deleteMock } = mockDb([]);
    const { POST } = await import('./route');
    const response = await POST(postReq() as unknown as import('next/server').NextRequest);
    expect(response.status).toBe(303);
    expect(response.headers.get('Location') ?? '').toContain('error=used');
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it('redirects to ?error=invalid when form fields are missing', async () => {
    baseMocks();
    mockDb([]);
    const { POST } = await import('./route');
    const response = await POST(
      new Request(`${APP_URL}/api/auth/verify`, { method: 'POST', body: new URLSearchParams({ token: 'raw' }), headers: { origin: 'http://localhost:3000' } }) as unknown as import('next/server').NextRequest,
    );
    expect(response.headers.get('Location') ?? '').toContain('error=invalid');
  });

  it('rejects a cross-origin POST without consuming the token (CSRF guard)', async () => {
    baseMocks();
    const { deleteMock } = mockDb([validRow()]);
    const { POST } = await import('./route');
    const req = new Request(`${APP_URL}/api/auth/verify`, {
      method: 'POST',
      body: new URLSearchParams({ token: 'raw', email: 'user@example.com' }),
      headers: { origin: 'https://evil.example' },
    });
    const response = await POST(req as unknown as import('next/server').NextRequest);
    expect(response.status).toBe(303);
    expect(response.headers.get('Location') ?? '').toContain('error=invalid');
    expect(deleteMock).not.toHaveBeenCalled();
  });
});
