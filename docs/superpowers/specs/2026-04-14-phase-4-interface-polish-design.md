# Phase 4 — Interface & Polish — Design Spec

**Status:** Approved 2026-04-14
**Base spec:** [2026-04-13-cis-deal-room-design.md](./2026-04-13-cis-deal-room-design.md) — section 6 (Interface & Polish draft)
**Supersedes:** the original section 6 draft where this document contradicts it; otherwise the base spec still applies.

This document captures Phase 4 scope and design decisions after the Phase 3 brainstorm-and-ship cycle. It resolves the ambiguities in the base spec's Phase 4 sketch, addresses open requirements (WORK-04, WORK-05, ACTY-02, NOTF-03, UI-01, UI-06), and folds in the v1 follow-ups from the Phase 3 SUMMARY. It is the single source of truth for Phase 4 implementation.

---

## 1. Scope

### In

1. Deal list rich cards (UI-01, WORK-04) — doc/participant/last-activity counts, tile layout, client-side search + status filter
2. Activity feed UI (ACTY-02) — polling feed in the RightPanel with load-more pagination and same-actor grouping
3. No-Client warning + status-transition block (WORK-05)
4. Session timeout policy — idle 2h, absolute 4h, global 401 interceptor
5. Participant "last seen" replaces online/offline indicator; also adds folderIds to GET `/participants`
6. Notification digest (NOTF-03) — per-user opt-in, QStash cron, daily email
7. File versioning drawer — history view with per-version download + admin delete
8. Graceful mobile read-only responsive (UI-06)
9. Toast system via sonner; replace existing `alert()` calls
10. Empty-state polish (inline with other components, no separate task)
11. **Display names** — collect first + last name on first login; use "First Last" in place of email across every user-visible surface; admin contexts show both (name primary, email secondary)

### Out of scope (explicitly deferred)

- Dark-mode toggle
- Dedicated mobile-optimized layouts (we support mobile for browsing, not active editing)
- Per-file comments / annotations
- Pre-expiry session warning ("your session expires in 2 min — extend?") — v1.1 backlog
- Rich-text digest templates (plain-text+summary markup is v1)
- "Restore older version as current" — workaround is re-upload as a new version
- Real-time WebSocket push for activity feed — polling is v1

---

## 2. Schema changes

### Modified tables

| Table | Column | Notes |
|---|---|---|
| `users` | `first_name text` | Collected on first login; nullable for backward compat with pre-Phase-4 users |
| `users` | `last_name text` | Same |
| `users` | `notification_digest boolean not null default false` | User's preference for digest vs. real-time email |
| `sessions` | `absolute_expires_at timestamp not null default (now() + interval '4 hours')` | Hard cap; set on session creation, never refreshed |

Both `first_name` and `last_name` are nullable at the DB level (migration-safe for existing users who pre-date Phase 4), but the UX enforces filling them in on next login — see §6 "Complete-profile gate".

### New table

```sql
create table notification_queue (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  action activity_action not null,
  target_type activity_target_type not null,
  target_id uuid,
  metadata jsonb,
  created_at timestamp not null default now(),
  processed_at timestamp
);

create index idx_notification_queue_unprocessed on notification_queue(user_id, processed_at) where processed_at is null;
```

Rows are inserted by any email-sending code path when the target user has `notification_digest = true`. The QStash-triggered cron reads unprocessed rows grouped by `user_id`, sends one email per user, stamps `processed_at` on sent rows.

---

## 3. Session policy

### Windows

- **Idle window:** 2 hours — session dies if `now - lastActiveAt > 2h` on next request
- **Absolute cap:** 4 hours — session dies when `now > absoluteExpiresAt`, regardless of activity
- `getSession()` returns `null` if either check fails; existing auth gate (Phase 1 pattern) handles the 401

### Client-side 401 interceptor

A new `fetchWithAuth()` wrapper in `src/lib/fetch-with-auth.ts`:

```typescript
export async function fetchWithAuth(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const res = await fetch(input, init);
  if (res.status === 401) {
    const currentPath = window.location.pathname + window.location.search;
    toast.error('Session expired — please sign in again');
    window.location.href = `/login?returnTo=${encodeURIComponent(currentPath)}`;
    throw new Error('Session expired');
  }
  return res;
}
```

