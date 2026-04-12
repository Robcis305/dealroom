# Project Research Summary

**Project:** CIS Deal Room
**Domain:** Secure B2B Document Portal / M&A Deal Room
**Researched:** 2026-04-12
**Confidence:** HIGH

## Executive Summary

CIS Deal Room is a secure, per-engagement document sharing portal for M&A advisory. It sits deliberately between ad-hoc file sharing (email, Slack, Google Drive) and enterprise virtual data rooms (Datasite, Intralinks at $15K-$100K+ per deal). The product needs to feel purpose-built for M&A -- codenames, due diligence folder structures, role-based access, audit trails -- while remaining dead simple for deal participants who join once per engagement. The competitive advantage is frictionless magic link auth, M&A-native workflows, and professional branded design at roughly 1/10th the cost of mid-market VDRs.

The recommended approach is a Next.js App Router application with custom magic link authentication (not NextAuth -- it is overcomplicated for single-provider auth and still beta for v5), Drizzle ORM on Neon PostgreSQL (serverless-first, Edge-compatible, no Prisma cold-start penalty), and direct-to-S3 file transfers via presigned URLs (files never touch the app server). The architecture follows a three-layer authorization model: middleware for session validation, route handlers for deal membership, and server actions for folder-level permission checks. This layered approach directly addresses CVE-2025-29927 (Next.js middleware bypass) and the most dangerous pitfall identified in research -- IDOR vulnerabilities in presigned URL generation.

The primary risks are security-related, not technical. The deal room stores confidential M&A documents, so authorization bypass (generating presigned URLs without checking folder-level access), magic link token replay, stale session revocation, and S3 bucket misconfiguration are all catastrophic-tier risks. Every one of these must be addressed in Phase 1, not deferred. The secondary risk is large file upload reliability (500MB limit on unreliable connections), which requires multipart upload support in Phase 2. There is a live deal in flight, which means auth and basic workspace access are the highest-leverage first delivery.

## Key Findings

### Recommended Stack

The stack is anchored by constraints from PROJECT.md (Next.js App Router, TypeScript, Tailwind CSS, PostgreSQL, AWS S3, Vercel, Resend) with strategic choices for the remaining pieces. All package versions were verified against the npm registry on 2026-04-12.

**Core technologies:**
- **Next.js 16.x (App Router):** Full-stack framework. Constraint from spec, no deviation.
- **Drizzle ORM + Neon PostgreSQL:** Serverless-first ORM with zero runtime overhead, Edge-compatible (works in middleware), SQL-native query model. Chosen over Prisma due to cold-start penalty and lack of Edge support without paid proxy. Neon chosen over Supabase because it is "just PostgreSQL" with a serverless WebSocket driver -- no vendor lock-in.
- **Custom auth (jose + nanoid + Resend):** Magic link auth in ~150 lines. JWT sessions via jose (Edge-compatible). Chosen over NextAuth v5 (still beta after 2+ years), Lucia (deprecated), and Supabase Auth (vendor lock-in).
- **AWS SDK v3 (client-s3 + s3-request-presigner):** Presigned URL pattern for upload/download. Files never transit through Vercel's 4.5MB body limit.
- **Zod 4.x:** Runtime validation for API inputs, form data, and environment variables.
- **react-dropzone:** Drag-and-drop file upload UI.

