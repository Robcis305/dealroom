# Phase 1: Foundation - Research

**Researched:** 2026-04-12
**Domain:** Next.js 15 App Router, magic link auth, PostgreSQL/Drizzle, Tailwind CSS, Resend email
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Login Flow UX**
- After email submit: Inline confirmation — same screen transforms, email input fades out, confirmation message ("Check your email, we sent a link to [email]") appears in its place. No page navigation.
- Resend email: Available immediately after sending — no cooldown, no rate limiting at the UX level (server-side rate limiting still applies per AUTH-06)
- Expired/already-used links: Show a specific inline error on the /auth/verify page — distinguish "This link has expired" from "This link has already been used" — with a button to request a new link from the same page
- Session expiry: Redirect to /login, always land on deal list after re-auth. No returnUrl preservation — keep it simple.

**New Workspace Creation**
- Location: Centered modal overlay over the deal list (not a dedicated page)
- Form fields: Deal Codename (required), Client Name (required, admin-visible only), CIS Advisory Side (required radio buttons: Buyer-side / Seller-side), Initial Status (required dropdown — admin picks from the 6 status options at creation)
- CIS Advisory Side control: Radio buttons — clearly labeled, required, cannot be changed after creation
- After creation: Immediately enter the new workspace. Default to the deal overview state (no folder selected).

**Workspace Shell Layout & Defaults**
- Default state on workspace entry: No folder selected — center panel shows deal overview
- Deal overview (no-folder-selected state): Shows deal name, status badge, CIS advisory side, creation date, and per-folder file counts as a summary grid
- Status change: Status badge in the workspace header is clickable → opens a dropdown for admin to change status. Admin-only.
- Right panel default: Activity tab on workspace entry
- Role-based header: Admin sees "New Deal Room" button on deal list; non-admin users do not see it. Workspace header "Invite" and "Upload" buttons visible to roles with those permissions only.
- User assignment constraint: Users are always invited to a specific workspace — there is no system-level account without a deal association. The "no workspaces" empty state should not occur in normal usage.

**Folder Management (Shell Phase)**
- Folder icons: Proper SVG icons (lucide-react) — no emoji. Emoji render inconsistently and feel too casual for this context.
- Folder structure: Flat — no subfolders, no subfolder chips, no nested hierarchy. The prototype's subfolder chips are removed entirely.
- Default folders auto-created on workspace creation: Financials, Legal, Operations, Human Capital, Tax, Technology, Deal Documents, Miscellaneous

**File Icons**
- File type icons: Proper SVG icons (consistent with folder icons) — no emoji for file types either.

**Visual Implementation**
- Prototype fidelity: Visual match only — rebuild entirely in Tailwind CSS with proper React components. Do not port inline styles from prototype.
- Logo: Real CIS Partners logo file will be provided — implement a clearly marked placeholder slot in the header until the asset is delivered. No gradient square fallback.

### Claude's Discretion
- Tailwind component architecture and file structure
- Token hashing implementation (SHA-256 as specified in AUTH-02)
- Session storage strategy (database sessions vs JWT) — decide during research/planning
- Database provider (Neon vs Supabase) — decide during research based on auth integration
- Rate limiting implementation for AUTH-06
- Activity log schema design (append-only, UUID PKs)
- Exact lucide-react icon choices per folder/file type

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| AUTH-01 | User can authenticate via magic link sent to their email address (no passwords) | Custom implementation: generate token → hash → store → send via Resend → verify |
| AUTH-02 | Magic link tokens expire after 10 minutes, are single-use, and are stored as SHA-256 hashes in the database | Node.js `crypto.createHash('sha256')` on raw token; `expires_at` column; delete row on use |
| AUTH-03 | Authenticated session persists for 24 hours of inactivity; re-authentication required after expiry | Database session table with `last_active_at`; middleware reads session cookie, validates DB row |
| AUTH-05 | Re-authentication uses the same magic link flow (enter email → receive link → click to access) | Same `/login` route; session expiry clears cookie and redirects; no returnUrl |
| AUTH-06 | Rate limiting enforced on authentication endpoints | Upstash Redis + `@upstash/ratelimit` sliding window on `/api/auth/send` and `/api/auth/verify` |
| WORK-01 | Admin can create a deal workspace with codename, client name, initial status, and CIS advisory side | Drizzle `workspaces` table; modal form POSTs to `/api/workspaces`; Server Action or Route Handler |
| WORK-02 | Deal list home screen shows all workspaces the authenticated user has access to | `verifySession()` in DAL; admin query returns all; non-admin joins through `workspace_participants` |
| WORK-03 | Deal status lifecycle supports: Engagement, Active DD, IOI Stage, Closing, Closed, Archived | Drizzle `pgEnum` for status; clickable badge in workspace header for admin only |
| FOLD-01 | New workspace automatically creates 8 default folders | Transactional insert: workspace + 8 folders in one Drizzle transaction |
| FOLD-02 | Admin can rename, add, and delete folders at any time | Route Handlers: PATCH `/api/folders/[id]`, POST `/api/workspaces/[id]/folders`, DELETE `/api/folders/[id]` |
| FOLD-03 | Folder-level access control — each participant can be granted or restricted from specific folders independently | `folder_access` table schema established in Phase 1 (PART-01 populates it in Phase 3) |
| ACTY-01 | All significant actions logged immutably (append-only, no edits or deletions) | `activity_logs` table; `logActivity()` helper in DAL; called on workspace create, folder create/rename/delete |
| UI-02 | Three-panel workspace layout: folder sidebar (240px), file list (flex-1), activity + participants panel (280px) | Tailwind `flex` layout per design system; right panel spec is 320px in MASTER.md |
| UI-05 | Login screen with email input, magic link confirmation state, and CIS Partners branding | Client component with `useState` toggling between input view and confirmation view |
| UI-07 | CIS brand applied throughout — #E10600 accent, #000000/#0D0D0D base, DM Sans, JetBrains Mono | Design system MASTER.md is the authoritative source; Tailwind config extends with custom tokens |
</phase_requirements>