Every client component that currently calls `fetch(...)` directly swaps to `fetchWithAuth(...)`. Server components are untouched.

On the login page, the `returnTo` query param is read after successful verify: magic link redirect target uses `returnTo` if it's a same-origin path; otherwise falls back to `/deals`.

---

## 3A. Display names

### Complete-profile gate

- After `/api/auth/verify` creates a session, a new server-side check reads `user.first_name` and `user.last_name`
- If either is null → redirect to `/complete-profile` instead of the normal post-verify destination
- `/complete-profile` is a minimal form: First name (required), Last name (required) → `POST /api/user/profile` → redirect to the original post-verify target
- The original target is preserved through the gate via sessionStorage (same mechanism as the login `returnTo` flow described in §3)
- The gate applies to both new users (first-ever login) and existing pre-Phase-4 users on next login — neither can skip

### Display-name helper

New utility `src/lib/users/display.ts`:

```typescript
export function displayName(user: { firstName: string | null; lastName: string | null; email: string }): string {
  if (user.firstName && user.lastName) return `${user.firstName} ${user.lastName}`;
  return user.email;
}
```

Every surface that currently shows a user's email for display purposes migrates to call `displayName(user)`. Auth identity (sessions, email-keyed rate limits, invitation tokens) continues to use `email` — the display helper is strictly for UI strings.

### Admin contexts show both

The participant list for admins renders `displayName(user)` as the primary row text with `user.email` beneath as small muted secondary text. Non-admins see `displayName(user)` only. Activity feed, deal list last-activity, file list "uploaded by" column, and deal overview "created by" show display names only regardless of viewer role.

### Invitation email personalization