**Notable exclusions:** No component library (shadcn/ui, Radix primitives). The brand-specific dark aesthetic with CIS colors (#E10600) means customizing every component anyway. Build custom components with Tailwind. Selectively add individual Radix primitives (dialog, dropdown) only if accessibility demands it.

### Expected Features

**Must have (table stakes for professional M&A use):**
- Magic link authentication with 24-hour sessions and instant revocation
- 6-role RBAC (Admin, CIS Team, Client, Counsel, Buyer Rep, View Only) with folder-level permission matrix
- Deal workspace with codename, admin-only client name, status lifecycle
- Default 8-folder DD structure auto-created per deal
- File upload/download via presigned S3 URLs with drag-and-drop, bulk support
- File versioning and duplicate detection
- Immutable append-only activity log with per-action event capture
- Participant invitation by email with role and folder access selection
- Email notifications (invitations + upload alerts via Resend)

**Should have (differentiators vs. Box/ShareFile):**
- Branded professional dark aesthetic (Bloomberg-meets-SaaS)
- Three-panel workspace layout (folders / files / activity+participants)
- Deal-aware status lifecycle (Engagement through Closed/Archived)
- M&A-native DD folder structure out of the box
- Notification digest option (batch vs. per-file)

**Defer to v2+:**
- In-app document preview (PDF viewer) -- highest user impact but significant scope
- Q&A threads per file -- highest collaboration value, requires threading infrastructure
- Document request checklist -- powerful DD workflow feature
- Bulk download (zip) -- requires server-side zip generation
- Full-text search -- requires document indexing pipeline
- Analytics dashboard -- requires data aggregation layer
- Two-factor authentication -- magic link is sufficient for v1 trust model

### Architecture Approach

The architecture is a standard Next.js App Router application with a clear separation: the app server handles metadata, auth, and presigned URL generation while the browser communicates directly with S3 for file transfers. Authorization is enforced at three layers (middleware for session, route handlers for deal membership, server actions for folder-level permissions) -- never at only one layer. The database schema uses UUID primary keys throughout, folder access stored as a PostgreSQL UUID array on the deal_participants record, and an append-only activity log enforced at both application and database levels. The system targets ~18 API endpoints across auth, deals, folders, files, participants, and activity.

**Major components:**
1. **Auth Module** (`/lib/auth.ts`) -- Magic link generation, JWT session management, `requireAuth`/`requireDealAccess`/`requireFolderAccess` utilities used by every endpoint
2. **Permission System** (`/lib/permissions.ts`) -- Role-permission matrix mapping 6 roles to 13 permissions, folder access checks via deal_participants.folder_access UUID array
3. **S3 Integration** (`/lib/s3.ts`) -- Presigned URL generation for upload/download, two-phase upload flow (request URL, then confirm), CORS locked to portal domain
4. **Activity Logger** (`/lib/activity.ts`) -- Append-only insert function, no update/delete exposed, database rules blocking mutations, integrated into every server action as transactional side effect
5. **Email Module** (`/lib/email.ts`) -- Resend client with React Email templates for magic links, invitations, and upload notifications

### Critical Pitfalls

1. **IDOR in presigned URL generation** -- The most dangerous pitfall. API routes must enforce a three-step check (authenticate, verify deal membership, verify folder access) before generating any presigned URL. Implement as reusable `requireFolderAccess()` utility from day one. A single missed check leaks confidential M&A documents across deals.

2. **Magic link token replay** -- Tokens must be single-use via atomic consumption (`UPDATE ... WHERE consumed_at IS NULL RETURNING ...`). Store token hashes (SHA-256), not raw tokens. 15-minute expiry for links (not 24 hours -- that is session duration). Invalidate all pending tokens on successful login.

3. **Middleware-only authorization (CVE-2025-29927)** -- Next.js middleware was bypassable via crafted headers in March 2025. Middleware is a convenience layer, not a security boundary. Every API route and server component must independently verify session and authorization via `requireAuth()`.

4. **S3 bucket public exposure** -- Enable Block Public Access at the account level. Use IAM credentials for presigned URLs, not bucket policies. Lock CORS to the portal domain. A single misconfiguration exposes all deal documents to the internet.

5. **Session revocation failure** -- Pure JWTs are stateless; revoking a participant in the database does not affect their active token. Either use database-backed sessions, or keep JWT lifetime short (15 min) with refresh flow. The `requireDealAccess` check must query `revoked_at IS NULL` on every request -- never cache permissions at deal room scale.

## Implications for Roadmap

Based on the dependency chain (Auth --> RBAC --> Folder Permissions --> File Operations), architecture patterns, and the live-deal urgency noted in PROJECT.md, the following phase structure is recommended:

### Phase 1: Foundation + Auth + Deal Structure
**Rationale:** Everything depends on authentication and the deal/folder data model. The live deal needs workspace access as the first deliverable. Security patterns (requireAuth, requireDealAccess, requireFolderAccess) must be established here so every subsequent phase inherits correct authorization.
**Delivers:** Login flow, deal creation with default folders, basic three-panel layout shell, database schema + migrations, S3 bucket configuration with security settings.
**Addresses:** Magic link auth, session management, deal CRUD, folder CRUD, default folder auto-creation, RBAC middleware, basic UI shell.
**Avoids:** IDOR (establishes authorization utilities), magic link replay (atomic token consumption), middleware-only auth (defense-in-depth from day one), S3 exposure (correct bucket config from start), client name leakage (role-filtered API responses from first endpoint).

### Phase 2: File Operations
**Rationale:** File upload/download is the core value proposition. Depends on deals, folders, and permissions from Phase 1. Presigned URL flow is the most security-sensitive code path and must be built with all authorization checks in place.
**Delivers:** Presigned URL upload with two-phase confirmation, presigned URL download with 302 redirect, file listing per folder, drag-and-drop upload UI with progress indicator, file versioning, duplicate detection.
**Uses:** AWS SDK v3 (client-s3, s3-request-presigner, lib-storage), react-dropzone, Zod for upload validation.
**Avoids:** Presigned upload without type/size constraints (server-side validation), activity log gaps (two-phase logging), file versioning race conditions (UUID S3 keys + unique constraint), large file failure (multipart upload for files >50MB).

### Phase 3: Collaboration + Participant Management
**Rationale:** The system works for a single admin after Phases 1-2 (create deal, upload files). Adding participants unlocks the multi-user collaboration that makes this a deal room. Invitation flow requires the permission system and email integration.
**Delivers:** Participant invitation by email with role + folder access, folder access control per participant, access revocation with immediate session invalidation, participant list UI.
**Uses:** Resend + React Email for invitation emails, deal_participants with folder_access array.
**Avoids:** Session revocation failure (database-backed permission checks on every request), permission cache staleness (always-query pattern, never cache at this scale).

### Phase 4: Activity + Notifications + Polish
**Rationale:** Activity logging is being written to the database from Phase 1 onward (integrated into every mutation). This phase builds the UI to surface it and adds email notifications. Polish items (search, responsive design, deal list) round out the product.
**Delivers:** Activity feed panel UI (paginated), email notifications for file uploads, search/filter within folders, responsive collapse to single-column, deal list home screen with metadata cards, deal status lifecycle badges.
**Uses:** Resend for upload notification emails, date-fns for timestamp formatting, sonner for toast notifications.

### Phase 5: Hardening + Edge Cases
**Rationale:** Production readiness. Rate limiting, error handling, orphan file cleanup, and security hardening that is important but not blocking for initial use with a small trusted user base.
**Delivers:** Rate limiting on auth endpoints (Upstash or Vercel WAF), CSP headers, S3 lifecycle policies for failed uploads, orphan file reconciliation job, comprehensive error handling, loading/empty states.
**Uses:** @upstash/ratelimit (if needed), Vercel Cron for cleanup jobs.

### Phase Ordering Rationale

- Auth first because every endpoint requires it. The `requireAuth`/`requireDealAccess`/`requireFolderAccess` pattern must exist before any data endpoint is built.
- Deals + Folders in Phase 1 (not Phase 2) because files belong to folders which belong to deals. The data model must exist before file operations.
- Files before Participants because a single admin uploading files to a deal is more valuable sooner than an empty deal room with participants. The live deal can start receiving documents with just admin access.
- Activity logging writes are embedded from Phase 1 even though the Activity UI is Phase 4. The append-only log captures events from day one; the UI to view them comes later.
- Hardening last because the initial user base is small and trusted (CIS Partners + their clients). Rate limiting and advanced security hardening are important but not blocking for internal-first launch.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 2 (File Operations):** Multipart upload implementation with progress tracking and resume. The presigned URL + multipart pattern has many edge cases (CORS, content-type matching, part retry). Research the exact client-side multipart flow before implementation.
- **Phase 3 (Collaboration):** Session invalidation strategy needs a firm decision -- database-backed sessions vs. short-lived JWT with refresh. This affects the auth module from Phase 1, so the decision should be made during Phase 1 planning even though the feature lands in Phase 3.

Phases with standard patterns (skip deep research):
- **Phase 1 (Auth):** Magic link auth with JWT is a well-documented pattern. jose + nanoid + Resend is straightforward.
- **Phase 4 (Activity + Notifications):** Paginated activity feed and transactional email are standard patterns. No novel complexity.
- **Phase 5 (Hardening):** Rate limiting, CSP headers, and cron jobs are well-documented for Vercel + Next.js.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All versions verified via npm registry. Next.js 16, Drizzle 0.45, jose 6.2, Zod 4.3 all stable. Only MEDIUM-confidence item is next-safe-action (convenience, not essential). |
| Features | HIGH (CIS-specific), MEDIUM (competitive) | Feature requirements come directly from build spec and PROJECT.md. Competitive landscape comparison is based on training data (products may have evolved). |
| Architecture | HIGH | S3 presigned URL patterns verified via AWS docs. Database schema, authorization model, and API surface area are well-defined. Auth.js v5 API should be verified if ever considering migration. |
| Pitfalls | HIGH | Security pitfalls (IDOR, token replay, CVE-2025-29927, S3 exposure) are well-documented with specific prevention patterns. AWS S3 docs verified. |

**Overall confidence:** HIGH

### Gaps to Address

- **Session invalidation strategy:** Research recommends database-backed permission checks on every request (not pure JWT), but the exact implementation (database sessions table vs. short-lived JWT + refresh + always-query permissions) needs a firm decision during Phase 1 planning. This is the most consequential architectural decision.
- **Multipart upload client-side library:** STACK.md recommends `@aws-sdk/lib-storage` but PITFALLS.md mentions `@uppy/aws-s3-multipart` and `evaporate.js` for client-side multipart with progress/resume. Evaluate which approach during Phase 2 planning.
- **Resend free tier limits:** 100 emails/day on free tier. Monitor during initial use. If bulk file uploads trigger per-file notifications to multiple participants, this could be hit quickly. Implement notification batching or upgrade plan early.
- **Neon vs. Supabase final decision:** Research recommends Neon, but PROJECT.md lists both. Make final decision during Phase 1 setup. Neon is recommended for serverless driver simplicity and lack of vendor lock-in.
- **next-safe-action adoption:** Marked MEDIUM confidence in STACK.md. Evaluate during Phase 1 whether the type-safe server action wrapper adds enough value over manual Zod validation in server actions. Not blocking.

## Sources

### Primary (HIGH confidence)
- CIS Deal Room Build Specification (cis-deal-room-build-spec.pdf) -- full product requirements
- PROJECT.md -- validated requirements and constraints
- Design system MASTER.md -- component specs and visual direction
- npm registry -- all package versions verified 2026-04-12
- AWS S3 Presigned URL Documentation (verified via official docs)
- AWS S3 Presigned Upload Documentation (verified via official docs)
- CVE-2025-29927 -- Next.js middleware bypass (confirmed, well-documented)

### Secondary (MEDIUM confidence)
- Competitive landscape (Datasite, Intralinks, Firmex, Box, ShareFile) -- training data, products may have evolved
- OWASP Forgot Password Cheat Sheet and IDOR Prevention guidelines -- training data, well-established patterns
- Auth.js v5 / NextAuth.js current API -- verify during implementation if ever considering
- Next.js 16 middleware API specifics -- verify current patterns during implementation

### Tertiary (LOW confidence)
- Resend pricing tiers -- may have changed since training cutoff, verify current plans
- Neon free tier limits (0.5 GB) -- verify current offering

---
*Research completed: 2026-04-12*
*Ready for roadmap: yes*
