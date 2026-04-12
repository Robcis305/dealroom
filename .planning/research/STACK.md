# Technology Stack

**Project:** CIS Deal Room
**Researched:** 2026-04-12
**Overall Confidence:** HIGH (all versions verified via npm registry; recommendations based on strong ecosystem knowledge)

## Constraints (from PROJECT.md -- non-negotiable)

These are decided. Not up for debate:

| Technology | Version | Purpose |
|------------|---------|---------|
| Next.js (App Router) | 16.x | Full-stack framework |
| TypeScript | 5.x | Type safety |
| Tailwind CSS | 4.x | Styling |
| PostgreSQL | 15+ | Primary database |
| AWS S3 | -- | File storage with AES-256 SSE |
| Vercel | -- | Hosting (frontend + API routes) |
| Resend | -- | Email delivery (magic links + notifications) |

## Recommended Stack

### Authentication: Custom Magic Link (NOT NextAuth)

| Technology | Version | Purpose | Confidence |
|------------|---------|---------|------------|
| `resend` | 6.10.0 | Send magic link emails | HIGH |
| `jose` | 6.2.2 | JWT creation/verification for session tokens | HIGH |
| `nanoid` | 5.1.7 | Generate secure magic link tokens | HIGH |

**Why custom auth instead of NextAuth/Auth.js:**

1. **NextAuth v5 is still in beta** (v5.0.0-beta.30 as of Oct 2025). The stable v4.24.13 does not natively support App Router middleware patterns. Using a beta dependency for a security-critical path in a production deal room is a bad trade.

2. **Magic-link-only auth is simple.** The entire flow is: generate token, store in DB, email link, verify token, create session JWT. This is ~150 lines of code. NextAuth adds massive abstraction overhead (OAuth providers, CSRF tokens, callback URLs, adapter complexity) for a feature set we will never use.

3. **NextAuth's email provider requires nodemailer.** The project already uses Resend (which has its own SDK). NextAuth forces a nodemailer shim to wrap Resend, adding unnecessary indirection. Custom auth calls `resend.emails.send()` directly.

4. **Session control is simpler.** PROJECT.md specifies 24-hour sessions. With custom JWT via `jose`, this is one `expirationTime` parameter. NextAuth's session management involves database sessions vs JWT sessions, refresh token rotation, and callback hooks -- all unnecessary complexity for a single auth method.

5. **Lucia (the other popular lightweight option) is deprecated.** npm marks it as deprecated with a migration notice. Not viable.

**The pattern:**
- API route `/api/auth/magic-link` -- accepts email, generates token (nanoid), stores in DB with expiry, sends via Resend
- API route `/api/auth/verify` -- validates token, creates JWT session cookie via `jose`
- Middleware `middleware.ts` -- checks JWT on every request, redirects unauthenticated users
- Session cookie: HttpOnly, Secure, SameSite=Lax, 24-hour expiry

**What NOT to use:**
| Library | Why Not |
|---------|---------|
| `next-auth` (v4) | Does not support App Router natively. Pages Router patterns only. |
| `next-auth` (v5 beta) | Still beta after 2+ years. Too risky for production security layer. |
| `lucia` | Officially deprecated. |
| `@supabase/auth` | Locks you into Supabase ecosystem. We want DB flexibility. |
| `passport` | Express-era library. Does not fit Next.js App Router model. |

---

### Database ORM: Drizzle ORM (NOT Prisma)

| Technology | Version | Purpose | Confidence |
|------------|---------|---------|------------|
| `drizzle-orm` | 0.45.2 | Type-safe SQL ORM | HIGH |
| `drizzle-kit` | 0.31.10 | Schema migrations and studio | HIGH |
| `@neondatabase/serverless` | 1.0.2 | PostgreSQL driver (if Neon) | HIGH |
| `postgres` | 3.4.9 | PostgreSQL driver (if Supabase/standard PG) | HIGH |

**Why Drizzle over Prisma:**

1. **Serverless-first.** Drizzle has zero runtime overhead -- it generates SQL at build time. Prisma requires a query engine binary (~15MB) that must cold-start on each serverless function invocation. On Vercel, this means slower cold starts on every API route.

2. **Edge Runtime compatible.** Drizzle works in Next.js middleware (Edge Runtime) out of the box. Prisma's query engine does not run on Edge -- you would need `@prisma/client/edge` plus Prisma Accelerate (a paid proxy service). Since our middleware needs to validate sessions on every request, Edge compatibility matters.

3. **SQL-native.** Drizzle schemas are TypeScript code that maps directly to SQL. The mental model is "TypeScript-flavored SQL" rather than "learn Prisma's query language." For a deal room with specific queries (activity logs, permission checks, folder listings), writing precise SQL is an advantage.

