# Phase 3 — Collaboration (Design Refinement)

**Status:** Approved 2026-04-13
**Base spec:** [2026-04-13-cis-deal-room-design.md](./2026-04-13-cis-deal-room-design.md) — section 5 (Collaboration)
**Supersedes:** specific items in section 5 where this document contradicts the base spec; otherwise the base spec still applies.

This document captures the refinements decided during Phase 3 brainstorming after Phase 2 shipped. It resolves the ambiguities, contradictions, and unresolved edge cases in the original section-5 design, and defines the implementation-plan slicing.

---

## 1. Scope — what's in Phase 3 vs. deferred

**In Phase 3:**
- Participant CRUD (invite, edit role + folder access, remove)
- Real IDOR enforcement — replace the Phase 1 `requireDealAccess` / `requireFolderAccess` stubs and apply at every access boundary
- Invitation flow: email + magic-link landing directly in the workspace
- Email notifications: invitation + upload-batch
- Activity-log writes for participant actions
- `GET /api/workspaces/[id]/activity` endpoint (data layer only)

**Deferred to Phase 4:**
- Activity feed **UI** (RightPanel rendering) — ACTY-02
- Deal list count cards (doc count, participant count, last activity)
- Notification digest toggle — `users.notificationDigest` column and `notification_queue` table

This resolves the Phase 3/Phase 4 contradiction in the base spec: Phase 3 owns the API and the writes; Phase 4 owns the UI and the digest preference.

---

## 2. Invitation flow

### Token model

Extend `magic_link_tokens` with two optional columns:

| Column | Type | Default | Notes |
|---|---|---|---|
| `purpose` | enum `'login' \| 'invitation'` | `'login'` | Drives verify-route branching |
| `redirect_to` | text nullable | `null` | Post-login redirect target (e.g., `/deals/<workspace-id>`) |

**Expiry:**
- Login tokens: **10 minutes** (unchanged from Phase 1)
- Invitation tokens: **3 days** (new)

### Request flow

1. Admin submits the Invite form.
2. `POST /api/workspaces/[id]/participants` runs:
   - Look up user by email; create one if absent (normal user, `isAdmin = false`).
   - Insert `workspace_participants` row (`status = 'invited'`, `role`, `invitedAt`).
   - Insert `folder_access` rows for the selected folders (keyed by the new `participantId`).
   - Generate a magic-link token with `purpose = 'invitation'`, `redirect_to = /deals/<workspace-id>`, `expires_at = now + 3 days`.
   - Send invitation email via Resend (stubbed to console if `RESEND_API_KEY` absent).
3. Invitee clicks the link.
4. `/api/auth/verify` branches on `token.purpose`:
   - `'login'` → existing behavior (create session, redirect to `/`).
   - `'invitation'` → create session, flip their `workspace_participants.status` to `'active'` and set `activatedAt`, then `302` to `redirect_to`.

### Consequences

- Invitation emails can sit in inboxes up to 3 days. Longer exposure window than login tokens, but still bounded.
- Token handling stays on a single pipeline (no parallel invitation-specific table or verify route).
- Invitation rows in `magic_link_tokens` are single-use (consumed on first verify); if the user misplaces the link, the admin re-invites, which generates a new row.

---

## 3. Participant management

### API routes

| Route | Method | Auth | Description |
|---|---|---|---|
| `/api/workspaces/[id]/participants` | GET | `requireDealAccess` | List all participants for a deal (all members see the list) |
| `/api/workspaces/[id]/participants` | POST | admin-only | Invite: create user+participant+folder_access+token, send email |
| `/api/workspaces/[id]/participants/[pid]` | PATCH | admin-only | Update role and/or folder access atomically |
| `/api/workspaces/[id]/participants/[pid]` | DELETE | admin-only | Remove: delete participant + folder_access rows |

### Only admins can invite / edit / remove

- `session.isAdmin` check is the first gate on POST/PATCH/DELETE (returns 403 otherwise).
- "Admin" = `users.isAdmin = true` (CIS staff, global). There is no per-workspace admin concept.
- UI: Invite button and Edit/Remove buttons on participant rows only render when `isAdmin === true`.

### Edit UX (single modal)

- One shared React component is used for both Invite and Edit. When editing, the form is prefilled from the current participant state.
- Save is atomic: one PATCH with `{ role, folderIds[] }`, server applies as a transaction, single `participant_updated` activity row with `before` and `after` in metadata.

### Self-edit guards (server-side)

- An admin cannot change their own role away from Admin.
- An admin cannot remove themselves from a workspace.
- Both return 400 with a clear error message; UI mirrors the guards.

### Permission resolution

- `folder_access` row = pure membership. One row per (participant × folder).
- Upload-vs-download capability is derived from the participant's **role**, resolved in `requireFolderAccess(folderId, action)`:

