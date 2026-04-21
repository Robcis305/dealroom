---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: document-preview
status: complete
stopped_at: "2026-04-16 — v1.1 deployed to https://dealroom.cispartners.co. Admin flipped for rob@cispartners.co via prod Neon SQL. Test deal room created successfully (8 default folders seeded). Upload blocked by S3 CORS on new prod bucket — stopped mid-debug."
last_updated: "2026-04-16T16:30:00.000Z"
last_activity: 2026-04-16 -- Prod deploy live. First admin provisioned. Upload flow blocked on S3 prod bucket config (CORS + possibly IAM perms + Vercel env vars pointing to new bucket).
progress:
  total_phases: 4
  completed_phases: 4
  total_plans: 9
  completed_plans: 9
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-12)

**Core value:** One organized, permission-controlled workspace per deal -- so both CIS Partners and clients always know where to find documents and exactly what happened to them.
**Current focus:** v1.1 shipped (document preview). Next milestone TBD (v1.2 polish, v2 planning, or production deploy prep).

## Current Position

Milestone: v1.1 (document preview) -- COMPLETE
Status: Merged to main via 17-commit `--no-ff` merge (785a394). Not yet pushed to origin.
Last activity: 2026-04-15 -- v1.1 shipped via superpowers subagent-driven workflow (spec + plan + 11 tasks + per-task spec/quality reviews + manual QA + final branch review). Inline preview modal for PDF/image/video/CSV/XLSX. PDF via react-pdf + pdfjs-dist (code-split, CDN worker). CSV/XLSX via SheetJS CDN build (CVE-free) with 10MB/1000-row/first-sheet guardrails. Silent 'previewed' activity log, filtered from workspace feed. presign-download route gained ?disposition=inline + Content-Type override. 188/188 tests passing.

Progress: [██████████] 100% (v1.1)

## Performance Metrics

**Velocity:**
- Total plans completed: 9 (Phase 1: 4, Phase 2: 1, Phase 3: 3, Phase 4: 1)
- Average duration: -
- Total execution time: - hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-foundation | 4 | - | - |
| 02-file-operations | 1 | - | - |
| 03-collaboration | 3 | - | - |
| 04-polish | 1 | - | - |

**Recent Trend:**
- Last 5 plans: 02 (file ops), 03-1 (backend+IDOR), 03-2 (UI+E2E), 03-5 (visual refresh), 04 (polish)

