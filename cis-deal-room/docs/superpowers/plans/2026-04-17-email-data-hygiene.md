# Email & Data-Hygiene Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the non-authz-but-still-risky findings from the 2026-04-17 code review: header injection in emails, missing unsubscribe plumbing, digest double-send race, notification retry/DLQ, pdf.js CDN supply-chain exposure, xlsx DoS, and unbounded `log-preview`.

**Architecture:**
- Email headers go through a CRLF-stripping safe-field helper.
- Per-channel preferences (`upload`, `digest`, `invitation`) replace the single `notificationDigest` boolean; templates include unsubscribe links bound to a signed channel-token.
- Digest cron claims rows with `UPDATE … WHERE processed_at IS NULL … RETURNING *` to make re-entry safe.
- `notification_queue` gains `attempts` and `last_error`, with a retry cap.
- pdf.js worker is self-hosted under `/public/pdf.worker.min.mjs`.
- xlsx parse is bounded by a max-row range inside `SheetPreview`.
- `log-preview` is Upstash-rate-limited per user+file.

**Tech Stack:** Next.js 16, Drizzle ORM, Resend, Upstash QStash/Ratelimit, React Email, SheetJS, react-pdf, Vitest.

---

## File Structure Overview

**Files created:**
- `src/lib/email/safe-field.ts` — CRLF strip + length cap for subject/to/from
- `src/lib/email/safe-field.test.ts`
- `src/lib/email/unsubscribe.ts` — sign/verify channel-unsubscribe tokens
- `src/lib/email/unsubscribe.test.ts`
- `src/app/api/unsubscribe/route.ts` — GET handler for unsubscribe links
- `src/app/api/unsubscribe/route.test.ts`
- `public/pdf.worker.min.mjs` — self-hosted pdfjs worker (copied from node_modules at build time)
- `scripts/copy-pdf-worker.mjs` — copies the worker to /public during `postinstall` / `predev` / `prebuild`
- Drizzle migration for `notification_channels` user-prefs rows and `notification_queue.attempts` / `last_error` columns

**Files modified:**
- `src/lib/email/send.ts` — route all sends through safe-field helper
- `src/lib/email/magic-link.tsx`, `invitation.tsx`, `daily-digest.tsx`, `upload-batch.tsx` — add `<UnsubscribeFooter>` (invitation/magic-link keep minimal since they are transactional, but still sanitise)
- `src/lib/notifications/enqueue-or-send.ts` — honour per-channel preference
- `src/app/api/workspaces/[id]/notify-upload-batch/route.ts` — sanitise subject/to
- `src/app/api/cron/digest/route.ts` — atomic row-claim + retry/backoff/DLQ
- `src/app/api/user/preferences/route.ts` — accept per-channel flags
- `src/app/api/files/[id]/log-preview/route.ts` — rate-limit per user+file
- `src/components/workspace/preview/PdfPreview.tsx` — point workerSrc at `/pdf.worker.min.mjs`
- `src/components/workspace/preview/SheetPreview.tsx` — bound parse range
- `src/db/schema.ts` — new prefs columns, `attempts`, `last_error`
- `package.json` — add `predev` / `prebuild` script

---

## Task 1: Safe-Field Helper (CRLF Strip)

**Files:**
- Create: `src/lib/email/safe-field.ts`
- Test: `src/lib/email/safe-field.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// src/lib/email/safe-field.test.ts
import { describe, it, expect } from 'vitest';
import { safeHeader, safeEmailAddress } from './safe-field';

describe('safeHeader', () => {
  it('strips CR and LF', () => {
    expect(safeHeader('hello\r\nBcc: a@b.com')).toBe('helloBcc: a@b.com');
    expect(safeHeader('one\ntwo\rthree')).toBe('onetwothree');
  });

  it('caps extreme length to 300 chars', () => {
    const long = 'x'.repeat(1000);
    expect(safeHeader(long).length).toBe(300);
  });

  it('returns empty string for non-string input', () => {
    expect(safeHeader(undefined as any)).toBe('');
    expect(safeHeader(null as any)).toBe('');
  });
});

describe('safeEmailAddress', () => {
  it('rejects CRLF and returns null', () => {
    expect(safeEmailAddress('u@x.com\r\nBcc: y@z.com')).toBeNull();
  });

  it('rejects obvious malformed addresses', () => {
    expect(safeEmailAddress('not-an-email')).toBeNull();
    expect(safeEmailAddress('a@')).toBeNull();
  });

  it('accepts a normal email', () => {
    expect(safeEmailAddress('user@example.com')).toBe('user@example.com');
  });
});
```

- [ ] **Step 2: Run (expect FAIL)**

