---
phase: 01-foundation
plan: "01"
subsystem: database
tags: [nextjs, drizzle, postgresql, neon, typescript, vitest, upstash, iron-session]

# Dependency graph
requires: []
provides:
  - Next.js 15 App Router project scaffolded with TypeScript strict mode
  - Complete 8-table Drizzle schema (users, sessions, magicLinkTokens, workspaces, workspaceParticipants, folders, folderAccess, activityLogs)
  - Auth primitives: generateToken(), hashToken(), timingSafeTokenCompare(), createSession(), getSession(), destroySession(), setSessionCookie()
  - Rate limiter instances: authSendLimiter (5/email/15min), authVerifyLimiter (10/IP/15min)
  - Shared TypeScript types: Session, WorkspaceStatus, CisAdvisorySide, ParticipantRole, ActivityAction
  - Wave 0 test stubs: 9 test files, 36 failing assertions (RED state confirmed)
affects:
  - 01-02 (magic link API routes and login UI)
  - 01-03 (workspace shell and deal list)
  - 02-01 (S3 file operations inherit session and schema)
  - All subsequent phases (schema types and auth contracts)

# Tech tracking
tech-stack:
  added:
    - next@15
    - drizzle-orm@0.40+
    - drizzle-kit@0.30+
    - "@neondatabase/serverless"
    - iron-session@8
    - "@upstash/ratelimit"
    - "@upstash/redis"
    - resend
    - lucide-react
    - clsx
    - tailwind-merge
    - zod
    - "@react-email/components"
    - "@aws-sdk/client-s3"
    - "@aws-sdk/s3-request-presigner"
    - vitest
    - "@vitejs/plugin-react"
    - "@testing-library/react"
    - "@testing-library/jest-dom"
    - jsdom
  patterns:
    - Database sessions (not JWT) for admin-revocable auth
    - Drizzle uuid().primaryKey().defaultRandom() for all UUID PKs
    - activityLogs append-only (no updatedAt column — immutability contract)
    - Wave 0 TDD: scaffold stubs to RED before implementation
    - vitest globals: true with jsdom environment for component testing

key-files:
  created:
    - cis-deal-room/src/db/schema.ts
    - cis-deal-room/src/db/index.ts
    - cis-deal-room/src/types/index.ts
    - cis-deal-room/src/lib/auth/tokens.ts
    - cis-deal-room/src/lib/auth/session.ts
    - cis-deal-room/src/lib/auth/rate-limit.ts
    - cis-deal-room/drizzle.config.ts
    - cis-deal-room/.env.example
    - cis-deal-room/vitest.config.ts
    - cis-deal-room/src/test/setup.ts
    - cis-deal-room/src/lib/auth/tokens.test.ts
    - cis-deal-room/src/lib/auth/session.test.ts
    - cis-deal-room/src/lib/auth/rate-limit.test.ts
    - cis-deal-room/src/lib/dal/workspaces.test.ts
    - cis-deal-room/src/lib/dal/folders.test.ts
    - cis-deal-room/src/lib/dal/activity.test.ts
    - cis-deal-room/src/components/auth/LoginForm.test.tsx
    - cis-deal-room/src/app/auth/verify/page.test.tsx
    - cis-deal-room/src/app/api/auth/verify/route.test.ts
  modified:
    - cis-deal-room/tsconfig.json (added vitest/globals types)

key-decisions:
  - "Database sessions over JWT: iron-session cookie holds sessionId → DB sessions table for admin revocability (AUTH-04)"
  - "Neon PostgreSQL via @neondatabase/serverless: native Drizzle integration, edge-compatible, cleaner than Supabase for custom auth"
  - "activityLogs table has no updatedAt: append-only immutability contract — logs are never modified after insert"
  - "Cookie name: cis_session — httpOnly, SameSite=Lax, Secure in production"
  - "SHA-256 via Node.js crypto.createHash: only hash stored in DB, raw token only in magic link URL"
  - "timingSafeTokenCompare uses crypto.timingSafeEqual with hex Buffer for constant-time comparison"
  - "Wave 0 test stub approach: 36 failing assertions across 9 files confirm test infrastructure is wired correctly before implementation"

patterns-established:
  - "Pattern: All UUID primary keys use uuid().primaryKey().defaultRandom() — never text('id')"
  - "Pattern: activityLogs append-only — no updatedAt column anywhere in that table"
  - "Pattern: Auth primitives in src/lib/auth/ (tokens, session, rate-limit) — no third-party auth library"
  - "Pattern: vitest globals:true with jsdom + @testing-library setup via src/test/setup.ts"
  - "Pattern: DB mock via vi.mock('@/db') in test setup — tests never touch real database"

requirements-completed:
  - AUTH-01
  - AUTH-02
  - AUTH-03
  - AUTH-06

# Metrics
duration: 5min
completed: 2026-04-12
---

# Phase 01 Plan 01: Bootstrap and Database Schema Summary

**Next.js 15 + Drizzle ORM project bootstrapped with 8-table PostgreSQL schema, SHA-256 token auth primitives, Upstash rate limiters, and 9 Wave 0 test stubs in RED state**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-04-12T20:24:24Z
- **Completed:** 2026-04-12T20:29:03Z
- **Tasks:** 2
- **Files created:** 30

## Accomplishments

- Bootstrapped Next.js 15 App Router project with TypeScript strict mode, Tailwind CSS, and all Phase 1 dependencies installed
- Defined complete 8-table Drizzle schema with correct enum types, UUID PKs, foreign keys, and append-only activityLogs
- Implemented auth primitives: token generation (64-char hex), SHA-256 hashing, timing-safe comparison, 24h sliding-window database sessions, Upstash rate limiters
- Scaffolded all 9 test stub files to confirmed RED state (36 failing assertions — Wave 0 complete)