| Role | Upload | Download |
|---|---|---|
| Admin | ✓ all folders (bypass) | ✓ all folders (bypass) |
| CIS Team | ✓ all folders in deals they belong to | ✓ all folders in deals they belong to |
| Client | ✓ granted folders | ✓ granted folders |
| Counsel | ✓ granted folders | ✓ granted folders |
| Buyer Rep / Seller Rep | ✓ granted folders | ✓ granted folders |
| View Only | — | ✓ granted folders |

Rationale: keeps the `folder_access` table schema simple; role is already stored on the participant row; permission matrix is a single function in the DAL.

### Immediate effect of edits

- Role/folder changes take effect on the next request. No session manipulation needed — permissions are re-checked per request in `requireDealAccess` / `requireFolderAccess`.
- **Known limitation (v1):** a presigned download URL already issued stays valid for its 15-minute window even after access is revoked. Documented and accepted; revisit if the threat model demands tighter control.

### No invitation rate limits

- Phase 3 does not add invitation-specific rate limits.
- The existing login limiter (5/email/15min) does not apply to the invitation codepath — invitations are generated by admins via the API, not by email-based login requests.
- If abuse emerges, a per-admin or per-invitee limiter can be added later (one file change in [rate-limit.ts](../../../cis-deal-room/src/lib/auth/rate-limit.ts)).

---

## 4. Upload-batch notification

### New route

`POST /api/workspaces/[id]/notify-upload-batch`

**Body:**
```ts
{ folderId: string (uuid), fileIds: string[] (uuid[]) }
```

**Auth:** `requireFolderAccess(folderId, 'upload')` — the caller must be someone who just uploaded.

### Server logic