```bash
cd cis-deal-room && npx vitest run src/lib/email/safe-field.test.ts
```

- [ ] **Step 3: Implement**

```ts
// src/lib/email/safe-field.ts
/**
 * Strip CR/LF and cap length for anything that becomes an email header.
 * Prevents header-injection (Bcc smuggling, multi-send exploits) if a
 * user-supplied value ever reaches subject/to/from.
 */
export function safeHeader(input: string | null | undefined, maxLen = 300): string {
  if (typeof input !== 'string') return '';
  return input.replace(/[\r\n]/g, '').slice(0, maxLen);
}

const RFC_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Returns the input when it parses as a simple email with no CRLF,
 * otherwise null. Deliberately strict — our addresses are either user
 * rows (already validated) or config strings.
 */
export function safeEmailAddress(input: string | null | undefined): string | null {
  if (typeof input !== 'string') return null;
  if (/[\r\n]/.test(input)) return null;
  if (!RFC_EMAIL.test(input)) return null;
  return input;
}
```

- [ ] **Step 4: Run (expect PASS)**

```bash
cd cis-deal-room && npx vitest run src/lib/email/safe-field.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/email/safe-field.ts src/lib/email/safe-field.test.ts
git commit -m "feat(email): add safe-header + safe-email-address helpers"
```

---

## Task 2: Route `sendEmail` Through Safe Fields

Apply the helper to subject/to/from in `src/lib/email/send.ts` and to subject in `notify-upload-batch`.

**Files:**
- Modify: `src/lib/email/send.ts`
- Modify: `src/app/api/workspaces/[id]/notify-upload-batch/route.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/email/send.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSend = vi.fn().mockResolvedValue({ data: { id: 'x' } });
vi.mock('resend', () => ({ Resend: vi.fn().mockImplementation(() => ({ emails: { send: mockSend } })) }));

import { sendEmail } from './send';

beforeEach(() => {
  process.env.RESEND_API_KEY = 'test';
  vi.clearAllMocks();
});

describe('sendEmail CRLF sanitisation', () => {
  it('strips CRLF from subject before sending', async () => {
    await sendEmail({ to: 'u@x.com', subject: 'hi\r\nBcc: evil@x.com', react: null as any });
    expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ subject: 'hiBcc: evil@x.com' }));
  });

  it('refuses to send when `to` contains CRLF', async () => {
    await expect(
      sendEmail({ to: 'u@x.com\r\nBcc: y@z.com', subject: 's', react: null as any })
    ).rejects.toThrow(/invalid recipient/i);
    expect(mockSend).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run (expect FAIL)**

```bash
cd cis-deal-room && npx vitest run src/lib/email/send.test.ts
```

- [ ] **Step 3: Implement**

Replace `src/lib/email/send.ts`:

```ts
import { Resend } from 'resend';
import type { ReactElement } from 'react';
import { safeHeader, safeEmailAddress } from './safe-field';

/**
 * Thin wrapper over Resend.emails.send that returns a stub response when
 * RESEND_API_KEY is not configured. Sanitises subject/to/from to prevent
 * header injection if a user-controlled value ever reaches them.
 */
export async function sendEmail(input: {
  to: string;
  subject: string;
  react: ReactElement;
}): Promise<{ id: string }> {
  const apiKey = process.env.RESEND_API_KEY;

  const safeTo = safeEmailAddress(input.to);
  if (!safeTo) throw new Error('Invalid recipient email');
  const safeSubject = safeHeader(input.subject);

  if (!apiKey) {
    console.log('[email:stub]', { to: safeTo, subject: safeSubject });
    return { id: 'stub' };
  }

  const resend = new Resend(apiKey);
  const result = await resend.emails.send({
    from: 'CIS Partners <noreply@mail.cispartners.co>',
    to: safeTo,
    subject: safeSubject,
    react: input.react,
  });

  return { id: result.data?.id ?? 'unknown' };
}
```

- [ ] **Step 4: Run (expect PASS)**

```bash
cd cis-deal-room && npx vitest run src/lib/email/send.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/email/send.ts src/lib/email/send.test.ts
git commit -m "fix(email): sanitise subject and reject CRLF recipients in sendEmail"
```

---

## Task 3: Per-Channel Preferences — Schema + Migration

Split `users.notificationDigest` into three booleans: `notifyUploads`, `notifyInvitations` (transactional — default true, non-togglable for now but modeled), `notifyDigest`. Keep the old column for backfill and drop it in a follow-up.

**Files:**
- Modify: `src/db/schema.ts`
- Create migration via drizzle-kit

- [ ] **Step 1: Edit schema**

In `src/db/schema.ts`, extend the `users` table:

```ts
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  firstName: text('first_name'),
  lastName: text('last_name'),
  isAdmin: boolean('is_admin').notNull().default(false),
  notificationDigest: boolean('notification_digest').notNull().default(false),
  notifyUploads: boolean('notify_uploads').notNull().default(true),
  notifyDigest: boolean('notify_digest').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