*Updated after each plan completion*
| Phase 01-foundation P01 | 5 | 2 tasks | 30 files |
| Phase 01-foundation P02 | 6 | 3 tasks | 19 files |
| Phase 01-foundation P03 | 2 | 1 tasks | 11 files |
| Phase 01-foundation P04 | 4 | 1 tasks | 9 files |
| Phase 02-file-operations | 10 tasks | 13 files | - |
| Phase 03-collaboration P1 | 15 tasks | 22 files | - |
| Phase 03-collaboration P2 | 6 tasks | 7 files | - |
| Phase 03-collaboration P5 (visual) | 11 tasks | ~20 files | - |
| Phase 04-polish | 18 tasks | ~30 files | - |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap]: 4-phase coarse structure -- Foundation, File Ops, Collaboration, Polish
- [Roadmap]: Activity logging writes enabled from Phase 1; feed UI deferred to Phase 4
- [Roadmap]: Security patterns (requireAuth, requireDealAccess, requireFolderAccess) established in Phase 1, inherited by all phases
- [Phase 01-foundation]: Database sessions over JWT: iron-session cookie holds sessionId for admin-revocable auth
- [Phase 01-foundation]: Neon PostgreSQL via @neondatabase/serverless: native Drizzle integration over Supabase
- [Phase 01-foundation]: activityLogs table has no updatedAt: append-only immutability contract at schema level
- [Phase 01-foundation]: Custom magic link auth (no Auth.js): SHA-256 hashing with timing-safe compare, ~150 lines owned code
- [Phase 01-foundation]: logActivity uses any-typed txOrDb: Drizzle PgTransaction type not assignable to typeof db; any avoids complex generics while maintaining runtime correctness at schema level
- [Phase 01-foundation]: requireDealAccess/requireFolderAccess are no-ops in Phase 1: Phase 1 routes have no participant logic; Phase 3 fills real IDOR enforcement
- [Phase 01-foundation]: DAL auth gate pattern: verifySession() called at data boundary in every protected function (post-CVE-2025-29927); middleware is UX redirect only
- [Phase 01-foundation]: VerifyPage sync over async: jsdom cannot render async Server Components — sync searchParams union type works in both test env and Next.js runtime
- [Phase 01-foundation]: Tailwind v4 @theme in globals.css with next/font CSS variable injection: next/font injects --font-sans/--font-mono variables matching @theme names for runtime override
- [Phase 01-foundation]: clsx + twMerge pattern for all UI primitive className composition: all primitives accept className prop for consumer overrides
- [Phase 01-foundation]: WorkspaceShell is use client: needs useState for selectedFolderId, status dropdown, and folder mutations
- [Phase 01-foundation]: Optimistic updates for status change and folder rename/delete with revert on API failure
- [Phase 01-foundation]: Zod v4 enum error param uses error string directly (not errorMap object)
- [Phase 02-file-operations]: Browser never touches app server for file bytes; presigned PUT (upload) / GET (download) with 15-min expiry
- [Phase 02-file-operations]: Duplicate detection pre-upload (checkDuplicate) + user confirmation → version increment in createFile
- [Phase 02-file-operations]: files table is append-only; re-uploads create new rows with version = prev+1, not UPDATEs
- [Phase 02-file-operations]: S3 stub mode when AWS_S3_BUCKET unset — all routes return fake keys/stub URLs so full upload flow is exercisable without AWS credentials
- [Phase 02-file-operations]: Zod v4 .uuid() validates variant bits (RFC 4122) — test fixtures must use real UUIDs, not "f1"/"w1" placeholders
- [Phase 02-file-operations]: Admin-only file delete; S3 DeleteObject fires before DB row delete (DAL handles DB + activity log in one unit)
- [Phase 02-file-operations]: react-dropzone for drag-and-drop; XHR used for S3 PUT to expose upload.onprogress
- [Phase 03-1 collaboration]: Invitation tokens reuse magic_link_tokens table with purpose + redirect_to columns, 3-day expiry (vs 10-min login)
- [Phase 03-1 collaboration]: Role-based permission resolver (canPerform) — no permission_level column on folder_access; view_only gets download-only, all others upload+download
- [Phase 03-1 collaboration]: Self-edit guards server-side: admin cannot demote own role or remove self (checked in DAL, not just route)
- [Phase 03-1 collaboration]: Participant removal does not touch sessions table — requireDealAccess denies on next request (sessions prove identity, participants prove authorization)
- [Phase 03-1 collaboration]: Activity enum reuses short verbs (invited/removed) with target_type disambiguating; only participant_updated + notified_batch added as new values
- [Phase 03-1 collaboration]: sendEmail() wrapper with stub-mode (console.log when RESEND_API_KEY unset); all email flows now route through it
- [Phase 03-1 collaboration]: Upload-batch notification is client-initiated — UploadModal calls POST /notify-upload-batch once after all confirms; avoids server-side debounce infra
- [Phase 03-1 collaboration]: Re-invite is idempotent — same admin POST on an already-invited user refreshes the token + updates role without duplicating the participant row
- [Phase 03-1 collaboration]: Invitation token delete on re-invite scopes to purpose='invitation' to avoid clobbering in-flight login tokens
- [Phase 03-1 integration]: DB driver switched from neon-http to neon-serverless (Pool via WebSocket) — transactions required by createWorkspace / inviteParticipant / updateParticipant
- [Phase 03-1 integration]: Upstash rate-limit gains stub mode (matches sendEmail pattern) — local dev works without Upstash credentials
- [Phase 03-1 integration]: Magic-link URL points directly to /api/auth/verify, not the error page /auth/verify — prior bug silently routed every magic link to "Invalid link"
- [Phase 03-1 integration]: Session cookie set via NextResponse.redirect().cookies.set(), not Response.redirect + headers.append — the latter throws TypeError because spec redirect responses have immutable headers
- [Phase 03-5 visual refresh]: Tailwind v4 @theme with semantic tokens (bg-surface, text-text-primary, bg-accent, etc.) — every component migrated off hardcoded hex; theme change is now a single-file swap
- [Phase 03-5 visual refresh]: Palette — pure white surfaces, near-black (#0D0D0D) text, CIS red (#E10600) reserved for CTAs and emphasis only (not general UI chrome)
- [Phase 03-5 visual refresh]: Danger token (not "error") for form/input validation styling — matches @theme --color-danger
- [Phase 03-5 visual refresh]: Logo served from /public/cis-partners-logo.svg via <Logo /> component on all surfaces; email templates use absolute URL via NEXT_PUBLIC_APP_URL
- [Phase 03-5 UX fixes]: Workspace header back-link wraps logo + ArrowLeft → /deals; folder sidebar has "Deal overview" entry that clears folder selection
- [Phase 03-5 UX fixes]: UploadModal syncs selectedFolderId on every open (useEffect on [open, initialFolderId]) — useState initializer only fires on first mount, which routed uploads to whichever folder was first opened
- [Phase 03-5 UX fixes]: UploadModal resets queue on close via useEffect on [open]; folder dropdown hides when modal opened from a folder context
- [Phase 03 integration]: Real AWS S3 live (us-east-2) — upload + download + delete all round-trip through real bucket; presign PUT drops explicit ServerSideEncryption (bucket default handles it; signing SSE would force browser to echo the matching header and 403 signature mismatches)
- [Phase 03 integration]: IAM user cis-deal-room-app scoped to PutObject/GetObject/DeleteObject on bucket/* only; no bucket-level permissions
- [Phase 04 polish]: Display names — users.first_name/last_name; /complete-profile gate enforced on first login; displayName(user) falls back to email for missing names; admin participant rows show email as muted secondary
- [Phase 04 polish]: Session policy — idle 2h (down from 24h), absolute cap 4h via new sessions.absolute_expires_at column; global fetchWithAuth 401 interceptor toasts + redirects to /login?returnTo=… ; sessionStorage returnTo survives the magic-link flow
- [Phase 04 polish]: Deal list rebuilt as DealCard tile grid — docCount/participantCount/last-activity summary computed via correlated subqueries in getWorkspacesForUser (no new API); client-side search (name+client) + status filter
- [Phase 04 polish]: ActivityFeed polls every 60s while tab visible (pauses on blur); groups consecutive same-actor/same-action rows within 10-min window; "load more" paginates 50/page
- [Phase 04 polish]: No-Client banner renders whenever activeClientCount === 0 regardless of stage; server blocks only Engagement→Active DD transition (other transitions remain open)
- [Phase 04 polish]: Notification digest via Upstash QStash — per-user opt-in toggle in UserMenu; enqueueOrSend helper routes immediate vs queue based on user.notification_digest; invitation emails always send immediately regardless of preference (link is time-sensitive)
- [Phase 04 polish]: File version history drawer — anyone with folder download access sees history and can download any version; admin can delete specific versions (reuses DELETE /api/files/[id] per-row); clicking vN chip opens the drawer
- [Phase 04 polish]: Responsive — "graceful mobile read-only": side panels hide below 1024px, modals full-screen below 768px; active deal work requires desktop; no new routes or layouts
- [Phase 04 polish]: Sonner toasts replace alert(); Toaster mounted once in (app)/layout.tsx with semantic-token style overrides
- [Phase 04 polish]: Workspace and deal-list pages marked `export const dynamic = 'force-dynamic'` to bypass Next.js 16 server-component caching that was serving stale fileCounts
- [Phase 04 polish]: Explicit Sign out — POST /api/auth/logout destroys session + clears cookie; UserMenu shared component mounts on both deal list and workspace headers
- [Phase 04 bug fix]: Versioned re-upload — presign-upload route now accepts confirmedVersioning flag to skip the duplicate short-circuit; previously the second presign on a duplicate returned no s3Key and the confirm call failed Zod validation
- [v1.1 preview]: PDF rendering via react-pdf + pdfjs-dist (code-split, worker from cdn.jsdelivr.net) — spec originally called for native iframe, but Chrome/Safari both refused cross-origin inline PDFs in iframe AND <object>. react-pdf renders to canvas, reliable cross-browser. ~1.8 MB chunk loads only on first PDF preview.
- [v1.1 preview]: CSV/XLSX via SheetJS CDN tarball (xlsx 0.20.3 from cdn.sheetjs.com) — npm-published xlsx 0.18.5 has a prototype-pollution CVE; SheetJS publishes patched community builds via their own CDN only. Installed via `npm install https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`.
- [v1.1 preview]: Guardrails — 10 MB size cap, 1,000-row render cap, first sheet only. Above cap shows "File too large" state without fetching. Above row cap shows "Showing first 1,000 of N rows" banner.
- [v1.1 preview]: presign-download route gained `?disposition=inline` query param — modal uses it, Download button and all other callers default to `attachment`. When inline, route also forces `ResponseContentType: file.mimeType` on GetObjectCommand to override any octet-stream stored on S3 so Chrome renders inline.
- [v1.1 preview]: Activity logging — new 'previewed' enum value, silent (logged to DB but filtered out of workspace feed query via `ne(action, 'previewed')`). One log per modal open, fire-and-forget from client after ready state.
- [v1.1 preview]: Eye icon placement — dedicated lucide Eye button in FileList actions column, BEFORE the Download icon. Hidden below 1024px viewport (matches Phase 4 "graceful mobile read-only" policy). Hidden on MIME types not in the preview whitelist — the icon's presence IS the signal of previewability.
- [v1.1 preview]: No prev/next file navigation, no historical-version preview, no E2E tests in v1.1 — explicitly deferred to keep scope tight.
- [v1.1 workflow]: First feature shipped via superpowers subagent-driven-development. Per-task: spec-compliance review + code-quality review before marking done. Caught a race condition in PreviewModal's useEffect (missing `aborted` guard after res.json), duplicated test mock chains vs. repo convention, and raw-hex classNames instead of Tailwind v4 @theme tokens — all fixed in-flight.

### Pending Todos

None yet.

### Blockers/Concerns

- [Research]: Multipart upload library choice (lib-storage vs. Uppy) -- not adopted in v1; plain XHR + presigned PUT used instead. Revisit if >500MB uploads become a requirement.
- [v1 limitation]: Presigned download URLs issued within 15-minute window remain valid after access is revoked. Documented trade-off; revisit if threat model tightens.
- [v1 limitation]: Activity feed actor names in the daily digest email use placeholder "Someone" — queue rows don't capture actor at enqueue time. Follow-up: add actor_user_id to notification_queue and populate the name in the cron drain.
- [v1.2 backlog]: Pre-expiry session warning ("your session expires in 2 min — click to extend")
- [v1.2 backlog]: Digest email rich formatting (links, avatars)
- [v1.2 backlog]: File version restore ("make v2 the current")
- [v1.2 backlog]: Dark-mode toggle (tokens make it a one-file swap)
- [v1.2 backlog]: Per-file comments / annotations
- [v1.2 backlog]: **Due-diligence checklist / request tracker** — per-workspace list of outstanding vs. received items with status, timestamps, optional linked file. Recommended shape: structured table (new `requests` table: id, workspace_id, description, status, requested_at, received_at, assigned_to?, linked_file_id?) rendered as a third tab in RightPanel alongside Activity and Participants. Admin edit + participant read-only. Auditable via activity log.
- [v1.2 backlog]: QStash scheduled message needs to be created in the Upstash dashboard before digest actually fires in production (route + verification already wired)
- [v1.2 backlog]: **Preview — Playwright E2E tests** — unit/component tests mock react-pdf, pdfjs, and xlsx at module boundary. Real-browser verification (PDF actually renders, jsdelivr worker loads, 10 MB XLSX hits the guard, DOCX shows no eye icon) is the first v1.2 ticket.
- [v1.2 backlog]: **Preview — self-host the pdfjs worker** under `/public/` instead of loading from cdn.jsdelivr.net at runtime. CSP hardening; removes a third-party runtime dependency.
- [v1.2 backlog]: **Preview — DOCX/PPTX (Slice C)** — either a paid viewer (Adobe Embed, Syncfusion) or server-side LibreOffice→PDF conversion. Defer until usage data justifies the viewer cost.
- [v1.2 backlog]: **Preview — historical-version preview** from the version drawer (currently download-only in the drawer). Add eye-icon per version row.
- [v1.2 backlog]: **Preview — empty-sheet state** in SheetPreview — when `headers.length === 0`, render a "No data in this sheet" message instead of a blank table (currently just renders empty `<thead>` and `<tbody>`).
- [v1.2 backlog]: **Preview — MIME sanitization at upload** — presign-download's `ResponseContentType: file.mimeType` trusts the DB-stored MIME; a malicious upload could declare `text/html` and force inline HTML rendering. Pre-existing trust issue; preview amplifies slightly. Add server-side sniff + whitelist at upload time.
- [Production readiness]: AWS credentials currently in .env.local are dev-scoped; production deploy must use a separate IAM user (cis-deal-room-prod) with keys stored in the hosting platform's secrets manager, never on-disk.
- [Production readiness]: Neon DATABASE_URL similarly must be a separate prod branch/project at deploy time.
- [Production readiness]: RESEND_API_KEY currently unset (stub mode); production must provision and set for real email delivery.
- [Production readiness]: UPSTASH_REDIS_REST_URL/TOKEN + QSTASH_* keys currently unset (stub mode); production must provision.
- [Production readiness]: NEXT_PUBLIC_APP_URL must point at the production origin for magic-link and email-embedded logo URLs to work.

## Session Continuity

Last session: 2026-04-16
Stopped at: Prod deploy is live at https://dealroom.cispartners.co. Auth works end-to-end (magic link + sign in). Admin gate wired — rob@cispartners.co promoted via `INSERT INTO users (email, is_admin) VALUES ('rob@cispartners.co', true) ON CONFLICT (email) DO UPDATE SET is_admin = true;` run in Neon prod SQL editor. First test deal room created successfully (8 default folders seeded, redirect to /workspace/[id] worked). Upload flow broken — CORS blocked on direct presigned PUT to S3.

**Next session — resume here (upload debug):**

Rob created a new S3 bucket for prod (name TBC — S3 names can't have underscores; confirmed earlier message showed "deal_room_prod" but real name likely "deal-room-prod" or similar). Three checks in order:
1. **Vercel env vars** — confirm `AWS_S3_BUCKET` points to the new prod bucket name (not the dev bucket). `AWS_REGION` matches bucket region. `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` belong to an IAM user with access to the new bucket. Any change here requires redeploy.
2. **IAM policy** — dev IAM user (cis-deal-room-app) is scoped to `cis-deal-room-dev/*` only. For prod, either update its policy to include the new bucket ARN, OR (recommended per deploy checklist) create a new `cis-deal-room-prod` IAM user with policy scoped to the prod bucket.
3. **CORS on the new bucket** — needs `AllowedOrigins: ["https://dealroom.cispartners.co"]`, `AllowedMethods: ["PUT", "GET", "HEAD"]`, `AllowedHeaders: ["*"]`, `ExposeHeaders: ["ETag"]`. Configured in AWS Console → S3 → bucket → Permissions → CORS.

CORS error in browser console was: "Access to XMLHttpRequest at '...s3...amazonaws.com...' from origin 'https://dealroom.cispartners.co' has been blocked by CORS policy."

**Open questions to ask Rob on resume:**
- Exact bucket name?
- Did he update Vercel `AWS_S3_BUCKET` + redeploy?
- New IAM user for prod or updated dev policy?

Additional deploy checklist items still pending (from last session):
- Resend: prod key + verify clean sender domain (currently likely still using dev config)
- Upstash Redis + QStash: separate prod keys
- Rotate all dev keys that touched .env.local
- QStash scheduled message for /api/cron/digest (create once in Upstash dashboard post-deploy)

Previous session state preserved below for reference:

---

2026-04-15 session: v1.1 shipped + pushed to origin (785a394 + 8b59515 + e7d86f3). 188/188 tests passing. Dev environment upgraded from fully-stubbed to real integrations: Resend live (from `noreply@website.cispartners.co`; `cispartners.co` root is NOT verified, only `website.cispartners.co`), Upstash Redis live, QStash signing keys in place (digest cron endpoint ready to verify signatures, no scheduled message yet). send.ts sender domain fixed (.co not .com). Email flow tested end-to-end against Rob's real inbox.

**Goal for next session (2026-04-16): deploy to production** so first users can hit it.

**Deploy prep checklist (run through in this order):**
1. **Prod AWS IAM user** — create `cis-deal-room-prod` with same scoped policy as dev (`s3:PutObject`, `s3:GetObject`, `s3:DeleteObject` on bucket/* only, no bucket-level). Store creds in the deploy platform's secrets manager, never on disk.
2. **Prod S3 bucket** — either reuse `cis-deal-room-dev` or create `cis-deal-room-prod`. Update CORS to allow the production origin (currently allows only `http://localhost:3000`).
3. **Prod Neon branch/project** — create a separate Neon project or branch for prod data isolation. Run `drizzle-kit migrate` against it once to apply all 4 migrations (0000 → 0003).
4. **Prod Resend** — either use the same key (if Resend workspace is shared) or generate a separate prod API key. **Verify the root `cispartners.co` domain** (or pick a clean subdomain like `mail.cispartners.co`) so the from-address reads cleaner than `noreply@website.cispartners.co`.
5. **Prod Upstash Redis + QStash** — create prod database + enable QStash for prod account. Separate keys from dev.
6. **`NEXT_PUBLIC_APP_URL`** — point at the production origin (e.g. `https://dealroom.cispartners.co`).
7. **Choose deploy target** — Vercel recommended (zero config for Next.js 16 + Turbopack). Alternatives: Railway, Fly, self-hosted.
8. **QStash scheduled message** — create once in Upstash dashboard pointing at `https://<prod-origin>/api/cron/digest` on daily cron (e.g. 8am ET). Only needed after deploy.
9. **Rotate all dev keys** that touched this session's `.env.local` (Resend, Upstash Redis, QStash) — they're in the transcript.

**Known blockers for deploy:**
- pdfjs worker loads from `cdn.jsdelivr.net` at runtime. If the deploy platform enforces a strict CSP, self-host the worker under `/public/` first (v1.2 backlog — elevate if CSP bites).
- No Playwright E2E tests (v1.2 backlog). Manual QA sufficient for first launch.

**Resume file:** None

## v1.2 Backlog (deferred — after deploy)

- Playwright E2E tests for the preview flow
- Self-host pdfjs worker under `/public/` (CSP hardening)
- DOCX/PPTX preview (Slice C)
- Historical-version preview from the version drawer
- Empty-sheet state message in SheetPreview
- MIME sanitization at upload time
- Pre-expiry session warning
- Digest email rich formatting
- File version restore ("make v2 the current")
- Dark-mode toggle
- Per-file comments / annotations
- DD checklist / request tracker