---

## Summary

Phase 1 establishes the entire security and data foundation for the CIS Deal Room: the Next.js 15 App Router project itself, magic link authentication with custom token handling, database schema, and the three-panel workspace shell. Every subsequent phase inherits the auth middleware, session utilities, and data access patterns defined here.

The key architectural decision resolved by research: **use database sessions, not stateless JWT cookies**. The spec explicitly requires admin-initiated session revocation (AUTH-04) and the 24-hour inactivity window (AUTH-03), both of which require a server-side session record. Pure JWT is unsuitable because tokens cannot be invalidated before expiry. The implementation uses an encrypted session ID cookie (via `iron-session`) pointing to a `sessions` table row — validation on every request touches the DB, which is acceptable given Neon's serverless latency profile.

The stack is: **Next.js 15 + TypeScript + Tailwind CSS + Drizzle ORM + Neon PostgreSQL + Resend + Upstash Redis (rate limiting)**. This is a greenfield project — the Next.js app itself must be bootstrapped in this phase.

**Primary recommendation:** Build custom magic link auth (no Auth.js/NextAuth), implement the Data Access Layer pattern from day one, and use database sessions for full revocability. Neon over Supabase because this project uses auth-as-custom-code (no Supabase Auth needed) and Neon's native Drizzle integration + Vercel branching story is cleaner for a pure-Postgres setup.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| next | 15.x (latest) | Framework — App Router, Server Components, Route Handlers | Locked by spec |
| react | 19.x | UI library | Bundled with Next 15 |
| typescript | 5.x | Type safety | Locked by spec |
| tailwindcss | 4.x | Utility CSS | Locked by spec; v4 is current as of 2025 |
| drizzle-orm | 0.40+ | TypeScript ORM for PostgreSQL | Lightweight (~7kb), edge-compatible, code-first TS schema, no codegen step |
| drizzle-kit | 0.30+ | Migration tooling for Drizzle | Paired with drizzle-orm |
| @neondatabase/serverless | 0.10+ | Neon PostgreSQL serverless driver | Native WebSocket support, optimized for Vercel Functions |
| resend | 4.x | Transactional email (magic links) | Chosen in spec; React Email templates supported |
| iron-session | 8.x | Encrypted httpOnly cookie for session ID | Stateless cookie carrying session ID only — actual session in DB |
| lucide-react | 0.x (latest) | SVG icon library | Locked in CONTEXT.md; no emoji allowed |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @upstash/ratelimit | 2.x | Sliding window rate limiting | AUTH-06 — auth endpoint protection |
| @upstash/redis | 2.x | Redis client for Upstash | Paired with ratelimit; edge-compatible |
| clsx | 2.x | Conditional class merging | Used with Tailwind to avoid string concatenation bugs |
| tailwind-merge | 3.x | Merge Tailwind classes safely | Prevents class conflicts in component props |
| @react-email/components | latest | Email component primitives | Magic link email template |
| dotenv | 16.x | Environment variable loading | drizzle-kit CLI needs it for DATABASE_URL |
| zod | 3.x | Runtime schema validation | Validate form inputs in Server Actions/Route Handlers |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Drizzle ORM | Prisma 7 | Prisma 7 is now pure TypeScript (no Rust binary), but still requires `prisma generate` step; Drizzle is faster cold-start and has zero codegen |
| Neon | Supabase | Supabase bundles auth/storage/realtime — overkill when rolling custom auth; Neon is pure Postgres with cleaner Drizzle + Vercel story |
| iron-session | jose (JWT cookies) | Both work; iron-session has simpler API for encrypted cookies; JWT would still need DB validation for revocability so no advantage |
| @upstash/ratelimit | in-memory rate limit | In-memory doesn't survive serverless function restarts; Upstash Redis persists across cold starts |
| Custom magic link | Auth.js (NextAuth) v5 | Auth.js Email provider works but adds abstraction that fights against SHA-256 custom hashing spec and single-use token requirement; custom is ~80 lines and fully controlled |

