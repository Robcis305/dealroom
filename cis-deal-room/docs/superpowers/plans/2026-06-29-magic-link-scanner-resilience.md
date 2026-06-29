# Magic-link / invite scanner resilience — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop email security scanners from consuming single-use magic links by splitting the consuming `GET /api/auth/verify` into a non-consuming `GET` plus a consuming `POST` gated behind a "Confirm sign-in" interstitial.

**Architecture:** A shared, read-only `validateMagicLinkToken` helper is called by both verbs. `GET` only validates and redirects to a confirmation page; `POST` (triggered by the user clicking the button) is the only path that deletes the token, upserts the user, activates participants, and creates the session. Scanners issue GETs and do not submit the form, so the token survives until the human clicks.

**Tech Stack:** Next.js (this repo's vendored/modified version — see Global Constraints), TypeScript, Drizzle ORM, Vitest, React Testing Library.

**Spec:** [docs/superpowers/specs/2026-06-29-magic-link-scanner-resilience-design.md](../specs/2026-06-29-magic-link-scanner-resilience-design.md)

## Global Constraints

- **This is NOT the Next.js you know.** Before writing route-handler or `NextResponse` code, consult `node_modules/next/dist/docs/` for the current Route Handler and `NextResponse.redirect` behavior. Heed deprecation notices. (Per repo `AGENTS.md`.)
- **No schema/migration changes.** `magic_link_tokens` is untouched. Do not add columns.
- **Email link builders are unchanged.** Both keep pointing at `/api/auth/verify?token=…&email=…` ([send/route.ts:60](../../../src/app/api/auth/send/route.ts), [participants/route.ts:124](../../../src/app/api/workspaces/[id]/participants/route.ts)). Do not modify them.
- **Token contract unchanged:** single-use, email-bound, invite = 3 days / login = 10 minutes. Do not change lifetimes.
- **Follow the existing test mock style** in [route.test.ts](../../../src/app/api/auth/verify/route.test.ts): per-test `vi.doMock('@/db', …)` returning chained `select/from/where/limit`, `delete/where`, `insert/values/onConflictDoUpdate/returning`, `update/set/where`.
- **`/api/*` is not proxy-guarded** ([proxy.ts:60](../../../src/proxy.ts) matcher excludes `api`), so `POST /api/auth/verify` is reachable pre-auth. No `proxy.ts` change.

---

## File Structure

- **Create** `src/lib/auth/verify-token.ts` — read-only `validateMagicLinkToken(rawToken, email)` helper + result type. Single source of truth for the validation rules.
- **Create** `src/lib/auth/verify-token.test.ts` — unit tests for the helper.
- **Modify** `src/app/api/auth/verify/route.ts` — `GET` becomes validate-only → redirect to confirm page; add consuming `POST`.
- **Replace** `src/app/api/auth/verify/route.test.ts` — GET non-consuming tests + new POST tests + scanner-prefetch regression test.
- **Modify** `src/app/auth/verify/page.tsx` — render the "Confirm sign-in" form when `token`+`email` present and no error; keep error UI.
- **Modify** `src/app/auth/verify/page.test.tsx` — add confirm-form tests; keep error tests.

---

### Task 1: Read-only token validation helper

**Files:**
- Create: `src/lib/auth/verify-token.ts`
- Test: `src/lib/auth/verify-token.test.ts`

**Interfaces:**
- Consumes: `db` from `@/db`, `magicLinkTokens` from `@/db/schema`, `hashToken` from `@/lib/auth/tokens`.
- Produces:
  - `type MagicLinkTokenRow = typeof magicLinkTokens.$inferSelect`
  - `type MagicLinkValidation = { ok: true; tokenRow: MagicLinkTokenRow } | { ok: false; error: 'used' | 'expired' | 'invalid' }`
  - `async function validateMagicLinkToken(rawToken: string, email: string): Promise<MagicLinkValidation>` — never deletes/mutates.

- [ ] **Step 1: Write the failing test**

Create `src/lib/auth/verify-token.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

function mockDbReturning(rows: unknown[]) {
  const deleteWhere = vi.fn().mockResolvedValue(undefined);
  vi.doMock('@/lib/auth/tokens', () => ({
    hashToken: vi.fn().mockReturnValue('hashed-token'),
  }));
  vi.doMock('@/db/schema', () => ({ magicLinkTokens: {} }));
  vi.doMock('@/db', () => ({
    db: {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue(rows),
          }),
        }),
      }),
      delete: vi.fn().mockReturnValue({ where: deleteWhere }),
    },
  }));
  return { deleteWhere };
}

describe('validateMagicLinkToken', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('returns error=used when no row exists', async () => {
    mockDbReturning([]);
    const { validateMagicLinkToken } = await import('./verify-token');
    const result = await validateMagicLinkToken('raw', 'user@example.com');
    expect(result).toEqual({ ok: false, error: 'used' });
  });

  it('returns error=expired when the row is past expiresAt', async () => {
    mockDbReturning([{
      id: 't', email: 'user@example.com', tokenHash: 'hashed-token',
      expiresAt: new Date(Date.now() - 60_000), createdAt: new Date(),
      purpose: 'login', redirectTo: null,
    }]);
    const { validateMagicLinkToken } = await import('./verify-token');
    const result = await validateMagicLinkToken('raw', 'user@example.com');
    expect(result).toEqual({ ok: false, error: 'expired' });
  });

  it('returns error=invalid when email does not match the row', async () => {
    mockDbReturning([{
      id: 't', email: 'victim@example.com', tokenHash: 'hashed-token',
      expiresAt: new Date(Date.now() + 60_000), createdAt: new Date(),
      purpose: 'login', redirectTo: null,
    }]);
    const { validateMagicLinkToken } = await import('./verify-token');
    const result = await validateMagicLinkToken('raw', 'attacker@example.com');
    expect(result).toEqual({ ok: false, error: 'invalid' });
  });

  it('returns ok with the row for a valid token (case-insensitive email)', async () => {
    const row = {
      id: 't', email: 'Mixed@Example.com', tokenHash: 'hashed-token',
      expiresAt: new Date(Date.now() + 60_000), createdAt: new Date(),
      purpose: 'login', redirectTo: null,
    };
    mockDbReturning([row]);
    const { validateMagicLinkToken } = await import('./verify-token');
    const result = await validateMagicLinkToken('raw', 'mixed@example.com');
    expect(result).toEqual({ ok: true, tokenRow: row });
  });

  it('never deletes — it is read-only', async () => {
    const { deleteWhere } = mockDbReturning([]);
    const { validateMagicLinkToken } = await import('./verify-token');
    await validateMagicLinkToken('raw', 'user@example.com');
    expect(deleteWhere).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/auth/verify-token.test.ts`
Expected: FAIL — `Cannot find module './verify-token'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/auth/verify-token.ts`:

```ts
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { magicLinkTokens } from '@/db/schema';
import { hashToken } from '@/lib/auth/tokens';

export type MagicLinkTokenRow = typeof magicLinkTokens.$inferSelect;

export type MagicLinkValidation =
  | { ok: true; tokenRow: MagicLinkTokenRow }
  | { ok: false; error: 'used' | 'expired' | 'invalid' };

/**
 * Validates a raw magic-link token against the database WITHOUT consuming it.
 * Read-only: never deletes or mutates. Both the non-consuming GET and the
 * consuming POST on /api/auth/verify call this; only POST then deletes the row.
 *
 * - no row            → 'used'    (already consumed, or never existed)
 * - past expiresAt    → 'expired'
 * - email mismatch    → 'invalid' (case-insensitive; defends against ?email swap)
 */
export async function validateMagicLinkToken(
  rawToken: string,
  email: string,
): Promise<MagicLinkValidation> {
  const tokenHash = hashToken(rawToken);
  const [tokenRow] = await db
    .select()
    .from(magicLinkTokens)
    .where(eq(magicLinkTokens.tokenHash, tokenHash))
    .limit(1);

  if (!tokenRow) return { ok: false, error: 'used' };
  if (tokenRow.expiresAt < new Date()) return { ok: false, error: 'expired' };
  if (tokenRow.email.toLowerCase() !== email.toLowerCase()) {
    return { ok: false, error: 'invalid' };
  }
  return { ok: true, tokenRow };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/auth/verify-token.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/verify-token.ts src/lib/auth/verify-token.test.ts
git commit -m "feat(auth): add read-only validateMagicLinkToken helper"
```

---

### Task 2: Non-consuming GET + consuming POST in the verify route

**Files:**
- Modify: `src/app/api/auth/verify/route.ts` (replace whole file)
- Test: `src/app/api/auth/verify/route.test.ts` (replace whole file)

**Interfaces:**
- Consumes: `validateMagicLinkToken`, `MagicLinkValidation` from `@/lib/auth/verify-token` (Task 1); `authVerifyLimiter` from `@/lib/auth/rate-limit`; `createSession`, `setSessionCookie` from `@/lib/auth/session`; `getAppUrl` from `@/lib/app-url`; `db`, `users`, `workspaceParticipants`, `magicLinkTokens` from `@/db` / `@/db/schema`.
- Produces: `export async function GET(request: NextRequest)` (validate-only) and `export async function POST(request: NextRequest)` (consuming). The confirm page (Task 3) POSTs `token`+`email` as `application/x-www-form-urlencoded` to this `POST`.

- [ ] **Step 1: Write the failing tests (replace the route test file)**

Replace the entire contents of `src/app/api/auth/verify/route.test.ts` with:

```ts
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

    const response = await GET(getReq() as any);
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

    await GET(getReq() as any);
    await GET(getReq() as any);
    expect(deleteMock).not.toHaveBeenCalled(); // scanner could not burn the token

    const response = await POST(postReq() as any);
    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toContain('/deals');
    expect(deleteMock).toHaveBeenCalledOnce();
  });

  it('redirects to ?error=used when no row exists', async () => {
    baseMocks();
    mockDb([]);
    const { GET } = await import('./route');
    const response = await GET(getReq('used-token') as any);
    expect(response.headers.get('Location') ?? '').toContain('error=used');
  });

  it('redirects to ?error=expired for an expired row (without deleting)', async () => {
    baseMocks();
    const { deleteMock } = mockDb([validRow({ expiresAt: new Date(Date.now() - 60_000) })]);
    const { GET } = await import('./route');
    const response = await GET(getReq() as any);
    expect(response.headers.get('Location') ?? '').toContain('error=expired');
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it('redirects to ?error=invalid when email does not match the row', async () => {
    baseMocks();
    mockDb([validRow({ email: 'victim@example.com' })]);
    const { GET } = await import('./route');
    const response = await GET(getReq('raw', 'attacker@example.com') as any);
    expect(response.headers.get('Location') ?? '').toContain('error=invalid');
  });

  it('redirects to ?error=invalid when token or email param is missing', async () => {
    baseMocks();
    mockDb([]);
    const { GET } = await import('./route');
    const response = await GET(new Request(`${APP_URL}/api/auth/verify?token=raw`) as any);
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
    const response = await GET(getReq() as any);
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

    const response = await POST(postReq() as any);

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
    const response = await POST(postReq('raw', 'cahyo@mrscraper.com') as any);
    expect(response.status).toBe(303);
    expect(updateMock).toHaveBeenCalledOnce();
    expect(updateSet).toHaveBeenCalledWith(expect.objectContaining({ status: 'active' }));
  });

  it('accepts links where ?email casing differs from the row', async () => {
    baseMocks();
    mockDb([validRow({ email: 'Mixed@Example.com' })]);
    const { POST } = await import('./route');
    const response = await POST(postReq('raw', 'mixed@example.com') as any);
    expect(response.headers.get('Location') ?? '').not.toContain('error=');
  });

  it('ignores a protocol-relative redirectTo and falls back to /deals', async () => {
    baseMocks();
    mockDb([validRow({ purpose: 'invitation', redirectTo: '//evil.example/pwn' })]);
    const { POST } = await import('./route');
    const response = await POST(postReq() as any);
    const location = response.headers.get('Location') ?? '';
    expect(location).not.toContain('evil.example');
    expect(location).toContain('/deals');
  });

  it('honors a safe relative redirectTo for invitation tokens', async () => {
    baseMocks();
    mockDb([validRow({ purpose: 'invitation', redirectTo: '/workspace/abc' })]);
    const { POST } = await import('./route');
    const response = await POST(postReq() as any);
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
    const response = await POST(postReq() as any);
    expect(response.headers.get('Location') ?? '').toContain('/complete-profile');
  });

  it('redirects to ?error=used when the token was already consumed', async () => {
    baseMocks();
    const { deleteMock } = mockDb([]);
    const { POST } = await import('./route');
    const response = await POST(postReq() as any);
    expect(response.status).toBe(303);
    expect(response.headers.get('Location') ?? '').toContain('error=used');
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it('redirects to ?error=invalid when form fields are missing', async () => {
    baseMocks();
    mockDb([]);
    const { POST } = await import('./route');
    const response = await POST(
      new Request(`${APP_URL}/api/auth/verify`, { method: 'POST', body: new URLSearchParams({ token: 'raw' }) }) as any,
    );
    expect(response.headers.get('Location') ?? '').toContain('error=invalid');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/app/api/auth/verify/route.test.ts`
Expected: FAIL — `POST` is not exported / GET still deletes and redirects to `/deals`.

- [ ] **Step 3: Replace the route implementation**

Replace the entire contents of `src/app/api/auth/verify/route.ts` with:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/db';
import { magicLinkTokens, users, workspaceParticipants } from '@/db/schema';
import { authVerifyLimiter } from '@/lib/auth/rate-limit';
import { createSession, setSessionCookie } from '@/lib/auth/session';
import { getAppUrl } from '@/lib/app-url';
import { validateMagicLinkToken } from '@/lib/auth/verify-token';

function clientIpFrom(request: NextRequest): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1';
}