## Task Commits

Each task was committed atomically:

1. **Task 1: Bootstrap Next.js project and define complete database schema** - `14a0567` (feat)
2. **Task 2: Implement auth primitives and scaffold Wave 0 test stubs to RED** - `6f1c0d4` (feat)

## Files Created/Modified

- `cis-deal-room/src/db/schema.ts` - All 8 Drizzle table definitions with enums (workspaceStatus, cisAdvisorySide, participantRole, activityAction, activityTargetType)
- `cis-deal-room/src/db/index.ts` - Neon serverless Drizzle singleton
- `cis-deal-room/src/types/index.ts` - Shared TypeScript types (Session, WorkspaceStatus, CisAdvisorySide, ParticipantRole, ActivityAction, ActivityTargetType)
- `cis-deal-room/drizzle.config.ts` - Drizzle kit config pointing to schema and migrations
- `cis-deal-room/.env.example` - All required env vars including AWS S3 vars
- `cis-deal-room/src/lib/auth/tokens.ts` - generateToken(), hashToken(), timingSafeTokenCompare()
- `cis-deal-room/src/lib/auth/session.ts` - createSession(), getSession() (24h sliding window), destroySession(), setSessionCookie()
- `cis-deal-room/src/lib/auth/rate-limit.ts` - authSendLimiter, authVerifyLimiter (Upstash Redis)
- `cis-deal-room/vitest.config.ts` - Vitest config with jsdom + react plugin + @ alias
- `cis-deal-room/src/test/setup.ts` - @testing-library/jest-dom import + db/iron-session mocks
- `cis-deal-room/src/lib/auth/tokens.test.ts` - Wave 0 stub (6 failing assertions)
- `cis-deal-room/src/lib/auth/session.test.ts` - Wave 0 stub (6 failing assertions)
- `cis-deal-room/src/lib/auth/rate-limit.test.ts` - Wave 0 stub (4 failing assertions)
- `cis-deal-room/src/lib/dal/workspaces.test.ts` - Wave 0 stub (5 failing assertions)
- `cis-deal-room/src/lib/dal/folders.test.ts` - Wave 0 stub (4 failing assertions)
- `cis-deal-room/src/lib/dal/activity.test.ts` - Wave 0 stub (3 failing assertions)
- `cis-deal-room/src/components/auth/LoginForm.test.tsx` - Wave 0 stub (3 failing assertions)
- `cis-deal-room/src/app/auth/verify/page.test.tsx` - Wave 0 stub (3 failing assertions)
- `cis-deal-room/src/app/api/auth/verify/route.test.ts` - Wave 0 stub (2 failing assertions for AUTH-02 expired/used behaviors)
- `cis-deal-room/tsconfig.json` - Added vitest/globals types for TypeScript to recognize vi.* globals

## Decisions Made

- **Database sessions over JWT:** iron-session stores only sessionId in encrypted cookie; actual session lives in DB sessions table. Required for AUTH-04 (admin revocation) — stateless JWT cannot be invalidated.
- **Neon PostgreSQL:** Selected over Supabase because this project uses custom auth (no Supabase Auth needed); Neon's native Drizzle + Vercel story is cleaner.
- **Cookie name `cis_session`:** httpOnly, SameSite=Lax, Secure in production — cookie manually set via Set-Cookie header in setSessionCookie() rather than using iron-session's getIronSession API (which requires request/response context pairing).
- **activityLogs has no updatedAt:** Enforces append-only immutability contract at the schema level.
- **vitest/globals added to tsconfig.json:** Required for TypeScript to recognize vi.mock(), vi.fn() globals from the test setup file without explicit imports.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Added `"types": ["vitest/globals"]` to tsconfig.json**
- **Found during:** Task 2 (vitest config and test setup)
- **Issue:** `npx tsc --noEmit` reported TS2304 "Cannot find name 'vi'" in src/test/setup.ts because vitest globals weren't declared in TypeScript scope
- **Fix:** Added `"types": ["vitest/globals"]` to tsconfig.json compilerOptions
- **Files modified:** cis-deal-room/tsconfig.json
- **Verification:** `npx tsc --noEmit` exits 0 after fix
- **Committed in:** `6f1c0d4` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 TypeScript type resolution bug)
**Impact on plan:** Minor fix necessary for TypeScript correctness. No scope creep.

## Issues Encountered

None — all planned work proceeded as expected after the tsconfig vitest globals fix.

## User Setup Required

**External services require manual configuration before running the app:**

1. **Neon PostgreSQL** — Create a Neon project at neon.tech, copy the connection string to `DATABASE_URL` in `.env.local`
2. **Upstash Redis** — Create a Redis database at upstash.com, copy REST URL and token to `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`
3. **Resend** — Create an account at resend.com, get API key for `RESEND_API_KEY`
4. **Iron Session Secret** — Generate with `openssl rand -base64 32` and set as `IRON_SESSION_SECRET` (min 32 chars)
5. **AWS S3** — Configure bucket and IAM credentials for Phase 2 file operations (not needed until Plan 02-01)

## Next Phase Readiness

- Plan 01-02 can begin immediately — schema.ts exports all required table definitions, auth lib exports all required function signatures
- All Wave 0 test stubs are wired and will receive real implementations in Plan 01-02 (auth routes, login form)
- Plan 01-03 (workspace shell) depends on 01-02 completing first (session management needed for auth-gated layouts)

---
*Phase: 01-foundation*
*Completed: 2026-04-12*