### Installation

```bash
npx create-next-app@latest cis-deal-room --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"
cd cis-deal-room
npm install drizzle-orm @neondatabase/serverless iron-session resend lucide-react clsx tailwind-merge zod @upstash/ratelimit @upstash/redis @react-email/components
npm install -D drizzle-kit dotenv tsx
```

---

## Architecture Patterns

### Recommended Project Structure

```
src/
├── app/
│   ├── (auth)/
│   │   ├── login/
│   │   │   └── page.tsx          # Login screen (UI-05)
│   │   └── auth/
│   │       └── verify/
│   │           └── page.tsx      # Magic link landing page
│   ├── (app)/
│   │   ├── layout.tsx            # Auth-gated layout — calls verifySession()
│   │   ├── deals/
│   │   │   └── page.tsx          # Deal list (WORK-02)
│   │   └── workspace/
│   │       └── [workspaceId]/
│   │           └── page.tsx      # Three-panel workspace (UI-02)
│   ├── api/
│   │   ├── auth/
│   │   │   ├── send/route.ts     # POST: generate token, send email
│   │   │   └── verify/route.ts   # GET: validate token, create session
│   │   ├── workspaces/
│   │   │   ├── route.ts          # GET list, POST create
│   │   │   └── [id]/
│   │   │       ├── route.ts      # GET single workspace
│   │   │       ├── status/route.ts  # PATCH status
│   │   │       └── folders/route.ts # POST create folder
│   │   └── folders/
│   │       └── [id]/route.ts     # PATCH rename, DELETE
│   ├── layout.tsx                # Root layout — fonts
│   └── globals.css               # Tailwind directives + font imports
├── components/
│   ├── ui/                       # Primitive components (Button, Input, Modal, Badge)
│   ├── auth/
│   │   └── LoginForm.tsx         # Email input + confirmation state machine
│   ├── deals/
│   │   ├── DealList.tsx
│   │   ├── DealCard.tsx
│   │   └── NewDealModal.tsx
│   └── workspace/
│       ├── WorkspaceShell.tsx    # Three-panel container
│       ├── FolderSidebar.tsx
│       ├── DealOverview.tsx      # No-folder-selected center panel
│       └── RightPanel.tsx        # Activity/Participants tabs
├── db/
│   ├── index.ts                  # Drizzle client singleton
│   ├── schema.ts                 # All table definitions
│   └── migrations/               # Generated by drizzle-kit
├── lib/
│   ├── auth/
│   │   ├── session.ts            # getSession(), createSession(), destroySession()
│   │   ├── tokens.ts             # generateToken(), hashToken()
│   │   └── rate-limit.ts         # Upstash ratelimit instances
│   ├── dal/
│   │   ├── index.ts              # verifySession() — the DAL entry point
│   │   ├── workspaces.ts         # getWorkspacesForUser(), getWorkspace(), createWorkspace()
│   │   ├── folders.ts            # getFolders(), createFolder(), renameFolder(), deleteFolder()
│   │   └── activity.ts           # logActivity()
│   └── email/
│       └── magic-link.tsx        # React Email template for magic link
├── types/
│   └── index.ts                  # Shared TypeScript types/interfaces
└── middleware.ts                 # Lightweight redirect-only (NOT auth enforcement)
```

### Pattern 1: Data Access Layer (DAL) with verifySession()

**What:** Every server-side data function starts by calling `verifySession()`. Auth is enforced at the data boundary, not at the route boundary. This is the post-CVE-2025-29927 canonical pattern.

**When to use:** All Server Components, Server Actions, and Route Handlers that touch protected data.

```typescript
// src/lib/dal/index.ts
import { cache } from 'react';
import { cookies } from 'next/headers';
import { getSession } from '@/lib/auth/session';

export const verifySession = cache(async () => {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get('cis_session')?.value;
  if (!sessionId) return null;

  const session = await getSession(sessionId); // DB lookup
  if (!session || session.expires_at < new Date()) {
    return null;
  }
  return session; // { userId, userEmail, isAdmin, sessionId }
});

// Usage in any Server Component or Route Handler:
export async function getWorkspacesForUser() {
  const session = await verifySession();
  if (!session) throw new Error('Unauthorized');

  if (session.isAdmin) {
    return db.select().from(workspaces).orderBy(desc(workspaces.createdAt));
  }
  // Non-admin: join through workspace_participants
  return db
    .select({ workspace: workspaces })
    .from(workspaces)
    .innerJoin(workspaceParticipants, eq(workspaceParticipants.workspaceId, workspaces.id))
    .where(and(
      eq(workspaceParticipants.userId, session.userId),
      eq(workspaceParticipants.status, 'active')
    ));
}
```