// Only accept safe relative redirects. Rejects protocol-relative (`//…`) and
// absolute URLs (`http:…`).
function safeRelative(p: string | null | undefined): string | null {
  if (!p) return null;
  if (!p.startsWith('/')) return null;
  if (p.startsWith('//')) return null;
  return p;
}

/**
 * GET — VALIDATE ONLY, never mutates.
 *
 * Email security gateways (Microsoft Safe Links/ATP, Mimecast, Proofpoint)
 * pre-fetch every URL in inbound mail with a GET to scan it. If GET consumed
 * the single-use token, the scanner would burn it before the human clicked.
 * So GET only validates and hands the user to the confirmation interstitial,
 * which POSTs back here to consume the token.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const rawToken = searchParams.get('token');
  const email = searchParams.get('email');
  const appUrl = getAppUrl();

  if (!rawToken || !email) {
    return Response.redirect(`${appUrl}/auth/verify?error=invalid`);
  }

  const rateLimitResult = await authVerifyLimiter.limit(clientIpFrom(request));
  if (!rateLimitResult.success) {
    return Response.redirect(`${appUrl}/auth/verify?error=rate_limited`);
  }

  const result = await validateMagicLinkToken(rawToken, email);
  if (!result.ok) {
    return Response.redirect(`${appUrl}/auth/verify?error=${result.error}`);
  }

  // Valid — send to the confirmation page, carrying the token. The page renders
  // a "Confirm sign-in" button that POSTs back here to consume the token.
  const confirmUrl = new URL(`${appUrl}/auth/verify`);
  confirmUrl.searchParams.set('token', rawToken);
  confirmUrl.searchParams.set('email', email);
  return Response.redirect(confirmUrl.toString());
}

/**
 * POST — the ONLY consuming path. Triggered by the user clicking
 * "Confirm sign-in". Deletes the token, upserts the user, activates pending
 * participants, creates the session, and redirects with 303 See Other so the
 * browser follows with a GET (not a re-POST).
 */
