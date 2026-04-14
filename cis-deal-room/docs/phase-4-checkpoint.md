# Phase 4 Checkpoint — Human Verification

## Prerequisites

- `DATABASE_URL` set; all migrations applied
- `NEXT_PUBLIC_APP_URL=http://localhost:3000`
- Dev server running: `npm run dev`
- Logged in as admin; at least one workspace exists with participants and files
- For digest testing: set `QSTASH_CURRENT_SIGNING_KEY` + `QSTASH_NEXT_SIGNING_KEY` in `.env.local` (or leave unset to skip verification in dev)

## Checklist

### Complete-profile gate

- [ ] Wipe `first_name` and `last_name` for your user (SQL: `UPDATE users SET first_name = NULL, last_name = NULL WHERE email = 'your@email'`)
- [ ] Log out and log back in
- [ ] Verify route redirects to `/complete-profile` instead of `/deals`
- [ ] Form requires both names; submitting sends POST `/api/user/profile`; on success redirects to `/deals`
- [ ] Logged-in users with names set never see the gate

### Display names everywhere

- [ ] Activity feed rows show "First Last" instead of email
- [ ] Participant list rows show "First Last" as primary text
- [ ] Admin participant row shows email as small muted secondary under name
- [ ] Non-admin participant row shows name only (no email)
- [ ] File list "by" column shows display name
- [ ] Deal list "last activity" summary uses display name
- [ ] Users with missing names fall back to email gracefully

### Deal list tile cards

- [ ] Cards render in 3-col at `lg:`, 2-col at `md:`, 1-col default
- [ ] Each card shows: deal name, status badge, client name (admin only), doc count, participant count, last activity summary
- [ ] Search input filters by deal name + client name, case-insensitive
- [ ] Status multi-select dropdown filters displayed cards
- [ ] Empty-filter state: "No deals match your filters"

### No-Client banner + transition block

- [ ] In a workspace with no active Client participant, banner renders above the three-panel layout
- [ ] Banner "Invite Client" link opens the invite modal pre-filled to role=client
- [ ] After adding an active Client, the banner disappears
- [ ] Admin attempts to change status from Engagement → Active DD with no Client → 400 returned; toast explains "At least one active Client required"; status reverts optimistically
- [ ] Other transitions (Active DD → IOI → Closing → Closed) are not blocked

### Activity feed

- [ ] On load, most-recent 50 events appear, grouped where consecutive same-actor/action within 10 min
- [ ] Click on a grouped row count expands to show individual events (if implemented)
- [ ] Click filename in a row navigates to and highlights that file in the FileList
- [ ] Polling fetches fresh activity every 60s while tab is visible
- [ ] Pausing the page (switching tabs) stops polling; resuming restarts it
- [ ] "Load more" button at end loads next 50; disables when no more

### Session timeout + 401 interceptor

- [ ] Simulate idle timeout: `UPDATE sessions SET last_active_at = now() - interval '3 hours' WHERE id = 'your-session-id'`
- [ ] Make any API call (e.g. reload page) → toast "Session expired"; redirects to `/login?returnTo=/deals`
- [ ] Log in again → lands back at `/deals` (returnTo honored)
- [ ] Absolute-expiry: `UPDATE sessions SET absolute_expires_at = now() - interval '1 minute'` → next call 401s even if session is otherwise active

### Notification digest

- [ ] Toggle digest preference from avatar menu → POST `/api/user/preferences` → toast confirms
- [ ] With digest ON: trigger an upload-batch → no email fires; row inserted into `notification_queue` (verify in DB)
- [ ] Curl `/api/cron/digest` with a valid QStash signature (or unset keys in dev) → see "[email:stub]" payload in server console for the digest email; queue rows marked `processed_at`
- [ ] With digest OFF: trigger an upload-batch → email fires immediately as before
- [ ] Invitation emails always send immediately regardless of digest preference (verify by toggling digest ON and inviting someone)

### Version history drawer

- [ ] Upload a file with the same name twice to create a v2
- [ ] Click `v2` chip in the file list → drawer opens showing both versions, newest first
- [ ] Each version row shows uploader name, date, size; Download button works (real S3 or stub)
- [ ] Admin sees Delete button per version; clicking + confirming removes that version from the drawer and S3
- [ ] Esc key or underlay click closes drawer

### Responsive degradation

- [ ] At 1023px wide: three-panel layout collapses (folder sidebar becomes dropdown; right panel hides or opens as drawer)
- [ ] At 767px wide: single-column; tiles stack
- [ ] Modals render full-screen at <768px (no side margin)
- [ ] No horizontal scroll at 375px except where unavoidable

### Toast system

- [ ] Successful actions (participant removed, file uploaded, preference updated) show green success toasts
- [ ] Errors (admin removal of self, 401) show red error toasts
- [ ] No more `alert()` dialogs anywhere

## Sign-off

| Area | Status | Notes |
|---|---|---|
| Complete-profile gate | ☐ | |
| Display names | ☐ | |
| Deal cards + filters | ☐ | |
| No-Client banner + block | ☐ | |
| Activity feed | ☐ | |
| Session timeout | ☐ | |
| Digest pipeline | ☐ | |
| Version drawer | ☐ | |
| Responsive | ☐ | |
| Toasts | ☐ | |