### Pattern 2: Magic Link Authentication Flow (Custom, No Auth.js)

**What:** Custom implementation using raw token generation, SHA-256 hashing, and Resend for delivery. No third-party auth library.

**When to use:** This is the only auth flow — used for initial login and re-authentication.

```typescript
// src/lib/auth/tokens.ts
import crypto from 'crypto';

export function generateToken(): string {
  return crypto.randomBytes(32).toString('hex'); // 64-char hex string
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// src/app/api/auth/send/route.ts
export async function POST(request: Request) {
  const { email } = await request.json();

  // Rate limit check (see Pattern 4)
  const rateLimitResult = await authSendLimiter.limit(email);
  if (!rateLimitResult.success) {
    return Response.json({ error: 'Too many requests' }, { status: 429 });
  }

  const rawToken = generateToken();
  const hashedToken = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  // Delete any existing unused tokens for this email
  await db.delete(magicLinkTokens).where(eq(magicLinkTokens.email, email));

  // Store the HASH (never the raw token)
  await db.insert(magicLinkTokens).values({
    id: crypto.randomUUID(),
    email,
    tokenHash: hashedToken,
    expiresAt,
  });

  const magicLink = `${process.env.NEXT_PUBLIC_APP_URL}/auth/verify?token=${rawToken}&email=${encodeURIComponent(email)}`;

  await resend.emails.send({
    from: 'CIS Deal Room <noreply@dealroom.cispartners.co>',
    to: email,
    subject: 'Your CIS Deal Room login link',
    react: MagicLinkEmail({ magicLink, email }),
  });

  return Response.json({ success: true });
}

// src/app/api/auth/verify/route.ts
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawToken = searchParams.get('token');
  const email = searchParams.get('email');

  if (!rawToken || !email) {
    return Response.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/auth/verify?error=invalid`);
  }

  const hashedToken = hashToken(rawToken);

  const tokenRecord = await db
    .select()
    .from(magicLinkTokens)
    .where(eq(magicLinkTokens.tokenHash, hashedToken))
    .limit(1);

  if (!tokenRecord.length) {
    // No record = already used (deleted on first use)
    return Response.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/auth/verify?error=used`);
  }

  if (tokenRecord[0].expiresAt < new Date()) {
    await db.delete(magicLinkTokens).where(eq(magicLinkTokens.tokenHash, hashedToken));
    return Response.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/auth/verify?error=expired`);
  }

  // Valid — consume the token (delete it = single-use)
  await db.delete(magicLinkTokens).where(eq(magicLinkTokens.tokenHash, hashedToken));

  // Upsert user
  const user = await upsertUser(email);

  // Create database session
  const sessionId = await createSession(user.id);

  // Set encrypted cookie
  const response = Response.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/deals`);
  // iron-session sets the cookie on the response
  await setSessionCookie(response, sessionId);
  return response;
}
```

### Pattern 3: Database Session Management

**What:** Sessions live in a `sessions` table. Cookie contains only an encrypted session ID. On each request, the DAL validates the session row exists and `last_active_at` is within 24 hours.

**Why database sessions over stateless JWT:** The spec requires admin-initiated revocation (AUTH-04 in Phase 3). Pure JWT tokens cannot be invalidated before expiry. Database sessions can be deleted immediately.

```typescript
// src/db/schema.ts (sessions table)
export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  lastActiveAt: timestamp('last_active_at').notNull().defaultNow(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// src/lib/auth/session.ts
import { getIronSession } from 'iron-session';

export async function createSession(userId: string): Promise<string> {
  const sessionId = crypto.randomUUID();
  await db.insert(sessions).values({ id: sessionId, userId, lastActiveAt: new Date() });
  return sessionId;
}

export async function getSession(sessionId: string) {
  const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
  const cutoff = new Date(Date.now() - TWENTY_FOUR_HOURS);

  const result = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(
      eq(sessions.id, sessionId),
      gt(sessions.lastActiveAt, cutoff)
    ))
    .limit(1);

  if (!result.length) return null;

  // Slide the 24h window on each valid access
  await db.update(sessions)
    .set({ lastActiveAt: new Date() })
    .where(eq(sessions.id, sessionId));

  return { userId: result[0].user.id, userEmail: result[0].user.email, isAdmin: result[0].user.isAdmin, sessionId };
}
```

### Pattern 4: Rate Limiting (Upstash)

**What:** Sliding window rate limit on auth endpoints using Upstash Redis — edge-compatible, survives serverless cold starts.

```typescript
// src/lib/auth/rate-limit.ts
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

// 5 magic link requests per email per 15 minutes
export const authSendLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, '15 m'),
  prefix: 'rl:auth:send',
});

// 10 verify attempts per IP per 15 minutes (prevents token enumeration)
export const authVerifyLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, '15 m'),
  prefix: 'rl:auth:verify',
});
```

