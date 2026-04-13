# CIS Deal Room — Full Build Design
**Date:** 2026-04-13
**Status:** Approved
**Scope:** Phases 2–4 (Phase 1 complete)

---

## 1. Context

CIS Deal Room is a secure, per-engagement document sharing portal for CIS Partners, LLC. Each active deal gets its own workspace where CIS Partners and clients can upload, organize, and track documents throughout the engagement lifecycle.

**Phase 1 is complete** and delivered:
- Next.js 15 App Router + TypeScript + Tailwind v4 + Drizzle + Neon PostgreSQL
- Full DB schema: 8 tables (users, sessions, magic_link_tokens, workspaces, workspace_participants, folders, folder_access, files, activity_logs)
- Magic link auth with iron-session database sessions, rate limiting
- API routes: `/api/auth/*`, `/api/workspaces/*`, `/api/folders/*`
- DAL pattern: `verifySession()` called at every data boundary
- Security stubs: `requireDealAccess`, `requireFolderAccess` — wired but no-ops until Phase 3
- S3 singleton (`getS3Client()` + `S3_BUCKET`) and Resend email template — stubs awaiting credentials
- Three-panel workspace shell, deal list, folder sidebar, login/verify screens, UI primitives

**This document covers the design for Phases 2, 3, and 4.**

---

## 2. Build Strategy

**Approach: Sequential GSD execution** — Phase 2 → Phase 3 → Phase 4 in strict order. Each phase is planned, executed, and verified before the next starts.

**External service stubs** (neither S3 nor Resend credentials are configured yet):
- S3: if `AWS_S3_BUCKET` is unset, presign-upload returns a fake s3Key, confirm route skips the S3 object check. All file records still written to DB.
- Resend: if `RESEND_API_KEY` is absent, `sendEmail()` logs the payload to console and returns `{ id: 'stub' }`. Real wiring is a one-line env var addition at deploy time.

---

## 3. Architecture

### Layered on top of Phase 1 — minimal schema additions in Phase 4 only

Phase 4 adds two items: `notificationDigest` boolean column to `users` table, and a new `notification_queue` table (`id`, `userId`, `workspaceId`, `fileId`, `createdAt`). All other phases use the existing schema as-is.

```
Phase 2: File Operations
  ├── API: /api/files/presign-upload, /api/files/confirm,
  │        /api/files/[id]/presign-download, /api/files/[id] (DELETE)
  ├── DAL: getFilesForFolder, createFile, deleteFile, getFileById
  ├── UI:  FileList (center panel), UploadModal (drag-drop + progress)
  └── Stubs: S3 ops → mock keys when AWS_S3_BUCKET unset

Phase 3: Collaboration
  ├── API: /api/workspaces/[id]/participants (GET/POST/PATCH/DELETE)
  │        /api/workspaces/[id]/activity (GET)
  ├── DAL: getParticipants, inviteParticipant, updateParticipant, removeParticipant
  ├── Auth: requireDealAccess + requireFolderAccess filled in (real IDOR enforcement)
  ├── UI:  InviteModal, ParticipantList, ActivityFeed in RightPanel
  ├── Email: invitation + upload notification via Resend (console stub when key absent)
  └── Activity: all write ops emit logActivity() (schema already in place)

Phase 4: Interface & Polish
  ├── Deal list: doc count, participant count, last activity from DB
  ├── File versioning UI: version chip, versions drawer, per-version download
  ├── Responsive: sidebar dropdown ≤768px, right panel drawer on mobile
  ├── Search: client-side filename filter within folder
  └── Notification digest: user preference toggle, notification_queue table, daily send
```

### Critical path — file upload

```
User drops file → UploadModal
  → POST /api/files/presign-upload  (auth + folder permission check)
  → API returns { presignedUrl, s3Key, fileId }
  → Browser PUTs directly to S3 via presignedUrl (XHR for upload progress)
  → POST /api/files/confirm { fileId }  on XHR complete
  → API creates files row + logActivity('uploaded')
  → (Phase 3) Email notification to participants with folder access
```

### Critical path — file download

```
User clicks download → GET /api/files/[id]/presign-download
  → Auth + folder download permission check
  → API generates GetObject presigned URL (15-min expiry)
  → Returns URL → browser initiates download
  → logActivity('downloaded')
```

---

## 4. Phase 2 — File Operations

### API Routes

| Route | Method | Description |
|---|---|---|
| `/api/files/presign-upload` | POST | Validates type/size, checks folder upload permission, returns presigned PutObject URL + s3Key |
| `/api/files/confirm` | POST | Marks file confirmed after S3 PUT completes, logs `uploaded` activity |
| `/api/files/[id]/presign-download` | GET | Checks folder download permission, generates GetObject presigned URL (15-min), logs `downloaded` |
| `/api/files/[id]` | DELETE | Admin only — deletes S3 object + DB row, logs `deleted` |