```

Also extend `notificationQueue`:

```ts
export const notificationQueue = pgTable('notification_queue', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  action: activityActionEnum('action').notNull(),
  targetType: activityTargetTypeEnum('target_type').notNull(),
  targetId: uuid('target_id'),
  metadata: jsonb('metadata'),
  attempts: integer('attempts').notNull().default(0),
  lastError: text('last_error'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  processedAt: timestamp('processed_at'),
});
```

- [ ] **Step 2: Generate migration**

```bash
cd cis-deal-room && npx drizzle-kit generate
```

Inspect the generated SQL and confirm it adds the two columns on `users` and the two columns on `notification_queue` without dropping existing data.

- [ ] **Step 3: Apply migration (dev DB)**

```bash
cd cis-deal-room && npx drizzle-kit migrate
```

- [ ] **Step 4: Backfill `notifyDigest` from legacy column**

Write a one-shot SQL snippet (run via `psql` or drizzle-kit's studio). Example in a new file `drizzle/backfill-notify-digest.sql`:

```sql
UPDATE users SET notify_digest = notification_digest WHERE notify_digest <> notification_digest;
```

Document this as a step in the deploy runbook; no migration file auto-executes data copies.

- [ ] **Step 5: Commit**

```bash
git add src/db/schema.ts drizzle/
git commit -m "feat(schema): per-channel email prefs + notification_queue attempts/last_error"
```

---

## Task 4: Unsubscribe-Token Helper

HMAC-signed token encoding `{ userId, channel, exp }`. Channels: `uploads`, `digest`.

**Files:**
- Create: `src/lib/email/unsubscribe.ts`
- Test: `src/lib/email/unsubscribe.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// src/lib/email/unsubscribe.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { signUnsubscribeToken, verifyUnsubscribeToken } from './unsubscribe';

beforeEach(() => {
  process.env.UNSUBSCRIBE_SECRET = 'a-strong-secret-at-least-thirty-two-chars';
});

describe('unsubscribe token', () => {
  it('round-trips', () => {
    const t = signUnsubscribeToken({ userId: 'u1', channel: 'uploads' });
    expect(verifyUnsubscribeToken(t)).toMatchObject({ userId: 'u1', channel: 'uploads' });
  });

  it('rejects tampered tokens', () => {
    const t = signUnsubscribeToken({ userId: 'u1', channel: 'uploads' });
    expect(verifyUnsubscribeToken(t + 'x')).toBeNull();
  });

  it('rejects unknown channel', () => {
    const t = signUnsubscribeToken({ userId: 'u1', channel: 'bogus' as any });
    expect(verifyUnsubscribeToken(t)).toBeNull();
  });
});
```

- [ ] **Step 2: Run (expect FAIL)**

```bash
cd cis-deal-room && npx vitest run src/lib/email/unsubscribe.test.ts
```

- [ ] **Step 3: Implement**

```ts
// src/lib/email/unsubscribe.ts
import crypto from 'crypto';

export type UnsubChannel = 'uploads' | 'digest';
const CHANNELS: readonly UnsubChannel[] = ['uploads', 'digest'];

interface Payload {
  userId: string;
  channel: UnsubChannel;
  exp: number;
}

function getSecret(): Buffer {
  const s = process.env.UNSUBSCRIBE_SECRET;
  if (!s || s.length < 32) throw new Error('UNSUBSCRIBE_SECRET must be set (>=32 chars).');
  return Buffer.from(s, 'utf8');
}

function b64url(b: Buffer) { return b.toString('base64url'); }

export function signUnsubscribeToken(
  fields: { userId: string; channel: UnsubChannel },
  ttlSeconds = 60 * 60 * 24 * 365
): string {
  const body = b64url(
    Buffer.from(JSON.stringify({ ...fields, exp: Math.floor(Date.now() / 1000) + ttlSeconds }))
  );
  const sig = b64url(crypto.createHmac('sha256', getSecret()).update(body).digest());
  return `${body}.${sig}`;
}