### Pattern 5: Workspace + Default Folders (Transactional)

**What:** Workspace creation and 8 default folder inserts happen in a single transaction. If either fails, neither commits.

```typescript
// src/lib/dal/workspaces.ts
const DEFAULT_FOLDERS = [
  'Financials', 'Legal', 'Operations', 'Human Capital',
  'Tax', 'Technology', 'Deal Documents', 'Miscellaneous'
];

export async function createWorkspace(input: {
  name: string;
  clientName: string;
  cisAdvisorySide: 'buyer_side' | 'seller_side';
  status: WorkspaceStatus;
  createdBy: string;
}) {
  const session = await verifySession();
  if (!session?.isAdmin) throw new Error('Admin required');

  return await db.transaction(async (tx) => {
    const [workspace] = await tx.insert(workspaces).values({
      id: crypto.randomUUID(),
      name: input.name,
      clientName: input.clientName,
      cisAdvisorySide: input.cisAdvisorySide,
      status: input.status,
      createdBy: input.createdBy,
    }).returning();

    await tx.insert(folders).values(
      DEFAULT_FOLDERS.map((name, i) => ({
        id: crypto.randomUUID(),
        workspaceId: workspace.id,
        name,
        sortOrder: i,
      }))
    );

    await logActivity(tx, {
      workspaceId: workspace.id,
      userId: input.createdBy,
      action: 'created_workspace',
      targetType: 'workspace',
      targetId: workspace.id,
      metadata: { name: input.name },
    });

    return workspace;
  });
}
```

### Pattern 6: Middleware — Redirect Only, Not Auth Enforcement

**What:** Following post-CVE-2025-29927 guidance, middleware handles redirects (unauthenticated users → /login) as a UX convenience only. Auth is enforced in the DAL on every data access.

```typescript
// src/middleware.ts
import { NextRequest, NextResponse } from 'next/server';

const PUBLIC_PATHS = ['/login', '/auth/verify'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some(p => pathname.startsWith(p));
  const hasSessionCookie = request.cookies.has('cis_session');

  if (!isPublic && !hasSessionCookie) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/auth).*)'],
};

// IMPORTANT: Middleware cookie check is UX only.
// verifySession() in the DAL is the actual security gate.
```

### Anti-Patterns to Avoid

- **Relying solely on middleware for auth:** CVE-2025-29927 — middleware can be bypassed via header spoofing. Always validate session in the DAL.
- **Storing raw tokens in DB:** Store only the SHA-256 hash. If the DB is compromised, hashed tokens cannot be replayed.
- **Storing session data in client-side storage:** Never localStorage/sessionStorage for session tokens — XSS vulnerable.
- **JWT for sessions:** Cannot be revoked before expiry — incompatible with admin revocation requirement.
- **Inline styles from prototype:** The prototype uses inline styles and emoji icons — do not port these patterns.
- **Emoji as icons:** Render inconsistently across OS; lucide-react only.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Encrypted session cookies | Custom cookie signing | `iron-session` | Handles key rotation, encoding, HMAC signing, size limits |
| Rate limiting | In-memory counter | `@upstash/ratelimit` | In-memory doesn't survive serverless function restarts; Redis persists |
| Email sending | SMTP/nodemailer | `resend` SDK | Deliverability, DKIM, React template rendering out of the box |
| CSS class merging | String concatenation | `clsx` + `tailwind-merge` | Prevents class conflicts; handles conditional classes safely |
| Input validation | Manual if-checks | `zod` | Runtime schema validation with TypeScript type inference |
| DB migrations | Raw SQL files | `drizzle-kit generate && migrate` | Tracks migration history, generates typed SQL, idempotent |

**Key insight:** The auth stack (token generation, hashing, session management) is ~150 lines of custom code — small enough to own fully. Everything else (email, cookies, rate limiting, ORM) has well-maintained libraries that handle the edge cases.

---

## Common Pitfalls

### Pitfall 1: Token Timing Attack on Verify
**What goes wrong:** Using string equality (`===`) to compare provided token hash against stored hash — vulnerable to timing side-channels.
**Why it happens:** Naive string comparison short-circuits on first mismatch.
**How to avoid:** Use `crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))` for hash comparison.
**Warning signs:** Direct string comparison of hashed tokens anywhere in the codebase.

### Pitfall 2: Magic Link Opens in Different Browser
**What goes wrong:** User requests link on desktop, opens on mobile — session cookie set in wrong browser context.
**Why it happens:** Magic links are stateless by design; no browser binding is enforced.
**How to avoid:** Accept this as expected behavior per the CONTEXT.md decision — no same-browser enforcement in scope for Phase 1.

### Pitfall 3: Session Not Sliding on Active Use
**What goes wrong:** User is actively using the app but gets logged out after 24h of the session's creation.
**Why it happens:** Session `last_active_at` is only set on creation, not updated on use.
**How to avoid:** `getSession()` must UPDATE `last_active_at = NOW()` every time it validates a session.

