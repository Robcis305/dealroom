# Phase 3 — Collaboration — Summary

**Status:** Complete
**Shipped:** 2026-04-14
**Plans executed:** 3 (3.1 backend, 3.2 UI, 3.5 visual refresh)
**Tests:** 129 passing · 0 TS errors
**Human checkpoint:** signed off ([cis-deal-room/docs/phase-3-checkpoint.md](../../../cis-deal-room/docs/phase-3-checkpoint.md))

## What Phase 3 delivered

The single-admin workspace built through Phases 1–2 is now a multi-user deal room. Admins can invite participants by email with per-folder permissions; invitees land directly in their workspace via a 3-day magic link; role-based IDOR enforcement is real at every API boundary; and all file operations trigger batched upload-notification emails to eligible participants. Real AWS S3 is wired end-to-end for file storage, with a preserved stub-mode so local dev still works without credentials.

### Success criteria — all met

1. ✅ Admin invites a participant by email with role and per-folder access checkboxes via the InviteModal (with contextual "Buyer Rep"/"Seller Rep" based on the workspace's CIS advisory side).
2. ✅ Invitee clicks the magic link, is authenticated, and lands directly in the workspace seeing only their permitted folders with role-appropriate capabilities.
3. ✅ Admin can edit a participant's role and folder access, remove a participant; removal takes effect on the next request (no session surgery needed — `requireDealAccess` denies once the `workspace_participants` row is deleted).
4. ✅ Participant list displays email, role badge, and invite/active status. (Online/offline indicator deferred to Phase 4 — replaced by status badge for v1.)
5. ✅ Email notifications fire on invitation and on upload-batch (one email per recipient per batch, not one per file); stubs log to console when `RESEND_API_KEY` absent.

## Plans executed

### Plan 3.1 — Backend & IDOR foundation (15 tasks)

- **Schema:** `magic_link_tokens` gained `purpose` and `redirect_to` columns; two new activity enum values (`participant_updated`, `notified_batch`).
- **DAL:** permission matrix resolver ([cis-deal-room/src/lib/dal/permissions.ts](../../../cis-deal-room/src/lib/dal/permissions.ts)); real `requireDealAccess` and `requireFolderAccess` replacing the Phase 1 stubs; participant CRUD in [participants.ts](../../../cis-deal-room/src/lib/dal/participants.ts) with self-edit guards and idempotent re-invite; folder listing filters by `folder_access` for non-admins.
- **API routes (new):** `GET/POST /api/workspaces/[id]/participants`, `PATCH/DELETE /api/workspaces/[id]/participants/[pid]`, `GET /api/workspaces/[id]/activity` (paginated), `POST /api/workspaces/[id]/notify-upload-batch` (client-initiated fan-out).
- **Verify route:** branches on `tokenRow.purpose === 'invitation'` to flip pending `workspace_participants` rows to `'active'` and redirect to the workspace.
- **Email service:** `sendEmail()` wrapper with stub mode; two new React Email templates (`InvitationEmail`, `UploadBatchNotificationEmail`) alongside the existing `MagicLinkEmail`.
- **IDOR retrofit:** real access checks added to every file route (presign-upload, confirm, presign-download, list) and workspace/folder GET routes. Closed a latent Phase 2 gap where `/api/files/confirm` had no folder-access check.

### Plan 3.2 — UI & end-to-end (6 tasks)

- **Role labels:** [`roleLabel`, `assignableRolesFor`](../../../cis-deal-room/src/lib/participants/roles.ts) — contextual naming (Buyer Rep when CIS advises seller-side; Seller Rep when buyer-side).
- **Shared Invite/Edit modal:** [`ParticipantFormModal`](../../../cis-deal-room/src/components/workspace/ParticipantFormModal.tsx) with atomic role + folder-access save.
- **Participant list:** [`ParticipantList`](../../../cis-deal-room/src/components/workspace/ParticipantList.tsx) with admin-only Edit/Remove controls and inline Active/Invited status pills.
- **Right panel wiring:** swapped the placeholder for the real list; wired `cisAdvisorySide`, `folders`, `isAdmin` props down from `WorkspaceShell`.
- **UploadModal batch-notify:** accumulates confirmed file IDs and fires one `POST /notify-upload-batch` after the last confirm — one email per recipient, regardless of how many files.
- **Human-verify checkpoint** document for the end-to-end walkthrough.

### Plan 3.5 — Visual refresh + UX fixes (11 tasks)

- **Design tokens** in [globals.css](../../../cis-deal-room/src/app/globals.css): semantic `@theme` block (`bg-surface`, `text-text-primary`, `bg-accent`, `text-danger`, status tokens, etc.). Every component migrated off hardcoded hex.
- **Logo component** at [cis-deal-room/src/components/ui/Logo.tsx](../../../cis-deal-room/src/components/ui/Logo.tsx); real CIS Partners SVG now renders on LoginPage, VerifyPage, WorkspaceShell header, and all three email templates.
- **Palette:** pure white, near-black text, CIS red reserved for CTAs and emphasis only.
- **Three UX fixes** bundled with the migration:
  - Workspace header's logo + arrow link back to `/deals`; folder sidebar has a "Deal overview" entry that clears the folder selection.
  - UploadModal hides the folder dropdown when opened from a folder; shows it from Deal overview.
  - UploadModal queue auto-clears on every close via `useEffect`, regardless of which path closed the modal.

## Integration work (beyond plans)

Real-environment integration surfaced five issues not anticipated by the plans; all fixed:

- **DB driver swap:** neon-http → neon-serverless (WebSocket Pool) because `db.transaction()` is unsupported in the HTTP driver.
- **Upstash rate-limit stub:** matches the sendEmail pattern — local dev works without Upstash credentials.
- **Magic-link URL bug:** Phase 1 routed links to `/auth/verify` (the error page) instead of `/api/auth/verify` (the actual handler), so every click went to "Invalid link". Fixed for both login and invitation flows.
- **Session-cookie redirect:** `Response.redirect()` returns an immutable-headers response per Fetch spec; `setSessionCookie` threw `TypeError`. Migrated to `NextResponse.redirect()`.
- **AWS S3 live:** presign PUT dropped explicit `ServerSideEncryption` (bucket default handles it; signing SSE forces the browser to echo the matching header, which our XHR doesn't, yielding 403 signature mismatches). `presign-download` stub branch was logging activity with `workspaceId: 'stub'` which fails the uuid column type — now fetches the folder's real workspaceId regardless of stub mode.

Additionally, the DealOverview page gained a file-counts map per folder (via a new grouped-query DAL helper `getFileCountsByFolder`) and folder cards became clickable buttons that select the folder — eliminating the need to round-trip through the sidebar.

One post-checkpoint bug was caught and fixed: the UploadModal's `useState(initialFolderId)` initializer only fires on first mount, so uploads from subsequent folder selections routed to whichever folder was first opened. Added a `useEffect` that resyncs `selectedFolderId` each time `open` transitions to `true`.

## Design spec

[docs/superpowers/specs/2026-04-13-phase-3-collaboration-design.md](../../../docs/superpowers/specs/2026-04-13-phase-3-collaboration-design.md) — the refinement document authored during brainstorming. Supersedes the Phase 3 section of the base spec on invitation flow, permission model, session invalidation, activity enum naming, and plan slicing.

## Known v1 limitations (documented, not blocking)

- Presigned download URLs remain valid for their 15-min window after access is revoked.
- GET `/participants` response does not include folder IDs — ParticipantFormModal edit mode opens with empty folder-access checkboxes; admins re-select. Cheap fix for Phase 4 backlog.
- Online/offline indicator (last active < 5 min) deferred to Phase 4.
- No invitation-specific rate limiting — admins trusted; re-evaluate if abuse emerges.
- No user-disabled flag; removal is per-workspace.

## Production readiness notes

- AWS credentials in `.env.local` are dev-scoped. Production deploy requires a separate IAM user (e.g. `cis-deal-room-prod`) with keys stored in the hosting platform's secrets manager, never on-disk.
- Neon DATABASE_URL similarly must be a separate prod branch/project at deploy time.
- `NEXT_PUBLIC_APP_URL` must be set to the production origin for invitation/login magic links to route correctly and for email-embedded logo URLs to resolve.

## What's next

Phase 4 — Interface and Polish: activity feed UI in the RightPanel, deal list rich cards (doc count, participant count, last activity), responsive layout for tablet/mobile, search and filter, notification digest preference.