4. **Smaller bundle.** Drizzle adds ~50KB to the bundle. Prisma's client + engine is significantly larger. On Vercel's serverless functions with 50MB limit, this matters when bundling AWS SDK alongside it.

5. **Migration story is solid now.** Drizzle Kit 0.31.x has stable `drizzle-kit push` (dev) and `drizzle-kit generate` + `drizzle-kit migrate` (production). This was a weakness in early Drizzle; it is no longer a concern.

**Where Prisma would win (but does not matter here):**
- Prisma Studio is more polished (but Drizzle Studio exists and is adequate)
- Prisma has a larger community (but Drizzle's community is mature enough)
- Prisma's relation queries are more ergonomic for deeply nested data (but our data model is flat -- deals, folders, files, participants)

**Database provider recommendation: Neon over Supabase.**

PROJECT.md lists "Supabase or Neon" -- use **Neon** because:
- Neon's serverless driver (`@neondatabase/serverless`) is purpose-built for Vercel Edge/serverless
- Supabase pushes you toward their client SDK (`supabase-js`) which bundles auth, realtime, and storage features we don't need
- Neon is just PostgreSQL with a serverless WebSocket driver -- no vendor lock-in on the ORM layer
- Neon has a generous free tier (0.5 GB storage, autoscaling)
- If you later need to move to a standard PostgreSQL, changing the connection string is the only migration

---

### File Handling: AWS SDK v3

| Technology | Version | Purpose | Confidence |
|------------|---------|---------|------------|
| `@aws-sdk/client-s3` | 3.x (latest) | S3 operations (putObject, getObject, deleteObject) | HIGH |
| `@aws-sdk/s3-request-presigner` | 3.x (latest) | Generate presigned upload/download URLs | HIGH |
| `@aws-sdk/lib-storage` | 3.x (latest) | Multipart upload for files >100MB | HIGH |
| `react-dropzone` | 15.0.0 | Drag-and-drop file upload UI | HIGH |

**Presigned URL pattern for Next.js App Router:**

Upload flow:
1. Client requests presigned PUT URL from API route (`POST /api/files/upload-url`)
2. API route validates auth, generates presigned URL with `@aws-sdk/s3-request-presigner` (15-min expiry)
3. Client uploads directly to S3 using the presigned URL via `fetch()` with `PUT` method
4. Client notifies API route of completion (`POST /api/files/confirm`)
5. API route verifies file exists in S3, creates DB record, logs activity

Download flow:
1. Client requests presigned GET URL from API route (`GET /api/files/[id]/download`)
2. API route validates auth + permission, generates presigned GET URL (15-min expiry)
3. Client redirects/opens the presigned URL

**Critical gotchas for Next.js App Router + S3 presigned URLs:**

1. **Do NOT use Route Handlers with streaming for uploads.** Vercel has a 4.5MB request body limit on serverless functions. Files must go directly to S3 via presigned URLs -- never through the API route.

2. **Multipart uploads for 500MB files.** The `@aws-sdk/lib-storage` `Upload` class handles multipart automatically. For client-side, use `XMLHttpRequest` or chunked `fetch` to show progress. The presigned URL approach works for single PUT up to 5GB, so multipart is only needed if you want progress tracking on large files.

3. **CORS configuration on S3 bucket is critical.** The S3 bucket must allow PUT/GET from the portal domain. Without this, client-side uploads will fail silently with CORS errors.

4. **Content-Type must be set at presign time.** The presigned URL's Content-Type must match what the client sends. Pass the file's MIME type to the API route when requesting the presigned URL, and include it in the presigning parameters.

5. **S3 key structure recommendation:** `deals/{dealId}/folders/{folderId}/{fileId}/{filename}` -- this enables efficient prefix-based listing and bucket policies per deal.

**What NOT to use:**
| Library | Why Not |
|---------|---------|
| `aws-sdk` (v2) | Deprecated. V3 is modular and tree-shakeable. |
| `multer` / `formidable` | These parse multipart form data on the server. Files should never touch the server -- presigned URLs only. |
| `uploadthing` | Adds vendor dependency for something the AWS SDK does natively. Unnecessary abstraction. |
| `@vercel/blob` | Ties you to Vercel's storage. S3 is specified in requirements. |

---

### Email: Resend + React Email

| Technology | Version | Purpose | Confidence |
|------------|---------|---------|------------|
| `resend` | 6.10.0 | Email delivery API | HIGH |
| `@react-email/components` | 1.0.12 | Build email templates as React components | HIGH |

**Why this pairing:**
- Resend is already specified in PROJECT.md -- it is the email provider
- React Email lets you build email templates using JSX/TSX, which means they live in the same codebase and share types
- The combination handles both magic link emails and notification emails (new file uploads, deal invitations)

**Email templates needed:**
1. Magic link login email
2. Deal invitation email (new participant)
3. File upload notification email

**Gotcha:** Resend has a free tier of 100 emails/day. For a deal room with active participants, this is fine during early usage but monitor it. Paid plans start at $20/month for 5,000 emails/month.

---

### Validation & Type Safety

| Technology | Version | Purpose | Confidence |
|------------|---------|---------|------------|
| `zod` | 4.3.6 | Runtime schema validation | HIGH |
| `@t3-oss/env-nextjs` | 0.13.11 | Type-safe environment variables | HIGH |
| `next-safe-action` | 8.4.0 | Type-safe Server Actions with Zod validation | MEDIUM |

**Why Zod:** It is the standard for TypeScript runtime validation. Used to validate API request bodies, form inputs, environment variables, and S3 upload metadata. Zod 4.x is the latest major release.

**Why @t3-oss/env-nextjs:** Validates all environment variables at build time. Catches missing AWS keys, database URLs, and Resend API keys before deployment instead of at runtime. This is especially important for a deal room where a missing S3 key means silent upload failures.

**Why next-safe-action (MEDIUM confidence):** Provides type-safe Server Actions with built-in Zod validation, middleware chains, and error handling. Useful for form submissions (invite participant, create deal, rename folder). Marked MEDIUM because Server Actions can also be written manually with Zod -- the library is a convenience, not a necessity. Evaluate during Phase 1 whether the abstraction is worth it.

---

### UI Components & Utilities

| Technology | Version | Purpose | Confidence |
|------------|---------|---------|------------|
| `lucide-react` | 1.8.0 | Icon library | HIGH |
| `clsx` | 2.1.1 | Conditional class names | HIGH |
| `tailwind-merge` | 3.5.0 | Merge Tailwind classes without conflicts | HIGH |
| `sonner` | 2.0.7 | Toast notifications | HIGH |
| `date-fns` | 4.1.0 | Date formatting (activity log timestamps) | HIGH |
| `react-dropzone` | 15.0.0 | Drag-and-drop file upload zone | HIGH |
| `nanoid` | 5.1.7 | Generate unique IDs (tokens, file IDs) | HIGH |

**Why NOT a component library (shadcn/ui, Radix, etc.):**
- PROJECT.md specifies a custom branded experience with CIS Partners branding (dark aesthetic, specific colors, DM Sans font)
- A prototype already exists (`cis-deal-portal-prototype.jsx`) with established component patterns
- Adding shadcn/ui would mean customizing every component to match the brand anyway
- Build custom components with Tailwind directly -- the UI is relatively constrained (cards, tables, panels, buttons, modals)

**However, consider adding selectively:** If complex accessible components are needed (dropdown menus, dialogs, tooltips), use `@radix-ui/react-dialog`, `@radix-ui/react-dropdown-menu` etc. individually rather than a full component library. This gives accessibility without design opinions.

---

### Security Middleware & Infrastructure

| Technology | Version | Purpose | Confidence |
|------------|---------|---------|------------|
| `jose` | 6.2.2 | JWT signing/verification in Edge middleware | HIGH |
| `@upstash/ratelimit` | 2.0.8 | Rate limiting for API routes | MEDIUM |
| `@upstash/redis` | -- | Redis backend for rate limiter | MEDIUM |

**Security layers:**

1. **Middleware (Edge Runtime):** `middleware.ts` runs on every request. Validates JWT session cookie using `jose` (Edge-compatible). Redirects unauthenticated users to login. This is the primary auth gate.

2. **API Route auth checks:** Every API route handler re-validates the session and checks role-based permissions. Middleware is the first gate; route handlers are the second.

3. **Rate limiting:** Protect magic link endpoint from abuse (email bombing). `@upstash/ratelimit` with a sliding window (5 requests per 15 minutes per email) prevents this. Marked MEDIUM because an in-memory rate limiter works for single-instance dev, but Upstash is needed for production on Vercel (stateless serverless functions share no memory).

4. **CORS:** Configured via `next.config.ts` headers. Lock S3 CORS to portal domain only. Lock API routes to same-origin.

5. **CSP headers:** Set Content-Security-Policy in `next.config.ts` to prevent XSS. Important for a document portal where filenames could contain malicious strings.

**Rate limiting alternative (if Upstash is too much infrastructure):** Use Vercel's built-in WAF/rate limiting (available on Pro plan) or implement a simple token-bucket in the database. The database approach is slower but avoids adding Redis.

---

### Dev Dependencies

| Technology | Version | Purpose | Confidence |
|------------|---------|---------|------------|
| `typescript` | 5.x | Type checking | HIGH |
| `eslint` | 9.x | Linting | HIGH |
| `prettier` | 3.x | Code formatting | HIGH |
| `drizzle-kit` | 0.31.10 | Database migrations and Drizzle Studio | HIGH |

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Auth | Custom (jose + resend) | NextAuth v5 beta | Still beta; unnecessary complexity for magic-link-only |
| Auth | Custom (jose + resend) | Lucia | Deprecated |
| Auth | Custom (jose + resend) | Supabase Auth | Vendor lock-in; adds unneeded Supabase dependencies |
| ORM | Drizzle | Prisma | Slower cold starts, no Edge support without paid proxy |
| ORM | Drizzle | Kysely | Good but less ecosystem (no Studio, fewer adapters) |
| ORM | Drizzle | Raw SQL (postgres.js) | No type safety, no migrations tooling |
| DB Provider | Neon | Supabase | Supabase pushes its own SDK; Neon is just Postgres |
| File Upload | AWS SDK v3 presigned | UploadThing | Unnecessary vendor dependency |
| File Upload | AWS SDK v3 presigned | Vercel Blob | Wrong storage provider (S3 specified) |
| Email | Resend | SendGrid | Resend specified in PROJECT.md; better DX anyway |
| Email | Resend | AWS SES | More complex setup; Resend wraps SES with better API |
| Icons | lucide-react | heroicons | Both fine; lucide has more icons and consistent style |
| Toast | sonner | react-hot-toast | Sonner has better animations and App Router support |

---

## Installation

```bash
# Core framework (likely already via create-next-app)
npx create-next-app@latest cis-deal-room --typescript --tailwind --app --src-dir

# Database
npm install drizzle-orm @neondatabase/serverless
npm install -D drizzle-kit

# Authentication
npm install jose nanoid

# AWS S3
npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner @aws-sdk/lib-storage

# Email
npm install resend @react-email/components

# Validation
npm install zod @t3-oss/env-nextjs

# UI utilities
npm install clsx tailwind-merge lucide-react sonner date-fns react-dropzone

# Rate limiting (production)
npm install @upstash/ratelimit @upstash/redis
```

---

## Environment Variables

```env
# Database
DATABASE_URL=postgresql://...

# AWS S3
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-east-1
AWS_S3_BUCKET=cis-deal-room-files

# Auth
JWT_SECRET=... (generate with: openssl rand -base64 32)
MAGIC_LINK_SECRET=... (separate secret for token signing)

# Email
RESEND_API_KEY=re_...

# App
NEXT_PUBLIC_APP_URL=https://deals.cispartners.com

# Rate Limiting (production)
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
```

---

## Version Verification

All versions verified against npm registry on 2026-04-12:

| Package | Verified Version | Registry Status |
|---------|-----------------|-----------------|
| next | 16.2.3 | Latest stable |
| next-auth | 4.24.13 stable / 5.0.0-beta.30 | v5 still beta |
| drizzle-orm | 0.45.2 | Latest stable, actively developed |
| drizzle-kit | 0.31.10 | Latest stable |
| prisma | 7.7.0 | Latest stable (not recommended) |
| resend | 6.10.0 | Latest stable |
| @react-email/components | 1.0.12 | Latest stable |
| @aws-sdk/client-s3 | 3.1029.0 | Latest stable |
| @aws-sdk/s3-request-presigner | 3.1029.0 | Latest stable |
| jose | 6.2.2 | Latest stable |
| zod | 4.3.6 | Latest stable |
| react-dropzone | 15.0.0 | Latest stable |
| lucide-react | 1.8.0 | Latest stable |
| sonner | 2.0.7 | Latest stable |
| date-fns | 4.1.0 | Latest stable |
| nanoid | 5.1.7 | Latest stable |
| lucia | 3.2.2 | DEPRECATED |

## Sources

- npm registry (all versions verified via `npm view [package] version` on 2026-04-12)
- PROJECT.md constraints and requirements
- Training data knowledge of Next.js App Router patterns, AWS S3 presigned URL flows, Drizzle ORM architecture (confidence: HIGH -- these are well-established patterns, not bleeding edge)
- Note: WebSearch and WebFetch were unavailable during this research. Version numbers are verified via npm, but ecosystem trend claims rely on training data (cutoff ~May 2025). Flag any claim that seems outdated during implementation.