### Pitfall 4: Drizzle Schema Type Mismatch with Neon
**What goes wrong:** UUID columns return strings in some contexts but Drizzle expects the `uuid` type annotation.
**Why it happens:** Neon returns all columns as strings; Drizzle's type system needs explicit `.primaryKey().defaultRandom()` on uuid columns.
**How to avoid:** Always use `uuid('column_name').primaryKey().defaultRandom()` — never `text('id')` for UUID PKs.

### Pitfall 5: Next.js 15 Async Params/Cookies Breaking Change
**What goes wrong:** `params` in page components and `cookies()` in route handlers must be awaited — they are now Promises in Next.js 15.
**Why it happens:** Next.js 15 made these APIs async to support streaming.
**How to avoid:** `const { workspaceId } = await params;` and `const cookieStore = await cookies();` everywhere.

### Pitfall 6: Tailwind v4 Config Change
**What goes wrong:** `tailwind.config.js` approach from v3 doesn't work in v4 — custom tokens defined differently.
**Why it happens:** Tailwind v4 uses CSS-native configuration (`@theme` in globals.css) rather than a JS config file.
**How to avoid:** Define font families and custom colors in `globals.css` using `@theme { --font-sans: 'DM Sans'; }` — not in `tailwind.config.ts`.

### Pitfall 7: Neon Connection in Edge Runtime
**What goes wrong:** Using the standard Neon driver in Edge Middleware fails because Node.js APIs aren't available in the Edge runtime.
**Why it happens:** Edge runtime is a subset of Node.js.
**How to avoid:** Middleware does NOT make DB calls (cookie check only). DB access lives in Route Handlers and Server Components which run in the full Node.js runtime.

---

## Code Examples

### Drizzle Schema (Phase 1 Tables)

```typescript
// src/db/schema.ts
import { pgTable, uuid, text, timestamp, boolean, integer, pgEnum, jsonb } from 'drizzle-orm/pg-core';

export const workspaceStatusEnum = pgEnum('workspace_status', [
  'engagement', 'active_dd', 'ioi_stage', 'closing', 'closed', 'archived'
]);

export const cisAdvisorySideEnum = pgEnum('cis_advisory_side', ['buyer_side', 'seller_side']);

export const participantRoleEnum = pgEnum('participant_role', [
  'admin', 'cis_team', 'client', 'counsel', 'buyer_rep', 'seller_rep', 'view_only'
]);

export const participantStatusEnum = pgEnum('participant_status', ['invited', 'active', 'revoked']);

export const activityActionEnum = pgEnum('activity_action', [
  'uploaded', 'downloaded', 'viewed', 'deleted', 'invited', 'removed',
  'created_folder', 'renamed_folder', 'created_workspace', 'revoked_access', 'status_changed'
]);

export const activityTargetEnum = pgEnum('activity_target_type', ['file', 'folder', 'participant', 'workspace']);

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  name: text('name'),
  isAdmin: boolean('is_admin').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey(),  // generated in app, not DB
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  lastActiveAt: timestamp('last_active_at').notNull().defaultNow(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const magicLinkTokens = pgTable('magic_link_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const workspaces = pgTable('workspaces', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  clientName: text('client_name').notNull(),
  status: workspaceStatusEnum('status').notNull().default('engagement'),
  cisAdvisorySide: cisAdvisorySideEnum('cis_advisory_side').notNull(),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const workspaceParticipants = pgTable('workspace_participants', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: participantRoleEnum('role').notNull(),
  invitedBy: uuid('invited_by').references(() => users.id),
  status: participantStatusEnum('status').notNull().default('invited'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const folders = pgTable('folders', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const folderAccess = pgTable('folder_access', {
  id: uuid('id').primaryKey().defaultRandom(),
  folderId: uuid('folder_id').notNull().references(() => folders.id, { onDelete: 'cascade' }),
  participantId: uuid('participant_id').notNull().references(() => workspaceParticipants.id, { onDelete: 'cascade' }),
  canUpload: boolean('can_upload').notNull().default(false),
  canDownload: boolean('can_download').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// Files table — schema established in Phase 1, populated in Phase 2
export const files = pgTable('files', {
  id: uuid('id').primaryKey().defaultRandom(),
  folderId: uuid('folder_id').notNull().references(() => folders.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  s3Key: text('s3_key').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  mimeType: text('mime_type').notNull(),
  version: integer('version').notNull().default(1),
  uploadedBy: uuid('uploaded_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const activityLogs = pgTable('activity_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id),  // nullable — system actions
  action: activityActionEnum('action').notNull(),
  targetType: activityTargetEnum('target_type').notNull(),
  targetId: uuid('target_id'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  // NO updated_at — append-only, immutable
});
```

### Drizzle Config

```typescript
// drizzle.config.ts
import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  out: './src/db/migrations',
  schema: './src/db/schema.ts',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

### Neon DB Client Singleton

```typescript
// src/db/index.ts
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