### Upload Modal

- `react-dropzone` for drag-and-drop and file picker
- Accepted types enforced client-side and server-side: PDF, DOCX, XLSX, PPTX, CSV, JPG, PNG, MP4
- Max 500MB per file enforced both sides
- Folder selector pre-populated with current folder, switchable via dropdown
- Per-file progress bar via `XMLHttpRequest.upload.onprogress` (fetch does not expose upload progress)
- Bulk upload: files queued and uploaded sequentially
- **Duplicate detection**: before requesting presign, API checks if filename exists in folder — returns `{ duplicate: true, existingFileId }` — modal shows "Upload as new version" / "Cancel" choice

### File Versioning

- `files.version` integer column (already in schema)
- Re-upload of same filename: `version` increments, previous row remains in DB
- File list shows latest version by default; version history via "vN" chip (Phase 4 UI)

### File List UI

- Replaces DealOverview in center panel when a folder is selected
- Columns: File | Size | Uploaded | By | Download button
- `NEW` badge on files uploaded since user's last session
- File type icon derived from `mime_type`
- Download triggers presign-download inline — no page navigation

### Stub Strategy

- `getS3Client()` already exists
- If `AWS_S3_BUCKET` unset: presign-upload returns `{ presignedUrl: null, s3Key: 'stub/fake-key-{uuid}', fileId }`, confirm skips S3 check
- Download stub returns a placeholder response
- All DB records written regardless — real S3 wiring is a one-line env var at deploy time

### Tests

- Unit: type/size validation, duplicate detection, version increment logic
- Unit: presign-download permission enforcement
- Integration: upload → confirm → download → activity log sequence against test DB

---

## 5. Phase 3 — Collaboration

### Participant Invitation Flow

1. Admin opens InviteModal → email + role + folder access checkboxes
2. `POST /api/workspaces/[id]/participants` → creates/finds user by email, creates `workspace_participants` row (status: `invited`), creates `folder_access` rows
3. Resend sends invitation email with magic link pre-authenticated to the workspace
4. Invitee clicks link → lands in workspace, `status` → `active`, `activatedAt` set

### API Routes

| Route | Method | Description |
|---|---|---|
| `/api/workspaces/[id]/participants` | GET | List participants with roles + folder access |
| `/api/workspaces/[id]/participants` | POST | Invite participant — user + participant + folder_access rows + email |
| `/api/workspaces/[id]/participants/[pid]` | PATCH | Edit role or folder access (admin only) |
| `/api/workspaces/[id]/participants/[pid]` | DELETE | Remove participant — deletes row, invalidates sessions |
| `/api/workspaces/[id]/activity` | GET | Paginated activity log, most recent first |

### IDOR Enforcement (filling Phase 1 stubs)

- `requireDealAccess(workspaceId, session)` — confirms active `workspace_participants` row for this specific workspace; `isAdmin` users bypass this check and have access to all workspaces
- `requireFolderAccess(folderId, session, 'upload' | 'download')` — checks `folder_access` row + role permission matrix
- Both called in every file API route and participant API route

### Permission Matrix

| Role | Upload | Download | Manage Participants | Manage Folders |
|---|---|---|---|---|
| Admin | ✓ all | ✓ all | ✓ | ✓ |
| CIS Team | ✓ all | ✓ all | — | — |
| Client | ✓ granted | ✓ granted | — | — |
| Counsel | ✓ granted | ✓ granted | — | — |
| Buyer Rep *(when sell-side)* | ✓ granted | ✓ granted | — | — |
| Seller Rep *(when buy-side)* | ✓ granted | ✓ granted | — | — |
| View Only | — | ✓ granted | — | — |

**Rep role naming logic:**
- `cis_advisory_side = 'buyer_side'` → CIS advises buyer → external rep is **Seller Rep** (`seller_rep`)
- `cis_advisory_side = 'seller_side'` → CIS advises seller → external rep is **Buyer Rep** (`buyer_rep`)
- Schema already has both `buyer_rep` and `seller_rep` enum values ✓
- InviteModal role dropdown renders the correct label based on workspace `cisAdvisorySide`
- `requireFolderAccess` grants upload + download to both rep variants in granted folders

### Activity Feed

- `GET /api/workspaces/[id]/activity` — paginated, most recent first
- Each entry: user display name + action + target name + relative timestamp
- Admin sees all events; non-admin sees only events where they are actor or target
- RightPanel polls every 30s (no WebSocket in v1)