1. Resolve all participants with **download** access to `folderId` (via `folder_access` ∩ role filter).
2. Exclude the caller from the recipient list (uploader doesn't notify themselves).
3. Fetch the file rows by `fileIds` to get names/sizes for the email body.
4. Send one `UploadBatchNotificationEmail` per recipient listing the batch.
5. Write one `files_notified_batch` activity-log row with `{ folderId, fileIds, recipientCount }` metadata.
6. Individual email send failures log a warning but do not fail the request — the upload itself has already succeeded.

### Client contract

- After the UploadModal's final file confirms successfully, the modal makes **one** call to this endpoint with the accumulated `fileIds`.
- If the modal was closed mid-batch or the network dropped, no notification fires. Acceptable v1 trade-off — notification is a nice-to-have on top of a successful upload.

### Why batch over per-file

NOTF-01 literal text says "Email notification sent … when a new file is uploaded." The base spec already committed to "bulk upload = one email per participant, not one per file" to avoid 50-email bursts from a 10-file upload. This endpoint is how that commitment is honored.

---

## 5. Email service

- Extend the existing Resend stub module in [cis-deal-room/src/lib/email/](../../../cis-deal-room/src/lib/email).
- Two new templates:
  - **`InvitationEmail`** — workspace name, assigned role (with Rep naming resolved), magic link, sender name.
  - **`UploadBatchNotificationEmail`** — workspace name, folder name, list of `{ fileName, sizeBytes }`, link back to the deal.
- Stub behavior unchanged: when `RESEND_API_KEY` is absent, log the payload to console and return `{ id: 'stub' }`. The entire upload + invite flow remains exercisable without credentials.

### Rep role naming in the invitation email

Resolve role label at send time from the workspace's `cisAdvisorySide`:
- `buyer_side` → external rep stored as `seller_rep` → email shows **"Seller Rep"**.
- `seller_side` → external rep stored as `buyer_rep` → email shows **"Buyer Rep"**.

---

## 6. IDOR enforcement retrofit

Phase 1's `requireDealAccess` and `requireFolderAccess` stubs become real. Applied at these sites:

### `requireDealAccess(workspaceId, session)`
Confirms an active `workspace_participants` row for this specific workspace. `session.isAdmin` bypasses.

Applied on:
- `GET /api/workspaces/[id]`
- `GET /api/workspaces/[id]/folders` (+ per-row filter for non-admins)
- `GET /api/workspaces/[id]/participants`
- `GET /api/workspaces/[id]/activity`

### `requireFolderAccess(folderId, session, 'upload' | 'download')`
Checks a `folder_access` row exists for this (user, folder), then resolves the role's permission against the action. `session.isAdmin` bypasses.

Applied on:
- `GET /api/files?folderId=` → `'download'`
- `POST /api/files/presign-upload` → `'upload'`
- `POST /api/files/confirm` → `'upload'` **(critical retrofit)**
- `GET /api/files/[id]/presign-download` → `'download'`
- `POST /api/workspaces/[id]/notify-upload-batch` → `'upload'`

### Admin-only (no access helper needed)
- `POST /api/workspaces` (already)
- `PATCH /api/workspaces/[id]/status` (already)
- `POST/PATCH/DELETE` folder routes
- `DELETE /api/files/[id]` (already)
- `POST/PATCH/DELETE` participant routes

### Folder listing filter

`GET /api/workspaces/[id]/folders` returns:
- All folders (admin).
- Only folders with a matching `folder_access` row (non-admin participants).

Filter applied in the DAL, not the route, so other callers get the same behavior.

### Critical retrofit: `/api/files/confirm`

Today `/api/files/confirm` has no folder-access check. Without it, a participant with upload access to Folder A could confirm a file into Folder B by submitting a forged request. The retrofit closes this gap.

---

## 7. Session invalidation on participant removal

**No session row manipulation.** When a participant is removed:
- The `workspace_participants` row is deleted.
- The `folder_access` rows cascade-delete automatically (their `participant_id` FK uses `onDelete: 'cascade'`).
- `requireDealAccess(workspaceId)` on any subsequent request from that user returns 403.
- The user's session stays valid for any other deals they still belong to.

This is a deliberate decoupling: **sessions prove identity; `workspace_participants` rows prove authorization**. The spec's original "delete all sessions" language is reinterpreted as "access is immediately invalidated" — which this design satisfies without logging the user out of unrelated deals.

### Sessions are not touched

- We do not delete session rows on removal.
- We do not add a workspace_id column to sessions.
- We do not implement any per-workspace session concept.

If a future threat model requires stronger revocation, a single-line `DELETE FROM sessions WHERE user_id = X` can be added to the DELETE participant handler. Not needed for v1.

---

## 8. Activity log writes (new for Phase 3)

New actions, all using the existing `logActivity()` DAL:

| Action | Target | Metadata |
|---|---|---|
| `participant_invited` | `participant` (pid) | `{ email, role, folderIds[] }` |
| `participant_updated` | `participant` (pid) | `{ beforeRole, afterRole, beforeFolderIds, afterFolderIds }` |
| `participant_removed` | `participant` (pid) | `{ email, role }` |
| `files_notified_batch` | `folder` (folderId) | `{ fileIds[], recipientCount }` |

Writes are in the same transaction as the data mutation wherever the DAL currently uses a transaction; otherwise best-effort after the mutation succeeds (same pattern as Phase 2).

---

## 9. Out of scope / explicit non-goals

- **Activity feed UI** — Phase 4 (ACTY-02)
- **Deal list rich cards** (doc count, participant count, last activity) — Phase 4
- **Notification digest toggle** and `notification_queue` — Phase 4
- **In-flight presigned URL revocation** on access change — v1 limitation, 15-min window
- **Invitation rate limiting** — not added; trust admins
- **User "disabled" flag / global deactivation** — removal only scopes to a workspace
- **Per-workspace session model** — not added
- **WebSocket / realtime participant list** — static-on-navigate in Phase 3; Phase 4 polling feed may update adjacent
- **Invitation resend as a distinct operation** — v1 pattern is "re-invite": POST `/participants` for an already-invited user generates a fresh magic-link token and re-sends the email, leaving the existing `workspace_participants` row in place

---

## 10. Implementation slicing

### Plan 3.1 — Backend & IDOR foundation

**Deliverables:**
- Schema migration: add `purpose`, `redirect_to` columns to `magic_link_tokens`
- DAL:
  - Participant CRUD (`getParticipants`, `inviteParticipant`, `updateParticipant`, `removeParticipant`)
  - Real `requireDealAccess`, `requireFolderAccess`
  - Permission-matrix resolver (role + action → boolean)
  - Folder-filter for non-admins
  - Session helper unchanged
- API routes:
  - `GET/POST /api/workspaces/[id]/participants`
  - `PATCH/DELETE /api/workspaces/[id]/participants/[pid]`
  - `GET /api/workspaces/[id]/activity`
  - `POST /api/workspaces/[id]/notify-upload-batch`
- `/api/auth/verify` branch for `purpose = 'invitation'`
- Email service: `InvitationEmail`, `UploadBatchNotificationEmail`
- IDOR retrofit of every Phase 1/2 route listed in §6
- Unit tests (DAL + route)

**Verifiable without UI:** full curl + Vitest coverage.

### Plan 3.2 — UI & end-to-end

**Deliverables:**
- Shared Invite/Edit participant modal
- `ParticipantList` component in RightPanel
- Admin-only render gates for Invite/Edit/Remove controls
- UploadModal update: call `notify-upload-batch` after final confirm
- End-to-end human-verify checkpoint (invite → receive link → accept → upload → verify notification email + participant list)

**Depends on:** Plan 3.1 (backend contracts).

---

*Design approved 2026-04-13. Proceed to implementation via writing-plans skill, starting with Plan 3.1.*