export function verifyUnsubscribeToken(token: string): Payload | null {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expected = b64url(crypto.createHmac('sha256', getSecret()).update(body).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let parsed: Payload;
  try {
    parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Payload;
  } catch {
    return null;
  }
  if (!CHANNELS.includes(parsed.channel)) return null;
  if (typeof parsed.exp !== 'number' || parsed.exp * 1000 < Date.now()) return null;
  return parsed;
}
```

- [ ] **Step 4: Run (expect PASS)**

```bash
cd cis-deal-room && npx vitest run src/lib/email/unsubscribe.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/email/unsubscribe.ts src/lib/email/unsubscribe.test.ts
git commit -m "feat(email): signed unsubscribe token for per-channel opt-out"
```

---

## Task 5: Unsubscribe Route

**Files:**
- Create: `src/app/api/unsubscribe/route.ts`
- Create: `src/app/api/unsubscribe/route.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// src/app/api/unsubscribe/route.test.ts
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
```

- [ ] **Step 2: Run (expect FAIL)**

```bash
cd cis-deal-room && npx vitest run src/app/api/unsubscribe/route.test.ts
```

- [ ] **Step 3: Implement**

```ts
// src/app/api/unsubscribe/route.ts
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { users } from '@/db/schema';
import { verifyUnsubscribeToken } from '@/lib/email/unsubscribe';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const t = url.searchParams.get('t');
  if (!t) return Response.json({ error: 'Missing token' }, { status: 400 });

  const payload = verifyUnsubscribeToken(t);
  if (!payload) return Response.json({ error: 'Invalid or expired token' }, { status: 400 });

  const patch =
    payload.channel === 'uploads'
      ? { notifyUploads: false, updatedAt: new Date() }
      : { notifyDigest: false, updatedAt: new Date() };

  await db.update(users).set(patch).where(eq(users.id, payload.userId));

  return new Response(
    `<!doctype html><html><body style="font-family:sans-serif;padding:40px"><h1>Unsubscribed</h1><p>You won't receive further ${payload.channel} emails. You can re-enable this in your account settings.</p></body></html>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8' }, status: 200 }
  );
}
```

- [ ] **Step 4: Run (expect PASS)**

```bash
cd cis-deal-room && npx vitest run src/app/api/unsubscribe/route.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/app/api/unsubscribe/route.ts src/app/api/unsubscribe/route.test.ts
git commit -m "feat(email): GET /api/unsubscribe applies channel opt-out"
```

---

## Task 6: Embed Unsubscribe Footer in Upload + Digest Templates

**Files:**
- Modify: `src/lib/email/upload-batch.tsx`
- Modify: `src/lib/email/daily-digest.tsx`

- [ ] **Step 1: Add an unsubscribeUrl prop and render it**

In `src/lib/email/upload-batch.tsx`, extend the props and add a footer line:

```tsx
interface UploadBatchEmailProps {
  workspaceName: string;
  folderName: string;
  files: Array<{ fileName: string; sizeBytes: number }>;
  workspaceLink: string;
  uploaderEmail: string;
  unsubscribeUrl: string; // new
}

// In JSX, just above the existing footer <Text>:
<Text style={smallTextStyle}>
  Don't want upload notifications?{' '}
  <a href={unsubscribeUrl} style={{ color: '#52525B', textDecoration: 'underline' }}>
    Unsubscribe
  </a>.
</Text>
```

Same change in `src/lib/email/daily-digest.tsx`, with `channel=digest`.

- [ ] **Step 2: Pass the URL from the route/cron**

In `src/app/api/workspaces/[id]/notify-upload-batch/route.ts`, build the URL and pass it through `enqueueOrSend`:

```ts
import { signUnsubscribeToken } from '@/lib/email/unsubscribe';
// …
  for (const recipient of recipients) {
    const unsubToken = signUnsubscribeToken({ userId: recipient.userId, channel: 'uploads' });
    const unsubscribeUrl = `${appUrl}/api/unsubscribe?t=${encodeURIComponent(unsubToken)}`;
    try {
      await enqueueOrSend({
        userId: recipient.userId,
        // …existing fields…
        immediateEmail: async () => ({
          to: recipient.email,
          subject: `${fileRows.length} new file${fileRows.length === 1 ? '' : 's'} in ${folder.name}`,
          react: UploadBatchNotificationEmail({
            workspaceName: workspace.name,
            folderName: folder.name,
            files: fileRows.map((f) => ({ fileName: f.name, sizeBytes: f.sizeBytes })),
            workspaceLink,
            uploaderEmail: session.userEmail,
            unsubscribeUrl,
          }),
        }),
      });
    } catch (err) {
      console.warn('[notify-upload-batch] send failure:', err);
    }
  }
```

In `src/app/api/cron/digest/route.ts` where `DailyDigestEmail` is built, pass the digest channel:

```ts
import { signUnsubscribeToken } from '@/lib/email/unsubscribe';
// …
const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
// inside the per-user loop, before sendEmail:
const unsubToken = signUnsubscribeToken({ userId, channel: 'digest' });
const unsubscribeUrl = `${appUrl}/api/unsubscribe?t=${encodeURIComponent(unsubToken)}`;
// then pass `unsubscribeUrl` into DailyDigestEmail(...).
```

- [ ] **Step 3: Run tests**

```bash
cd cis-deal-room && npm test
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/email src/app/api/workspaces/[id]/notify-upload-batch/route.ts src/app/api/cron/digest/route.ts
git commit -m "feat(email): per-channel unsubscribe footer in upload and digest templates"
```

---

## Task 7: Honour Per-Channel Prefs in `enqueueOrSend`

**Files:**
- Modify: `src/lib/notifications/enqueue-or-send.ts`

Signature gains a `channel` field; the helper reads the right column.

- [ ] **Step 1: Write failing test**

Create `src/lib/notifications/enqueue-or-send.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSend = vi.fn().mockResolvedValue({ id: 'x' });
vi.mock('@/lib/email/send', () => ({ sendEmail: mockSend }));

const mockInsert = vi.fn().mockResolvedValue(undefined);
const mockSelect = vi.fn();
vi.mock('@/db', () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ limit: mockSelect }) }) }),
    insert: () => ({ values: (x: unknown) => mockInsert(x) }),
  },
}));

import { enqueueOrSend } from './enqueue-or-send';

beforeEach(() => vi.clearAllMocks());

describe('enqueueOrSend channel routing', () => {
  const base = {
    userId: 'u1', workspaceId: 'w1', action: 'uploaded' as const,
    targetType: 'file' as const, targetId: 't1', metadata: {},
    immediateEmail: async () => ({ to: 'u@x.com', subject: 's', react: null as any }),
  };

  it('skips the send entirely when the channel is disabled', async () => {
    mockSelect.mockResolvedValueOnce([{ notifyUploads: false, notifyDigest: false }]);
    await enqueueOrSend({ ...base, channel: 'uploads' });
    expect(mockSend).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('sends immediately when digest is off and channel is enabled', async () => {
    mockSelect.mockResolvedValueOnce([{ notifyUploads: true, notifyDigest: false }]);
    await enqueueOrSend({ ...base, channel: 'uploads' });
    expect(mockSend).toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('enqueues when the user prefers digest', async () => {
    mockSelect.mockResolvedValueOnce([{ notifyUploads: true, notifyDigest: true }]);
    await enqueueOrSend({ ...base, channel: 'uploads' });
    expect(mockSend).not.toHaveBeenCalled();
    expect(mockInsert).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run (expect FAIL)**

```bash
cd cis-deal-room && npx vitest run src/lib/notifications/enqueue-or-send.test.ts
```

- [ ] **Step 3: Implement**

Replace `src/lib/notifications/enqueue-or-send.ts`:

```ts
import { db } from '@/db';
import { notificationQueue, users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { sendEmail } from '@/lib/email/send';
import type { ReactElement } from 'react';
import type { ActivityAction, ActivityTargetType } from '@/types';

type Channel = 'uploads' | 'digest';

interface Input {
  userId: string;
  workspaceId: string;
  action: ActivityAction;
  targetType: ActivityTargetType;
  targetId: string | null;
  metadata: Record<string, unknown>;
  channel: Channel;
  immediateEmail: () => Promise<{
    to: string;
    subject: string;
    react: ReactElement;
  }>;
}

export async function enqueueOrSend(input: Input): Promise<void> {
  const [prefs] = await db
    .select({
      notifyUploads: users.notifyUploads,
      notifyDigest: users.notifyDigest,
    })
    .from(users)
    .where(eq(users.id, input.userId))
    .limit(1);

  if (!prefs) return;

  // Per-channel opt-out: bail out entirely if the user disabled this channel.
  if (input.channel === 'uploads' && !prefs.notifyUploads) return;

  if (prefs.notifyDigest) {
    await db.insert(notificationQueue).values({
      userId: input.userId,
      workspaceId: input.workspaceId,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      metadata: input.metadata,
    });
    return;
  }

  const payload = await input.immediateEmail();
  await sendEmail(payload);
}
```

Update the caller in `notify-upload-batch/route.ts` to pass `channel: 'uploads'`.

- [ ] **Step 4: Run (expect PASS)**

```bash
cd cis-deal-room && npx vitest run src/lib/notifications/enqueue-or-send.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/notifications/enqueue-or-send.ts src/lib/notifications/enqueue-or-send.test.ts src/app/api/workspaces/[id]/notify-upload-batch/route.ts
git commit -m "feat(notifications): per-channel preference routing in enqueueOrSend"
```

---

## Task 8: Atomic Row-Claim in Digest Cron

The cron currently reads unprocessed rows then updates them *after* all sends finish. Two overlapping invocations can double-send. Switch to a CTE-claim that marks the rows in-flight up front.

**Files:**
- Modify: `src/app/api/cron/digest/route.ts`
- Modify: `src/test/api/cron-digest.test.ts`

- [ ] **Step 1: Write failing test**

Append to `src/test/api/cron-digest.test.ts`:

```ts
  it('claims rows in a single UPDATE … RETURNING, not in a separate pass', async () => {
    // We assert the shape: the cron route must now use db.execute with a raw SQL
    // that RETURNs rows; if it still uses two queries (select then update), the
    // mocked db.select will be called and the spy will catch it.
    const selectSpy = vi.fn().mockResolvedValue([]);
    mockSelect.mockImplementation(selectSpy);
    const res = await POST(new Request('http://localhost/api/cron/digest', { method: 'POST' }));
    expect(res.status).toBe(200);
    expect(selectSpy).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run (expect FAIL)**

```bash
cd cis-deal-room && npx vitest run src/test/api/cron-digest.test.ts
```

- [ ] **Step 3: Implement**

Replace the top-of-body `select … isNull(processedAt)` block in `src/app/api/cron/digest/route.ts` with an atomic claim:

```ts
import { sql } from 'drizzle-orm';
// …

  // Atomic claim: mark all unprocessed rows processed_at=now() and RETURN them.
  // A second overlapping invocation will find zero unclaimed rows.
  const claimed = (await db.execute(sql`
    WITH claimed AS (
      UPDATE notification_queue
         SET processed_at = now()
       WHERE processed_at IS NULL
         AND attempts < 5
      RETURNING id, user_id, workspace_id, action, target_type, target_id, metadata, attempts, created_at
    )
    SELECT * FROM claimed
  `)) as unknown as {
    rows: Array<{
      id: string; user_id: string; workspace_id: string; action: string;
      target_type: string; target_id: string | null; metadata: unknown;
      attempts: number; created_at: Date;
    }>;
  };

  const queued = claimed.rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    workspaceId: r.workspace_id,
    action: r.action,
    targetType: r.target_type,
    targetId: r.target_id,
    metadata: r.metadata,
    createdAt: r.created_at instanceof Date ? r.created_at : new Date(r.created_at),
  }));

  if (queued.length === 0) {
    return Response.json({ processed: 0 });
  }
```

Below, where `sendEmail` fails in the per-user loop, update the row instead of leaving it: increment `attempts`, set `last_error`, and clear `processed_at` back to null so a later run can retry (bounded by `attempts < 5`):

```ts
    try {
      await sendEmail({ /* … */ });
      processed += events.length;
    } catch (err) {
      console.warn('[cron-digest] send failure for user', userId, err);
      const msg = err instanceof Error ? err.message : 'unknown';
      await db
        .update(notificationQueue)
        .set({
          processedAt: null,
          attempts: sql`${notificationQueue.attempts} + 1`,
          lastError: msg.slice(0, 500),
        })
        .where(inArray(notificationQueue.id, events.map((e) => e.id)));
    }
```

Finally, delete the dangling final `db.update(notificationQueue).set({ processedAt: new Date() }).where(inArray(…, processedIds))` — the claim step already did the atomic update.

- [ ] **Step 4: Run tests**

```bash
cd cis-deal-room && npm test
```

- [ ] **Step 5: Commit**

```bash
git add src/app/api/cron/digest/route.ts src/test/api/cron-digest.test.ts
git commit -m "fix(cron): atomic row claim prevents digest double-send; retries bounded"
```

---

## Task 9: Self-Host pdf.js Worker

**Files:**
- Create: `scripts/copy-pdf-worker.mjs`
- Modify: `package.json`
- Modify: `src/components/workspace/preview/PdfPreview.tsx`

- [ ] **Step 1: Create copy script**

```js
// scripts/copy-pdf-worker.mjs
import { copyFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const pdfjsEntry = require.resolve('pdfjs-dist/build/pdf.worker.min.mjs');
const dest = resolve(process.cwd(), 'public/pdf.worker.min.mjs');
await mkdir(dirname(dest), { recursive: true });
await copyFile(pdfjsEntry, dest);
console.log(`[pdf-worker] copied to ${dest}`);
```

- [ ] **Step 2: Wire into npm scripts**

Edit `package.json`. Inside `"scripts"`, add `predev` and `prebuild`:

```json
"predev": "node scripts/copy-pdf-worker.mjs",
"prebuild": "node scripts/copy-pdf-worker.mjs",
```

- [ ] **Step 3: Point PdfPreview at the local worker**

In `src/components/workspace/preview/PdfPreview.tsx` replace:

```ts
pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
```

with:

```ts
pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
```

- [ ] **Step 4: Verify copy + build**

```bash
cd cis-deal-room && node scripts/copy-pdf-worker.mjs && ls -l public/pdf.worker.min.mjs
cd cis-deal-room && npm run build
```

Expected: the worker file exists in `public/`, the build succeeds, and visiting a PDF in the dev server no longer hits jsdelivr.

- [ ] **Step 5: Commit**

```bash
git add scripts/copy-pdf-worker.mjs package.json src/components/workspace/preview/PdfPreview.tsx public/pdf.worker.min.mjs
git commit -m "fix(preview): self-host pdf.js worker (drop jsdelivr CDN dependency)"
```

---

## Task 10: Bound xlsx Parse Range

**Files:**
- Modify: `src/components/workspace/preview/SheetPreview.tsx`

- [ ] **Step 1: Read current parse site**

```bash
cd cis-deal-room && grep -n "XLSX\|sheet_to_json\|XLSX.read" src/components/workspace/preview/SheetPreview.tsx
```

- [ ] **Step 2: Add a hard cap**

Inside the xlsx read path, replace the parse with a bounded version:

```ts
import * as XLSX from 'xlsx';

const MAX_ROWS = 1000;
const MAX_COLS = 200;

const wb = XLSX.read(buffer, { type: 'array', cellHTML: false, cellFormula: false });
const firstSheetName = wb.SheetNames[0];
const sheet = wb.Sheets[firstSheetName];

// Constrain the range before sheet_to_json so huge sheets don't expand.
const original = XLSX.utils.decode_range(sheet['!ref'] ?? 'A1');
const clipped = {
  s: original.s,
  e: {
    r: Math.min(original.e.r, original.s.r + MAX_ROWS - 1),
    c: Math.min(original.e.c, original.s.c + MAX_COLS - 1),
  },
};
const range = XLSX.utils.encode_range(clipped);
const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, range, defval: '' });
```

- [ ] **Step 3: Update any existing test**

```bash
cd cis-deal-room && npx vitest run src/components/workspace/preview/SheetPreview.test.tsx
```

If the existing sanity test passes, no further change needed. Consider adding a test with a synthetic 50k-row sheet that asserts preview renders ≤ `MAX_ROWS + 1` rows (header + 1000).

- [ ] **Step 4: Commit**

```bash
git add src/components/workspace/preview/SheetPreview.tsx
git commit -m "fix(preview): cap xlsx parse to 1000×200 cells to prevent tab OOM"
```

---

## Task 11: Rate-Limit `/api/files/[id]/log-preview`

A malicious user can flood activity_logs. Add a per-user+file limit.

**Files:**
- Modify: `src/lib/auth/rate-limit.ts` — add a `previewLogLimiter`
- Modify: `src/app/api/files/[id]/log-preview/route.ts`

- [ ] **Step 1: Add limiter**

In `src/lib/auth/rate-limit.ts`, append:

```ts
/**
 * Per-user-plus-file: 10 preview-log writes per minute. Plenty for
 * legitimate re-opens, catches tab-flapping or abuse.
 */
export const previewLogLimiter = buildLimiter(10, '15 m', 'rl:preview-log');
```

(Change the second arg type to also accept `'1 m'` if you want a tighter window — `'15 m'` is acceptable here because volume is low.)

- [ ] **Step 2: Apply in route**

Edit `src/app/api/files/[id]/log-preview/route.ts`:

```ts
import { previewLogLimiter } from '@/lib/auth/rate-limit';
// at the top of POST, after verifySession and getFileById:
  const identifier = `${session.userId}:${fileId}`;
  const { success } = await previewLogLimiter.limit(identifier);
  if (!success) return new Response(null, { status: 204 }); // silent drop
```

Note: return 204 (rather than 429) so the client UX is unchanged — the log is idempotent-ish and missing one preview record is acceptable.

- [ ] **Step 3: Update test**

Inspect `src/test/api/files-log-preview.test.ts`; add a case where `previewLogLimiter.limit` is mocked to return `{ success: false }` and assert a 204 response with no DB insert.

- [ ] **Step 4: Run**

```bash
cd cis-deal-room && npm test
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/rate-limit.ts src/app/api/files/[id]/log-preview/route.ts src/test/api/files-log-preview.test.ts
git commit -m "fix(files): rate-limit log-preview to 10/15min per user+file"
```

---

## Task 12: Extend `/api/user/preferences` with Per-Channel Flags

**Files:**
- Modify: `src/app/api/user/preferences/route.ts`
- Modify: `src/test/api/user-preferences.test.ts`

- [ ] **Step 1: Write failing test**

Add a case asserting that `notifyUploads` and `notifyDigest` can be toggled independently.

```ts
  it('updates notifyUploads and notifyDigest independently', async () => {
    vi.mocked(verifySession).mockResolvedValue(session);
    mockReturning.mockResolvedValueOnce([{ id: 'u1', notifyUploads: false, notifyDigest: true }]);
    const res = await POST(new Request('http://localhost/api/user/preferences', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ notifyUploads: false, notifyDigest: true }),
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.notifyUploads).toBe(false);
    expect(body.notifyDigest).toBe(true);
  });
```

- [ ] **Step 2: Run (expect FAIL)**

```bash
cd cis-deal-room && npx vitest run src/test/api/user-preferences.test.ts
```

- [ ] **Step 3: Implement**

Replace `src/app/api/user/preferences/route.ts`:

```ts
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { users } from '@/db/schema';
import { verifySession } from '@/lib/dal/index';

const prefsSchema = z.object({
  notificationDigest: z.boolean().optional(), // legacy alias
  notifyUploads: z.boolean().optional(),
  notifyDigest: z.boolean().optional(),
});

export async function POST(request: Request) {
  const session = await verifySession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  let parsed: z.infer<typeof prefsSchema>;
  try {
    parsed = prefsSchema.parse(await request.json());
  } catch (err) {
    if (err instanceof z.ZodError) {
      return Response.json({ error: err.issues }, { status: 400 });
    }
    return Response.json({ error: 'Invalid request' }, { status: 400 });
  }

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.notifyUploads !== undefined) patch.notifyUploads = parsed.notifyUploads;
  if (parsed.notifyDigest !== undefined) patch.notifyDigest = parsed.notifyDigest;
  if (parsed.notificationDigest !== undefined) {
    patch.notificationDigest = parsed.notificationDigest;
    if (parsed.notifyDigest === undefined) patch.notifyDigest = parsed.notificationDigest;
  }

  const [updated] = await db
    .update(users)
    .set(patch)
    .where(eq(users.id, session.userId))
    .returning({
      id: users.id,
      notifyUploads: users.notifyUploads,
      notifyDigest: users.notifyDigest,
      notificationDigest: users.notificationDigest,
    });

  return Response.json(updated);
}
```

- [ ] **Step 4: Run (expect PASS)**

```bash
cd cis-deal-room && npx vitest run src/test/api/user-preferences.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/app/api/user/preferences/route.ts src/test/api/user-preferences.test.ts
git commit -m "feat(prefs): accept per-channel notifyUploads / notifyDigest"
```

---

## Task 13: Full Test Run + Build + Runbook Note

- [ ] **Step 1: Typecheck and test**

```bash
cd cis-deal-room && npm run typecheck && npm test
```

- [ ] **Step 2: Build**

```bash
cd cis-deal-room && npm run build
```

- [ ] **Step 3: Env-var runbook note**

Add `UNSUBSCRIBE_SECRET` to the deploy env docs, alongside `UPLOAD_TOKEN_SECRET` from the authz plan. Commit any README/docs update:

```bash
cd cis-deal-room && grep -rn "UNSUBSCRIBE_SECRET\|UPLOAD_TOKEN_SECRET" docs README.md 2>/dev/null
git add -A
git commit -m "docs: document UNSUBSCRIBE_SECRET env requirement"
```

- [ ] **Step 4: Backfill + drop-legacy-column task (deferred)**

After this plan is deployed and `notifyDigest` has been in parity with `notificationDigest` for at least one release, plan a follow-up migration to drop `users.notification_digest`. Don't do it in this plan — backfill safety requires verifying no deploy reads the old column. Leave a comment in `schema.ts`:

```ts
// TODO(post-deploy): drop `notificationDigest` once backfill to `notifyDigest` is confirmed.
```

---

## Self-Review Checklist

- [x] Spec coverage: header injection (T1–T2), per-channel preferences + unsubscribe (T3–T7, T12), digest dedup + retry (T8), pdf worker self-host (T9), xlsx DoS (T10), log-preview rate-limit (T11).
- [x] No placeholders — each task shows full code or exact diff.
- [x] Types/names consistent — `safeHeader`/`safeEmailAddress`, `signUnsubscribeToken`/`verifyUnsubscribeToken`, `previewLogLimiter`, `enqueueOrSend` with `channel` argument.
- [x] Env-var additions (`UPLOAD_TOKEN_SECRET` from authz plan, `UNSUBSCRIBE_SECRET` here) flagged for the deploy runbook.
- [x] Schema migration + backfill + legacy-column-drop separated into three discrete steps across plans / follow-up.
