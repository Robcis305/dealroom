---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: complete
stopped_at: "v1.0 complete. Phase 4 signed off through human checkpoint. 149/149 tests pass, 0 TS errors."
last_updated: "2026-04-14T15:45:00.000Z"
last_activity: 2026-04-14 -- Phase 4 (Interface & Polish) complete. v1.0 milestone shipped end-to-end.
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
**Current focus:** v1.0 shipped. Next milestone TBD (v1.1 backlog or v2 planning).

## Current Position

Phase: 4 of 4 (Interface & Polish) -- COMPLETE
Plan: 1 of 1 plan in Phase 4 complete (18 tasks); human checkpoint signed off.
Status: v1.0 milestone done. Ready to plan v1.1 or next milestone.
Last activity: 2026-04-14 -- Phase 4 shipped. Deal-list tile cards with counts + search/filter, activity feed with polling+grouping+load-more, display names everywhere, complete-profile gate on first login, 2h/4h session cap with 401 interceptor + returnTo flow, no-Client banner + status-transition guard, notification digest via Upstash QStash, version history drawer, sonner toasts, graceful mobile responsive, explicit Sign out. 149/149 tests passing.

Progress: [██████████] 100%

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

### Pending Todos

None yet.

### Blockers/Concerns

- [Research]: Multipart upload library choice (lib-storage vs. Uppy) -- not adopted in v1; plain XHR + presigned PUT used instead. Revisit if >500MB uploads become a requirement.
- [v1 limitation]: Presigned download URLs issued within 15-minute window remain valid after access is revoked. Documented trade-off; revisit if threat model tightens.
- [v1 limitation]: Activity feed actor names in the daily digest email use placeholder "Someone" — queue rows don't capture actor at enqueue time. Follow-up: add actor_user_id to notification_queue and populate the name in the cron drain.
- [v1.1 backlog]: Pre-expiry session warning ("your session expires in 2 min — click to extend")
- [v1.1 backlog]: Digest email rich formatting (links, avatars)
- [v1.1 backlog]: File version restore ("make v2 the current")
- [v1.1 backlog]: Dark-mode toggle (tokens make it a one-file swap)
- [v1.1 backlog]: Per-file comments / annotations
- [v1.1 backlog]: QStash scheduled message needs to be created in the Upstash dashboard before digest actually fires in production (route + verification already wired)
- [Production readiness]: AWS credentials currently in .env.local are dev-scoped; production deploy must use a separate IAM user (cis-deal-room-prod) with keys stored in the hosting platform's secrets manager, never on-disk.
- [Production readiness]: Neon DATABASE_URL similarly must be a separate prod branch/project at deploy time.
- [Production readiness]: RESEND_API_KEY currently unset (stub mode); production must provision and set for real email delivery.
- [Production readiness]: UPSTASH_REDIS_REST_URL/TOKEN + QSTASH_* keys currently unset (stub mode); production must provision.
- [Production readiness]: NEXT_PUBLIC_APP_URL must point at the production origin for magic-link and email-embedded logo URLs to work.

## Session Continuity

Last session: 2026-04-14
Stopped at: v1.0 milestone complete. Phase 4 human checkpoint signed off. 149/149 tests passing, 0 TS errors. Ready to plan v1.1 or next milestone.
Resume file: None