`InvitationEmail` template accepts an optional `inviteeName` prop. The invitation route passes `displayName(inviteeUser)` if the user already exists in the DB at invite time (repeat invitee — we know their name); omits it for brand-new users (admin hasn't met them yet). Greeting: "Hi {name}," when present, "Hi," when not.

### DAL consumer updates

- `getParticipants` return rows gain `firstName`, `lastName` fields (already returning email; just joining additional user columns)
- `getWorkspacesForUser` last-activity subquery joins `users` to get the actor's name for the summary line
- `getFilesForFolder` (currently returns `uploadedByEmail`) gains `uploadedByFirstName`, `uploadedByLastName`; consumer uses `displayName({firstName, lastName, email})` pattern
- `getFileVersions` same as `getFilesForFolder`
- Activity feed route returns actor name + email per row

---

## 4. New dependencies

- `sonner` — toast library; mounted once in `(app)/layout.tsx` as `<Toaster position="top-right" />`. Replaces existing `alert()` calls across the app.
- `@upstash/qstash` — publishes scheduled messages to our app; used to trigger the digest cron. Verifies incoming cron requests via `Receiver.verify()` in the route handler.

No other new runtime dependencies.

---

## 5. New components

### `<Toaster />`
- Mounted once at the top of `(app)/layout.tsx` (inside the authenticated layout)
- Accepts our theme via sonner's built-in `theme`, `style` overrides using our semantic tokens (`--color-surface`, `--color-text-primary`, `--color-accent`, `--color-danger`)
- All app-level imperative messages use `toast.success`, `toast.error`, `toast.info`

### `<Banner />`
- Generic persistent banner for workspace-level warnings
- Props: `variant: 'warning' | 'danger' | 'info'`, `children: ReactNode`, optional `action: { label, onClick }`
- Styling: full-width bar above three-panel layout, amber tint for warnings, red for danger
- Not dismissible by default (Phase 4 doesn't need dismissibility)

### `<DealCard />`
- Tile-style card for the deal list grid
- Shows: deal name (h3), status badge, client name (admin only), three metadata rows — `{count} docs`, `{count} participants`, `{action summary} · {relative time}` last activity
- Card is a link wrapping the full surface; click anywhere → `/workspace/{id}`
- Hover: subtle border-accent tint via existing `hover:border-accent` pattern

### `<DealListFilters />`
- Horizontal bar above the card grid
- Search input (filters by deal name + client name, case-insensitive substring)
- Status multi-select dropdown (six statuses from `WorkspaceStatus` enum)
- State lifted to `DealList` parent; filtering is client-side on the loaded list (no server round-trip)

### `<ActivityFeed />`
- Renders inside RightPanel's Activity tab
- Fetches via `GET /api/workspaces/[id]/activity?limit=50&offset=0` on mount
- Polls every 60s when tab is visible (`document.visibilityState`)
- "Load more" button at end of list → fetches next page by offset, appends to state
- Groups consecutive rows with same `{userId, action, targetType}` within a 10-minute window into a single row; expandable on click

### `<ActivityRow />`
- Displays one activity event (grouped or single)
- Structure: `<avatar/initial> <actor email> <action text> <target link> · <relative time>`
- Action text is derived from `action + targetType` (e.g. `uploaded + file` → "uploaded"; `invited + participant` → "invited")
- Target links: `file` → scrolls workspace to the file row and flashes highlight; `folder` → selects the folder; `participant` → opens the edit modal (admin only)
- Grouped rows show count: "uploaded 3 files in Financials"; click-to-expand reveals individual rows inline

### `<VersionHistoryDrawer />`
- Slide-in panel from the right edge of the file list area
- Triggered when user clicks the `vN` chip on a file row (chip becomes clickable — Phase 2 had it as a static badge)
- Fetches `GET /api/workspaces/[id]/files/[fileId]/versions` — returns all rows with the same workspace, folder, and name, newest-version first
- Per-version row: version number (large), uploader email, relative date, formatted size, Download button, Delete button (admin only, with confirm prompt)
- Dismissible via X button, Esc key, or clicking the underlay

### `<LoginReturnToHandler />`
- Tiny client component rendered on `/login`
- Reads `returnTo` from URL params, stores in `sessionStorage` under `loginReturnTo`
- The login flow (existing) continues unchanged until post-verify redirect
- The verify route redirects to `/deals` (or `tokenRow.redirectTo` for invites); we add logic: after redirect lands, client reads `sessionStorage.loginReturnTo`, if present, navigates there instead

### `/complete-profile` page
- Server component at `src/app/(app)/complete-profile/page.tsx`
- Renders only if the session user's `firstName` or `lastName` is null; otherwise redirects to `/deals`
- Form with two required inputs (First name, Last name) calling `<ProfileForm />` client component
- On successful submit, client reads sessionStorage to find any `loginReturnTo` or `tokenRedirectTo` target and navigates there; falls back to `/deals`
- No header, no shell — a minimal gate page (like `/login`)

---

## 6. Modified components

### `WorkspaceShell`
- Wraps the three-panel layout with a conditional `<Banner variant="warning">` above whenever the workspace has no active Client participant, regardless of stage
- Rationale: inviting a Client is the right thing to do even at Engagement (the user explicitly requested Clients be invitable at all stages). The banner is the gentle prompt; the hard block kicks in only on the `Engagement → Active DD` transition
- Banner copy: "No active Client participant. [Invite Client] to progress the deal."
- Banner action: the "Invite Client" link opens `<ParticipantFormModal>` in invite mode with role pre-filled to `'client'`
- Banner disappears as soon as a Client participant has `status='active'`

### `DealList`
- Replaces existing table-row layout with `<DealCard />` tiles in a grid
- Grid: 3-col @ `lg:`, 2-col @ `md:`, 1-col default
- `<DealListFilters />` rendered above the grid
- "New Deal" button top-right (admin only — already admin-gated)
- Empty state: "No deal rooms yet" + "Create one" button (admin) / "You haven't been invited to any deal rooms yet" (non-admin)

### `FileList`
- `vN` version chip becomes clickable → opens `<VersionHistoryDrawer />`
- Search input (already present, unwired) gets wired to a `search` state; filter on `file.name` client-side, case-insensitive
- Empty state after filtering: "No files match your search"

### `ParticipantList`
- Replace existing inline status pill (Active/Invited) to display alongside "last seen: {relative}" text when status is `active`
- Invited status rows show "not yet accepted" instead of a timestamp
- Edit modal now receives real `folderIds` from GET response — the v1 placeholder helper `useEditingFolderIds` is removed

### `RightPanel`
- Activity tab content becomes `<ActivityFeed workspaceId={workspaceId} />`
- The existing `ActivityPlaceholder` function is removed

### `UploadModal`, `ParticipantFormModal`
- Replace any `alert(...)` calls with `toast.error(...)` or `toast.success(...)`
- Server-error banners already migrated in Phase 3.5 — no additional work

---

## 7. Modified DAL

### `getSession` ([cis-deal-room/src/lib/auth/session.ts](../../../cis-deal-room/src/lib/auth/session.ts))

- Idle constant renamed `SESSION_IDLE_MS` = 2 hours
- Query `where` clause adds check on `sessions.absoluteExpiresAt > now()`
- Remove the 24h constant; replace with `SESSION_IDLE_MS`
- No `absoluteExpiresAt` refresh — it's set once at session create

### `createSession`

- Insert sets `absoluteExpiresAt: new Date(Date.now() + 4 * 60 * 60 * 1000)`

### `getWorkspacesForUser`

- Extend return shape with `{ docCount, participantCount, lastActivity: { action, targetType, createdAt } | null }`
- Single query with two LEFT JOIN LATERAL sub-selects — one for `count(files)` scoped through folders, one for `count(workspace_participants)` where status='active', plus a third LATERAL for the most recent `activity_logs` row per workspace
- Performance note: three LATERAL subqueries per workspace row — fine at M&A deal scale (tens of workspaces, not thousands)

### `getParticipants`

- Add LEFT JOIN on `folder_access` grouped by `workspace_participants.id`, aggregated `array_agg(folder_access.folder_id)` into `folderIds: string[]`
- Response rows gain `folderIds` field
- Remove the `useEditingFolderIds` v1 placeholder from [cis-deal-room/src/components/workspace/ParticipantList.tsx](../../../cis-deal-room/src/components/workspace/ParticipantList.tsx)

### `countActiveClientParticipants(workspaceId)` (new)

- Returns `number` — count of `workspace_participants` rows where `workspace_id = $1 and role = 'client' and status = 'active'`
- Used by the status-transition guard

### `getFileVersions(workspaceId, fileId)` (new)

- Fetches the file row by id to resolve folder + name
- Returns all rows in `files` matching (workspace, folder, name), ordered by `version desc`
- Each row: `id, version, uploadedByEmail, sizeBytes, mimeType, s3Key, createdAt`

### `getLastSeen(userId): Date | null` (new)

- Returns `max(sessions.lastActiveAt)` for that user, or null if never had a session
- Used by `getParticipants` (joined inline, not separate call)

### `enqueueOrSend(input)` (new)

- Helper function wrapping notification fan-out
- Given `{ user, workspaceId, action, targetType, targetId, metadata, immediateEmail }`:
  - If `user.notificationDigest === true`: insert row into `notification_queue`
  - Else: call `immediateEmail()` synchronously
- Consumers: `notify-upload-batch` route, `/participants` POST route (invitation email)

---

## 8. New API routes

### `POST /api/user/preferences`

- Body: `{ notificationDigest: boolean }`
- Updates `users.notification_digest` for `session.userId`
- Returns 200 with updated user row; 401 if no session

### `POST /api/user/profile`

- Body: `{ firstName: string, lastName: string }` — Zod validates both non-empty, 1-64 chars each after trim
- Updates `users.first_name` and `users.last_name` for `session.userId`
- Returns 200 with updated user row; 401 if no session; 400 on validation failure

### `GET /api/workspaces/[id]/files/[fileId]/versions`

- Auth: `requireFolderAccess(file.folderId, 'download')`
- Returns array of all version rows matching (workspace, folder, name) of the referenced `fileId`
- Joined with `users.email` for uploader display
- Ordered version-desc

### `POST /api/cron/digest`

- QStash-triggered (not hit directly by users)
- Verifies request using `@upstash/qstash`'s `Receiver.verify()` with the QStash current+next signing keys
- On valid signature:
  - Groups unprocessed `notification_queue` rows by `user_id`
  - For each user group: renders `DailyDigestEmail` with the batch, sends via `sendEmail()`, stamps `processed_at = now()` on sent rows
  - Returns 200 `{ processed: N, failed: 0 }`
- Scheduled via QStash dashboard (initial setup), OR programmatically via QStash SDK during deployment (preferred); cron expression `0 13 * * *` UTC (8am ET)

### `DailyDigestEmail` template (new)

- One section per workspace the user has unprocessed events in
- Under each workspace: bullet list of events (grouped where consecutive same-actor same-action within 10 min, same rule as activity feed)
- Footer: "You can change this to real-time notifications in your account settings"
- Uses existing email style helpers (colors + font settings migrated in Phase 3.5)

---

## 9. Modified API routes

### `/api/auth/verify`

- Idle check uses new `SESSION_IDLE_MS`
- Also checks `absoluteExpiresAt` on the resolved session before issuing the cookie
- On absolute-expired session (user already authenticated previously but session cap hit): behave as if no session — redirect to login
- After session cookie is set, if the user's `first_name` OR `last_name` is null, override the redirect target to `/complete-profile` (the original target is preserved in sessionStorage on the client and honored after profile completion)

### `/api/workspaces/[id]/notify-upload-batch`

- Before `sendEmail()` per recipient, check recipient's `notificationDigest`
- If true → insert into `notification_queue` instead
- Otherwise → send immediately (current behavior)

### `POST /api/workspaces/[id]/participants` (invitation)

- After inviteParticipant succeeds, check invitee's `notificationDigest`
- If true → insert `invited` event into `notification_queue`, don't send invitation email right now — BUT this creates a problem: the invitation token is in the email, so we can't defer.
- **Decision:** invitation emails always send immediately regardless of digest preference. Digest only batches *ongoing* notifications (upload-batch, future notifications). First-touch invites are time-sensitive. Clarify in the template copy: "Daily digest applies to in-app activity only. Invitations and sign-in links always send immediately."

### `PATCH /api/workspaces/[id]/status`

- New guard: if body's `status` is `active_dd` AND the workspace is currently in `engagement`, check `countActiveClientParticipants(workspaceId) > 0`
- If zero clients: return 400 with `{ error: 'At least one active Client participant is required before moving to Active DD' }`
- Other transitions unaffected
- Guard runs after the admin-only check

---

## 10. UX specifics

### Activity feed grouping rule

Consecutive rows (in time order) are grouped into a single displayed entry when all three conditions hold:
- Same `userId` (actor)
- Same `action`
- Same `targetType`
- Within **10 minutes** of each other (based on `createdAt`)

Grouped row text: `"{actor} {action} {count} {targetType}s in {contextName} · {latest relative time}"` — e.g. `"levin.rob uploaded 3 files in Financials · 2m ago"`

Expanded (on click): shows each original row with full target name and its own timestamp

### Status-transition block banner interaction

When admin tries to move from Engagement to Active DD and gets the 400:
- The status dropdown reverts to Engagement (optimistic-update revert)
- Toast: "At least one Client participant must be active to progress to Active DD"
- The persistent `<Banner />` at the top (already visible because no Client) now also gets a subtle red outline for one second (visual ack that admin attempted to bypass)

### Responsive behavior summary

| Breakpoint | Deal list | Workspace layout |
|---|---|---|
| `≥ 1024px` | 3-col card grid | Full 3-panel |
| `768px–1023px` | 2-col card grid | Folder sidebar collapses to top dropdown; right panel becomes icon-triggered slide drawer |
| `< 768px` | 1-col cards | Single column; folder dropdown full-width; right-panel drawer full-screen |
| `< 768px` modals | — | Upload/Invite/Edit modals render as full-screen sheets |

All via Tailwind `md:` / `lg:` prefixes — no JS layout switching, no new routes.

### Login returnTo flow

1. User at `/workspace/abc` → idle > 2h → next API call returns 401
2. Client interceptor catches 401 → toast "Session expired — please sign in again" → navigates to `/login?returnTo=/workspace/abc`
3. Login page stores `returnTo` in sessionStorage (survives the magic-link flow)
4. User enters email → clicks magic link → `/api/auth/verify` creates session → redirects to `/deals`
5. Client on `/deals` mounts → reads `sessionStorage.loginReturnTo` → if present, replaces URL with that path and clears sessionStorage

---

## 11. Testing

### Unit tests for DAL additions

- `getFileVersions` — fetches versions correctly; hides other-folder files with the same name
- `getWorkspacesForUser` extended fields — counts, last-activity row (including actor's name)
- `getParticipants` — folderIds aggregation returns array (empty array, not null); first/last name included
- `countActiveClientParticipants` — counts only `role='client' AND status='active'`
- `getLastSeen` — returns max lastActiveAt; returns null when no sessions
- `displayName` helper — returns "First Last" when both set; returns email when either is null

### Route tests

- `POST /api/user/preferences` — 401 unauth; 200 updates user row
- `POST /api/user/profile` — 401 unauth; 400 when firstName/lastName empty or too long; 200 updates user row
- `GET /files/[id]/versions` — 401 unauth; 403 without folder access; 200 returns versions array
- `POST /api/cron/digest` — 401 without valid QStash signature; 200 drains queue; `processed_at` timestamped; empty queue returns `{processed: 0}` without erroring
- `PATCH /workspaces/[id]/status` — new test: engagement → active_dd with 0 clients returns 400
- `/api/auth/verify` — verify route redirects to `/complete-profile` when user.firstName IS NULL after successful auth

### Component tests

- `<DealCard />` — renders counts, status badge, client-only visibility
- `<DealListFilters />` — search filters list; status dropdown multi-select
- `<ActivityFeed />` — renders rows; polling trigger; grouping logic
- `<VersionHistoryDrawer />` — version list; admin-only delete button; close via Esc

### Integration / verification checkpoint

Append a Phase 4 section to `cis-deal-room/docs/phase-3-checkpoint.md` (or create `phase-4-checkpoint.md`) with verification steps for:
- Deal list cards look right at all breakpoints
- Search + filter narrow results
- No-Client banner renders correctly
- Transition block actually blocks
- Session auto-logout after 2h idle (hard to test in-session; use DB update to fake lastActiveAt)
- 401 interceptor toast + redirect
- Digest preference toggle persists
- Digest email sends via QStash trigger (manual curl of cron route with valid signature)
- File version drawer opens, downloads, admin-deletes
- Responsive degradation at 1023px / 767px / 375px

---

## 12. Dependencies and external setup

### QStash

- Sign up at [upstash.com](https://upstash.com) → create QStash instance (free tier)
- Copy `QSTASH_URL`, `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY` to `.env.local`
- Create a scheduled message via QStash dashboard: cron `0 13 * * *` UTC → target `${NEXT_PUBLIC_APP_URL}/api/cron/digest`
- For local dev: manually curl the endpoint with a valid-signature header to test; or stub signature verification via env flag

### Sonner

- `npm install sonner`
- Import in `(app)/layout.tsx` root

---

## 13. Known v1.1 / backlog

- Pre-expiry session warning ("your session expires in 2 min — click to extend")
- Activity feed full-text search
- Digest email with HTML rich formatting (links, avatars)
- File version restore ("make v2 the current")
- Dark-mode toggle (tokens make it a one-file swap)
- Per-file comments
- Mobile-native upload UX

---

## 14. Implementation sequencing

Work can be split into three natural groups, but all ship as Phase 4 per decision:

**Group 1 — Quick wins (foundational + can ship incrementally):**
- Sonner + `<Toaster />`
- Participant folderIds in GET + Edit modal wiring
- No-Client banner + status-transition guard
- Search + filter on deal list (client-side)

**Group 2 — Structural changes (single schema migration):**
- Schema migration: `users.first_name`, `users.last_name`, `users.notification_digest`, `sessions.absolute_expires_at`, `notification_queue`
- Display-name helper + DAL consumer updates (getParticipants, getFilesForFolder, getFileVersions, activity feed, deal list last-activity)
- `/complete-profile` page + `POST /api/user/profile` + verify-route gate
- Migrate every surface currently showing email for display to use `displayName(user)`
- Session policy (idle + absolute + 401 interceptor)
- Deal list tile cards + extended `getWorkspacesForUser`
- Activity feed UI

**Group 3 — Notification digest pipeline:**
- QStash setup + cron route
- `enqueueOrSend` helper
- `DailyDigestEmail` template
- User preferences route + UI toggle

**Group 4 — Polish:**
- File versioning drawer
- Responsive breakpoints pass
- Empty state polish
- Checkpoint verification

Order within the implementation plan will follow this grouping unless dependencies force reordering (e.g., `<Toaster />` comes first because subsequent groups replace `alert()` calls with `toast()`).

---

*Design approved 2026-04-14. Proceed to implementation via the `writing-plans` skill.*