const sql = neon(process.env.DATABASE_URL!);
export const db = drizzle({ client: sql, schema });
```

### Tailwind v4 Font Config

```css
/* src/app/globals.css */
@import "tailwindcss";
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700&family=JetBrains+Mono:wght@400;500&display=swap');

@theme {
  --font-sans: 'DM Sans', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, monospace;
  --color-brand: #E10600;
  --color-brand-hover: #C40500;
  --color-bg-page: #0D0D0D;
  --color-bg-elevated: #141414;
  --color-bg-surface: #1F1F1F;
  --color-border: #2A2A2A;
  --color-border-subtle: #1A1A1A;
}
```

### logActivity Helper

```typescript
// src/lib/dal/activity.ts
export async function logActivity(
  txOrDb: typeof db,
  params: {
    workspaceId: string;
    userId: string | null;
    action: typeof activityActionEnum.enumValues[number];
    targetType: typeof activityTargetEnum.enumValues[number];
    targetId?: string;
    metadata?: Record<string, unknown>;
  }
) {
  await txOrDb.insert(activityLogs).values({
    workspaceId: params.workspaceId,
    userId: params.userId,
    action: params.action,
    targetType: params.targetType,
    targetId: params.targetId ?? null,
    metadata: params.metadata ?? null,
  });
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Prisma with Rust binary | Drizzle ORM (or Prisma 7 pure-TS) | 2024-2025 | Eliminates binary compatibility issues in serverless; Drizzle is now the clear serverless-first choice |
| NextAuth/Auth.js for magic links | Custom ~150-line implementation | 2025 | Auth.js v5 added complexity for custom token requirements; custom is simpler and fully controlled |
| Middleware for auth enforcement | Data Access Layer (DAL) pattern | March 2025 (post-CVE-2025-29927) | Middleware-only auth is bypassable; DAL auth is the canonical Next.js team recommendation |
| tailwind.config.js (v3) | @theme in globals.css (v4) | Tailwind v4, 2025 | JS config file largely replaced by CSS-native configuration |
| next/font with local fonts | Google Fonts import + @theme | 2025 | For external fonts (DM Sans), direct import remains valid; next/font supports Google Fonts too |

**Deprecated/outdated:**
- `pages/` router pattern: All new Next.js work uses App Router
- JWT-only sessions without DB: Cannot support immediate revocation
- `getServerSideProps` / `getStaticProps`: Replaced by async Server Components and `fetch` with cache options

---

## Open Questions

1. **Tailwind v3 vs v4 in `create-next-app`**
   - What we know: `create-next-app` as of late 2025/early 2026 scaffolds Tailwind v4 by default
   - What's unclear: The exact generated config structure — v4 changed significantly from v3
   - Recommendation: Run `npx create-next-app@latest` in Wave 0 and inspect the generated config before writing any component code; adjust `globals.css` @theme block accordingly

2. **Resend domain verification for `dealroom.cispartners.co`**
   - What we know: Resend requires DNS records (SPF, DKIM, DMARC) before production sending; dev testing uses `onboarding@resend.dev`
   - What's unclear: Whether the domain is already configured or needs setup
   - Recommendation: Use `onboarding@resend.dev` as the from-address during development; add a task to configure the production domain before go-live

3. **S3 bucket configuration scope in Phase 1**
   - What we know: CONTEXT.md states "S3 bucket config established in Phase 1 even though presigned URL generation for file ops is Phase 2"
   - What's unclear: How much S3 setup is "established" — bucket creation and IAM policy only, or SDK integration too?
   - Recommendation: Phase 1 task creates the bucket, sets AES-256 SSE, configures CORS (portal domain only), and creates an IAM user with minimal permissions. The `@aws-sdk/client-s3` package is installed but no presigned URL code is written until Phase 2.

4. **Session cookie name and iron-session v8 API**
   - What we know: iron-session v8 works with Next.js App Router
   - What's unclear: Exact API surface for setting cookies on redirect responses (not standard Response.json)
   - Recommendation: Verify iron-session v8 `getIronSession()` usage with redirect responses in the verify route — may need to set cookie via `response.headers.set('Set-Cookie', ...)` after calling `session.save()`.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 3.x + React Testing Library (RTL) |
| Config file | `vitest.config.ts` — Wave 0 creates this |
| Quick run command | `npx vitest run --reporter=verbose` |
| Full suite command | `npx vitest run --coverage` |

Rationale: Vitest is the standard for Next.js App Router testing in 2025 (faster than Jest, native ESM, same API). Playwright is not included in Phase 1 — no e2e tests until there are complete user flows to test end-to-end.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AUTH-01 | `generateToken()` returns 64-char hex | unit | `npx vitest run src/lib/auth/tokens.test.ts` | Wave 0 |
| AUTH-02 | `hashToken()` produces consistent SHA-256; token deleted after verify | unit | `npx vitest run src/lib/auth/tokens.test.ts` | Wave 0 |
| AUTH-02 | Expired token returns `error=expired` redirect | unit | `npx vitest run src/app/api/auth/verify/route.test.ts` | Wave 0 |
| AUTH-02 | Used token returns `error=used` redirect | unit | `npx vitest run src/app/api/auth/verify/route.test.ts` | Wave 0 |
| AUTH-03 | `getSession()` returns null after 24h inactivity | unit | `npx vitest run src/lib/auth/session.test.ts` | Wave 0 |
| AUTH-03 | `getSession()` slides `last_active_at` on valid session | unit | `npx vitest run src/lib/auth/session.test.ts` | Wave 0 |
| AUTH-06 | Rate limiter blocks >5 requests/15min per email | unit (mocked Redis) | `npx vitest run src/lib/auth/rate-limit.test.ts` | Wave 0 |
| WORK-01 | `createWorkspace()` requires admin session | unit | `npx vitest run src/lib/dal/workspaces.test.ts` | Wave 0 |
| FOLD-01 | `createWorkspace()` inserts exactly 8 default folders | unit | `npx vitest run src/lib/dal/workspaces.test.ts` | Wave 0 |
| FOLD-02 | Folder rename updates name; folder delete cascades | unit | `npx vitest run src/lib/dal/folders.test.ts` | Wave 0 |
| ACTY-01 | `logActivity()` inserts row; no update/delete allowed | unit | `npx vitest run src/lib/dal/activity.test.ts` | Wave 0 |
| UI-05 | LoginForm shows confirmation state after submit | component | `npx vitest run src/components/auth/LoginForm.test.tsx` | Wave 0 |
| UI-05 | Verify page shows correct error for expired vs used | component | `npx vitest run src/app/auth/verify/page.test.tsx` | Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run --reporter=verbose` (all unit tests, ~5-10s)
- **Per wave merge:** `npx vitest run --coverage` (full suite with coverage report)
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `vitest.config.ts` — Vitest config with jsdom environment for component tests
- [ ] `src/lib/auth/tokens.test.ts` — covers AUTH-01, AUTH-02 token generation and hashing
- [ ] `src/lib/auth/session.test.ts` — covers AUTH-03 session sliding window and expiry
- [ ] `src/lib/auth/rate-limit.test.ts` — covers AUTH-06 (mock Upstash Redis)
- [ ] `src/lib/dal/workspaces.test.ts` — covers WORK-01, FOLD-01
- [ ] `src/lib/dal/folders.test.ts` — covers FOLD-02
- [ ] `src/lib/dal/activity.test.ts` — covers ACTY-01
- [ ] `src/components/auth/LoginForm.test.tsx` — covers UI-05 state machine
- [ ] `src/test/setup.ts` — shared test setup (db mocking, session mocking)
- [ ] Framework install: `npm install -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom`

---

## Sources

### Primary (HIGH confidence)
- Drizzle ORM official docs (`orm.drizzle.team/docs/get-started/neon-new`) — Neon connection setup, schema syntax, drizzle.config.ts
- Resend official docs (`resend.com/docs/send-with-nextjs`) — Route handler integration, React Email template pattern
- Build spec PDF (CIS Partners, April 2026) — Data model tables, security requirements, session expiry rules
- Design system MASTER.md (project file) — Color tokens, component specs, typography

### Secondary (MEDIUM confidence)
- Next.js authentication guidance (`nextjs.org/docs/app/guides/authentication`) — DAL pattern, verifySession() pattern, middleware limitations
- Upstash ratelimit docs (`upstash.com/docs/redis/sdks/ratelimit-ts/overview`) — Sliding window algorithm, Next.js middleware integration
- iron-session GitHub (`github.com/vvo/iron-session`) — Encrypted cookie session library API

### Tertiary (LOW confidence — needs validation)
- Tailwind v4 `@theme` configuration pattern — sourced from multiple blog posts (2025); validate against `create-next-app` scaffold output in Wave 0
- CVE-2025-29927 impact scope — Vercel-hosted deployments are not affected per Vercel postmortem; validate that our Vercel deployment is not vulnerable before deprioritizing middleware hardening

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — Drizzle+Neon confirmed via official docs; Resend confirmed via official docs; iron-session confirmed via GitHub; all library versions verified
- Architecture: HIGH — DAL pattern from Next.js official guidance; custom magic link pattern well-documented; database sessions confirmed necessary by spec
- Pitfalls: MEDIUM — CVE and async params from official sources; Tailwind v4 config from multiple blogs (validate at bootstrap)
- Validation architecture: MEDIUM — Vitest is standard for Next.js 2025 but exact config needs verification at scaffold time

**Research date:** 2026-04-12
**Valid until:** 2026-05-12 (30 days — stack is stable; Tailwind v4 and Next.js 15 are not in rapid-change mode)