### Participant List

- Name, role badge, email, online/offline indicator
- Online = `sessions.lastActiveAt` within last 5 minutes
- Admin sees Edit and Remove buttons per participant row

### Email Notifications

- Invitation email: magic link + workspace name + role (extends existing `MagicLinkEmail` template)
- Upload notification: one email per participant with access to the uploaded folder (bulk upload = one email per participant, not one per file)
- Stub: `RESEND_API_KEY` absent → log payload to console, return `{ id: 'stub' }`

### Session Invalidation on Removal

- `DELETE /participants/[pid]` → delete all sessions for that user
- They re-authenticate on next visit to any workspace they still have access to

---

## 6. Phase 4 — Interface & Polish

### Deal List Enhancements

- Doc count, participant count, last activity added as joined counts to `getWorkspacesForUser` DAL query — no new API route
- Client-side search/filter on deal name + status dropdown (list is fully loaded)
- Admin sees client name; all other roles see codename only (already enforced)

### File Versioning UI

- File rows with `version > 1` show a "vN" chip
- Clicking chip opens a versions drawer listing all versions with date + uploader
- Each version has its own download button

### File Search Within Folder

- Client-side substring filter on loaded file list, case-insensitive
- Input already exists in prototype — wire to filter state

### Responsive Layout

| Breakpoint | Behavior |
|---|---|
| ≥1024px | Full three-panel layout |
| 768–1023px | Folder sidebar → dropdown above file list; right panel → slide-in drawer |
| <768px | Single column; folder dropdown at top; right panel drawer only |

- Tailwind responsive prefixes (`md:`, `lg:`) — no JS layout switching

### Notification Digest

- `users` table gets `notificationDigest` boolean (default false)
- Avatar dropdown: "Email notifications: Instant / Daily digest" toggle
- Instant: call Resend immediately on upload/invite
- Digest: write to `notification_queue` table; Vercel cron sends daily summary at 8am ET

### Empty States + Error Handling

- Empty folder: "No files yet — upload the first one" + Upload button
- Empty deal list: "No deal rooms yet — create your first one"
- Upload error (wrong type, oversized): inline error below dropzone
- API errors: toast notifications via custom component using existing primitives
- No active Client participant warning banner (soft warning, not hard block)

---

## 7. Workspace Creation Enforcement

All four fields are **hard-required** at both form and API level. No workspace can be created without:

1. **Deal codename** — the workspace identifier (e.g. "Project Apollo")
2. **Client name** — visible to admin only after creation
3. **CIS advisory side** — explicit radio/segmented control: "Buy Side" / "Sell Side"
   - No pre-selected default — admin must make a conscious choice every time
   - Determines Rep role label (Buyer Rep / Seller Rep) for the lifetime of the workspace
4. **Deal status** — visible and selectable at creation (defaults to "Engagement" in UI but admin can change)

**Enforcement:**
- Create button disabled until all four fields have values (client-side)
- `POST /api/workspaces` Zod schema rejects any request missing `name`, `clientName`, or `cisAdvisorySide` with a 400 error
- No server-side default for `cisAdvisorySide` — omission is a hard error

---

## 8. Acceptance Criteria

The build is complete when all of the following are true:

- [ ] Admin cannot create a workspace without all four required fields (codename, client name, advisory side, status)
- [ ] Admin can upload files via drag-and-drop; files land in S3 with AES-256 encryption via presigned URLs (or stub when unconfigured)
- [ ] Re-uploading a file with an existing name triggers duplicate warning and creates a new version
- [ ] Users can download files via 15-minute presigned URLs; each download is logged
- [ ] Admin can invite a participant by email with role and per-folder access; participant receives magic link invitation email
- [ ] Invited participant clicks link and lands in workspace seeing only their permitted folders with role-appropriate capabilities
- [ ] Buyer Rep / Seller Rep role label is correct based on workspace's CIS advisory side; both variants get upload + download in granted folders
- [ ] Admin can edit participant role/folder access and remove participants; removal immediately invalidates sessions
- [ ] Activity feed displays all logged events in reverse chronological order in the RightPanel
- [ ] Deal list shows doc count, participant count, and last activity per workspace
- [ ] File list supports client-side search by filename
- [ ] Three-panel layout collapses gracefully at tablet (768px) and mobile breakpoints
- [ ] File versioning UI shows version chip and version history drawer for multi-version files
- [ ] All file operations and participant actions are logged to the activity table
- [ ] Email notifications fire for new file uploads and invitations (or log to console when Resend unconfigured)

---

*Design approved 2026-04-13. Proceed to implementation via writing-plans skill.*
