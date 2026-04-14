# Phase 4 — Interface & Polish — Summary

**Status:** Complete
**Shipped:** 2026-04-14
**Plan:** 18 tasks in a single plan ([docs/superpowers/plans/2026-04-14-phase-4-interface-polish.md](../../../docs/superpowers/plans/2026-04-14-phase-4-interface-polish.md))
**Tests:** 149 passing · 0 TS errors
**Human checkpoint:** signed off ([cis-deal-room/docs/phase-4-checkpoint.md](../../../cis-deal-room/docs/phase-4-checkpoint.md))

## What Phase 4 delivered

Phase 4 turned the functional-but-rough v0.9 deal room into v1.0: every surface now uses real display names instead of emails, deals are presented as rich tile cards with at-a-glance counts, the activity feed is live in the RightPanel, sessions auto-expire gracefully with clear re-auth UX, the notification digest pipeline is wired end-to-end, files have proper version history UI, and the whole app gained toast feedback + graceful mobile degradation + an explicit Sign out flow.

### Success criteria — all met

1. ✅ Deal list: tile cards with name, status badge, client (admin-only), doc count, participant count, last-activity summary; client-side search + status filter (UI-01, WORK-04)
2. ✅ Workspace now shows "at least one active Client" warning; Engagement→Active DD is blocked server-side when no Client (WORK-05)
3. ✅ Activity feed renders in the RightPanel with 60s polling, load-more pagination, and same-actor grouping within a 10-min window; target names clickable (ACTY-02)
4. ✅ Per-user notification digest toggle; QStash cron drains `notification_queue` into a daily per-user summary email (NOTF-03)
5. ✅ Graceful mobile read-only at <1024px (UI-06)
6. ✅ Session auto-expiry honored end-to-end: 2h idle + 4h absolute cap; 401 interceptor → toast → redirect with returnTo
7. ✅ Display names replace email across every user-visible surface; `/complete-profile` gate enforces on first login
8. ✅ File version history drawer; admin can delete specific versions
9. ✅ Sonner toasts replace every `alert()`
10. ✅ Explicit Sign out via UserMenu (both deal list and workspace headers)

## What shipped (18 tasks, 4 groups)

### Group 1 — Quick wins (no schema change)

- **Task 1:** sonner + `<Toaster />` + replace `alert()` in FileList/ParticipantList
- **Task 2:** `getParticipants` returns `folderIds` array; Edit modal prefills correctly (closes a Phase 3 v1 limitation)
- **Task 3:** `<Banner />` component + `countActiveClientParticipants` DAL + `PATCH /workspaces/[id]/status` transition guard
- **Task 4:** deal list client-side search + status filter

### Group 2 — Structural (single schema migration)

- **Task 5:** migration adds `users.first_name`, `users.last_name`, `users.notification_digest`, `sessions.absolute_expires_at`, `notification_queue` table
- **Task 6:** `displayName(user)` helper + every DAL consumer (`getParticipants`, `getFilesForFolder`, `getWorkspacesForUser`, activity route, files list route) returns name fields + `lastSeen` + joined workspace counts
- **Task 7:** `/complete-profile` page + `POST /api/user/profile` + verify-route redirect when name missing
- **Task 8:** `ParticipantList` + `FileList` migrated to call `displayName`; "last seen Xm ago" replaces online indicator
- **Task 9:** `getSession` enforces idle (2h) AND absolute (4h); `fetchWithAuth` client wrapper intercepts 401 → toast + redirect to `/login?returnTo=…`; `<ReturnToHandler />` consumes it on landing; 8 client components migrated to `fetchWithAuth`
- **Task 10:** `<DealCard />` tile layout with counts and action-summary last activity
- **Task 11:** `<ActivityFeed />` + `<ActivityRow />` — polling (60s, paused when tab hidden), load-more, grouping, clickable targets

### Group 3 — Notification digest pipeline

- **Task 12:** `enqueueOrSend` helper routes based on `user.notificationDigest`; upload-batch notifications consume it (invitations keep immediate send)
- **Task 13:** `@upstash/qstash` installed; `POST /api/cron/digest` with signature verification + `DailyDigestEmail` template; stub-mode when QStash env keys absent
- **Task 14:** `POST /api/user/preferences` + UserMenu avatar with digest toggle

### Group 4 — Polish

- **Task 15:** `<VersionHistoryDrawer />` + `GET /api/workspaces/[id]/files/[fileId]/versions` + per-version download + admin per-version delete
- **Task 16:** FileList search input wired (was already correctly implemented in Phase 2 — audit-only)
- **Task 17:** responsive — side panels hide below 1024px, modals full-screen below 768px, deal-overview heading scales down
- **Task 18:** Phase 4 human-verify checkpoint doc

## Integration work beyond the plan

A handful of real-environment issues surfaced during the checkpoint walkthrough and were fixed:

- **Stale Next.js 16 cache:** workspace + deal list pages showed `0` file counts even with files present; added `export const dynamic = 'force-dynamic'` to bypass the cache.
- **Versioned re-upload bug:** presign-upload was short-circuiting on duplicate detection with no `s3Key`, so confirm 400'd. Added `confirmedVersioning` flag to presign-upload's schema and skip logic.
- **Zod error arrays rendered as React children:** UploadModal was storing `body.error` (sometimes an array) directly in the row's `error` field; added `toErrorString()` normalizer.
- **Root route:** `/` was still rendering the default Next.js scaffold landing page; now redirects to `/deals` (authed) or `/login`.
- **Explicit Sign out:** not in the original Phase 4 plan — added as a follow-up when user flagged no logout existed. UserMenu extracted to shared component; logout route destroys session + clears cookie; UserMenu now on deal list header too.
- **v2 chip visibility:** original styling was too muted (gray mono); restyled as brand-red pill with border + hover state that inverts.
- **DealCard pluralization + font:** "1 participants" fixed to "1 participant"; dropped `font-mono` on the last-activity row.

## Known v1 limitations → v1.1 backlog

- Digest email actor names show as "Someone" (queue rows don't capture actor at enqueue time; enhance later)
- Pre-expiry session warning (warn user 2 min before logout with "extend session" button)
- File version restore ("make v2 the current" instead of re-upload)
- Dark-mode toggle (tokens already semantic; one-file swap)
- Per-file comments / annotations
- QStash scheduled message must be created in the Upstash dashboard before digest actually fires in production

## Production readiness checklist

Before deploying to a production hostname:

1. Set `NEXT_PUBLIC_APP_URL` to the production origin so magic-link + email logo URLs resolve correctly
2. Create separate production IAM user (`cis-deal-room-prod`) with the same scoped S3 policy; store keys in hosting-platform secrets manager (never on-disk)
3. Create production Neon branch/project; set production `DATABASE_URL`
4. Provision `RESEND_API_KEY` so emails actually send (stub mode is dev-only)
5. Provision `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` for real rate limiting
6. Provision `QSTASH_TOKEN` + `QSTASH_CURRENT_SIGNING_KEY` + `QSTASH_NEXT_SIGNING_KEY`; create the daily digest scheduled message in Upstash dashboard pointing at `${APP_URL}/api/cron/digest` with cron `0 13 * * *` UTC (8am ET)
7. Rotate any credentials that existed in local `.env.local` during development — treat those as compromised

## What's next

v1.0 is shipped. Potential next milestones:

- **v1.1** — pick off backlog items above (session warning, digest polish, dark mode, etc.)
- **v1.2** — feature work on top of v1 (file comments, folder permissions refinement, additional roles?)
- **v2** — net-new direction (deal analytics, AI document summarization, integrations?)

No decision yet on which.