export async function POST(request: NextRequest) {
  const appUrl = getAppUrl();
  const form = await request.formData();
  const rawToken = form.get('token');
  const email = form.get('email');

  if (typeof rawToken !== 'string' || typeof email !== 'string' || !rawToken || !email) {
    return NextResponse.redirect(`${appUrl}/auth/verify?error=invalid`, 303);
  }

  const rateLimitResult = await authVerifyLimiter.limit(clientIpFrom(request));
  if (!rateLimitResult.success) {
    return NextResponse.redirect(`${appUrl}/auth/verify?error=rate_limited`, 303);
  }

  const result = await validateMagicLinkToken(rawToken, email);
  if (!result.ok) {
    return NextResponse.redirect(`${appUrl}/auth/verify?error=${result.error}`, 303);
  }
  const { tokenRow } = result;

  // Consume the token (single-use contract).
  await db.delete(magicLinkTokens).where(eq(magicLinkTokens.tokenHash, tokenRow.tokenHash));

  // Upsert user using tokenRow.email (authoritative, lowercased at write time).
  const [user] = await db
    .insert(users)
    .values({ email: tokenRow.email, isAdmin: false })
    .onConflictDoUpdate({ target: users.email, set: { updatedAt: new Date() } })
    .returning({ id: users.id, firstName: users.firstName, lastName: users.lastName });

  // Activate any pending participant rows for this authenticated user (runs for
  // login OR invitation tokens — see route history for the race rationale).
  await db
    .update(workspaceParticipants)
    .set({ status: 'active', activatedAt: new Date() })
    .where(
      and(
        eq(workspaceParticipants.userId, user.id),
        eq(workspaceParticipants.status, 'invited'),
      ),
    );

  const sessionId = await createSession(user.id);
  const needsProfile = !user.firstName || !user.lastName;
  const safeRedirect = safeRelative(tokenRow.redirectTo);
  const redirectPath = needsProfile
    ? '/complete-profile'
    : tokenRow.purpose === 'invitation' && safeRedirect
      ? safeRedirect
      : '/deals';

  // 303 See Other: a POST that returns 307 would make the browser re-POST to
  // the redirect target. 303 forces a GET to redirectPath.
  const response = NextResponse.redirect(new URL(`${appUrl}${redirectPath}`), 303);
  setSessionCookie(response, sessionId);
  return response;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/app/api/auth/verify/route.test.ts`
Expected: PASS (all GET + POST tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/auth/verify/route.ts src/app/api/auth/verify/route.test.ts
git commit -m "feat(auth): non-consuming GET + consuming POST on /api/auth/verify"
```

---

### Task 3: Confirmation interstitial page

**Files:**
- Modify: `src/app/auth/verify/page.tsx`
- Test: `src/app/auth/verify/page.test.tsx`

**Interfaces:**
- Consumes: the GET handler (Task 2) redirects valid links to `/auth/verify?token=…&email=…`; the form here POSTs `token`+`email` to `/api/auth/verify` (Task 2's POST).
- Produces: a server component that renders the "Confirm sign-in" form when `token`+`email` are present and no `error`, else the existing error UI.

- [ ] **Step 1: Write the failing tests (replace the page test file)**

Replace the entire contents of `src/app/auth/verify/page.test.tsx` with:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import VerifyPage from './page';

// VerifyPage is an async Server Component. Invoke it as a function, await the
// Promise<ReactElement>, then render the resolved element.
async function renderPage(params: { error?: string; token?: string; email?: string }) {
  const element = await VerifyPage({ searchParams: Promise.resolve(params) });
  return render(element);
}

describe('VerifyPage /auth/verify', () => {
  it('renders a Confirm sign-in button when token+email present and no error', async () => {
    await renderPage({ token: 'raw-token', email: 'user@example.com' });
    expect(screen.getByRole('button', { name: /confirm sign-in/i })).toBeInTheDocument();
  });

  it('posts token+email to /api/auth/verify via a form', async () => {
    const { container } = await renderPage({ token: 'raw-token', email: 'user@example.com' });
    const form = container.querySelector('form');
    expect(form).not.toBeNull();
    expect(form?.getAttribute('method')?.toUpperCase()).toBe('POST');
    expect(form?.getAttribute('action')).toBe('/api/auth/verify');
    expect(container.querySelector('input[name="token"]')?.getAttribute('value')).toBe('raw-token');
    expect(container.querySelector('input[name="email"]')?.getAttribute('value')).toBe('user@example.com');
  });

  it('shows "This link has expired" when error=expired', async () => {
    await renderPage({ error: 'expired' });
    expect(screen.getByText(/this link has expired/i)).toBeInTheDocument();
  });

  it('shows "This link has already been used" when error=used', async () => {
    await renderPage({ error: 'used' });
    expect(screen.getByText(/this link has already been used/i)).toBeInTheDocument();
  });

  it('shows a too-many-attempts message when error=rate_limited', async () => {
    await renderPage({ error: 'rate_limited' });
    expect(screen.getByText(/too many attempts/i)).toBeInTheDocument();
  });

  it('shows a Request new link button on error states', async () => {
    await renderPage({ error: 'expired' });
    expect(screen.getByRole('link', { name: /request new link/i })).toBeInTheDocument();
  });

  it('prefers the error view when both error and token are present', async () => {
    await renderPage({ error: 'used', token: 'raw-token', email: 'user@example.com' });
    expect(screen.getByText(/this link has already been used/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /confirm sign-in/i })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/app/auth/verify/page.test.tsx`
Expected: FAIL — no Confirm sign-in button; `searchParams` type lacks `token`/`email`.

- [ ] **Step 3: Update the page implementation**

Replace the entire contents of `src/app/auth/verify/page.tsx` with:

```tsx
import Link from 'next/link';
import { Logo } from '@/components/ui/Logo';

interface VerifyPageProps {
  searchParams: Promise<{ error?: string; token?: string; email?: string }>;
}

function getErrorContent(error: string | undefined): {
  heading: string;
  description: string;
} {
  switch (error) {
    case 'expired':
      return {
        heading: 'This link has expired',
        description: 'Magic links expire after a short time. Request a new one to sign in.',
      };
    case 'used':
      return {
        heading: 'This link has already been used',
        description: 'Each magic link can only be used once. Request a new one to sign in.',
      };
    case 'rate_limited':
      return {
        heading: 'Too many attempts',
        description: 'Please wait a few minutes, then request a new link to sign in.',
      };
    default:
      return {
        heading: 'Invalid link',
        description: 'This link is not valid. Request a new one to sign in.',
      };
  }
}

export default async function VerifyPage({ searchParams }: VerifyPageProps) {
  const { error, token, email } = await searchParams;

  // Confirmation interstitial: a valid, not-yet-consumed link lands here with
  // token+email and no error. Render an explicit "Confirm sign-in" button that
  // POSTs to /api/auth/verify to consume the token. Email security scanners
  // pre-fetch the link with GET and do not submit this form, so the single-use
  // token survives until the human clicks.
  if (!error && token && email) {
    return (
      <main className="min-h-screen bg-bg flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <Logo size="md" className="mx-auto mb-8" inverse />

          <div className="bg-surface border border-border rounded-xl p-6 shadow-sm text-center">
            <div className="flex flex-col items-center gap-4">
              <div className="flex flex-col gap-1">
                <h1 className="text-lg font-semibold text-text-primary">Confirm sign-in</h1>
                <p className="text-sm text-text-muted">
                  Click below to finish signing in to your deal room.
                </p>
              </div>

              <form method="POST" action="/api/auth/verify" className="w-full">
                <input type="hidden" name="token" value={token} />
                <input type="hidden" name="email" value={email} />
                <button
                  type="submit"
                  className="inline-flex w-full items-center justify-center px-4 py-2 rounded-lg
                    bg-accent hover:bg-accent-hover text-text-inverse text-sm font-medium
                    transition-colors duration-150 cursor-pointer
                    focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface"
                >
                  Confirm sign-in
                </button>
              </form>
            </div>
          </div>
        </div>
      </main>
    );
  }

  const { heading, description } = getErrorContent(error);

  return (
    <main className="min-h-screen bg-bg flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <Logo size="md" className="mx-auto mb-8" inverse />

        <div className="bg-surface border border-border rounded-xl p-6 shadow-sm text-center">
          <div className="flex flex-col items-center gap-4">
            <div className="flex flex-col gap-1">
              <h1 className="text-lg font-semibold text-text-primary">{heading}</h1>
              <p className="text-sm text-text-muted">{description}</p>
            </div>

            <Link
              href="/login"
              className="inline-flex items-center justify-center px-4 py-2 rounded-lg
                bg-accent hover:bg-accent-hover text-text-inverse text-sm font-medium
                transition-colors duration-150 cursor-pointer
                focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface"
            >
              Request new link
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/app/auth/verify/page.test.tsx`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/auth/verify/page.tsx src/app/auth/verify/page.test.tsx
git commit -m "feat(auth): confirmation interstitial page for magic links"
```

---

### Task 4: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: PASS — all suites green, including the three touched files.

- [ ] **Step 2: Typecheck and lint**

Run: `npm run lint` and (if present) `npx tsc --noEmit`
Expected: no new errors. (Check `package.json` scripts; use the repo's configured commands.)

- [ ] **Step 3: Manual smoke (Vercel preview or local)**

Verify on a preview deploy:
1. Request a login link, open the email link → lands on **Confirm sign-in** page (not signed in yet).
2. Click **Confirm sign-in** → redirected to `/deals`, session cookie set.
3. Re-open the original email link → **Confirm sign-in** page again; clicking now shows **"This link has already been used"** (token consumed by step 2).
4. Simulate a scanner: `curl -sI "<the email link>"` (a bare GET) → returns a redirect to `/auth/verify?token=…` and does **not** consume; clicking the link afterward still works.

- [ ] **Step 4: Final commit if any fixups were needed**

```bash
git add -A
git commit -m "test(auth): verify magic-link scanner-resilience end to end"
```

---

## Self-Review notes

- **Spec coverage:** non-consuming GET (Task 2), consuming POST (Task 2), shared `validateMagicLinkToken` helper (Task 1), confirm page (Task 3), GET-no-longer-deletes-expired (Task 2 test asserts it), scanner-prefetch regression (Task 2 test), middleware confirmed not needed (Global Constraints), no schema change (Global Constraints), residual-risk acknowledged (design). All covered.
- **Error-code parity:** helper maps no-row→`used`, expired→`expired`, mismatch→`invalid`; route adds `rate_limited`; page renders all four. Consistent across tasks.
- **Type consistency:** `MagicLinkValidation` / `validateMagicLinkToken` names match between Task 1 definition and Task 2 usage; `tokenRow.tokenHash`, `tokenRow.purpose`, `tokenRow.redirectTo` all exist on `typeof magicLinkTokens.$inferSelect`.
- **Redirect status:** POST uses 303 (browser follows with GET); GET uses default 302. Tests assert each.
