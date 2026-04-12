# Requirements: CIS Deal Room

**Defined:** 2026-04-12
**Core Value:** One organized, permission-controlled workspace per deal -- so both CIS Partners and clients always know where to find documents and exactly what happened to them.

## v1 Requirements

### Authentication

- [x] **AUTH-01**: User can authenticate via magic link sent to their email address (no passwords)
- [x] **AUTH-02**: Magic link tokens expire after 10 minutes, are single-use, and are stored as SHA-256 hashes in the database
- [x] **AUTH-03**: Authenticated session persists for 24 hours of inactivity; re-authentication required after expiry
- [ ] **AUTH-04**: Admin can revoke any participant's access at any time, immediately invalidating active sessions
- [x] **AUTH-05**: Re-authentication uses the same magic link flow (enter email -> receive link -> click to access)
- [x] **AUTH-06**: Rate limiting enforced on authentication endpoints to prevent brute force and token enumeration

### Workspaces

- [x] **WORK-01**: Admin can create a deal workspace with: codename, client name (admin-visible only), initial status, and CIS's advisory side (buyer-side or seller-side) -- the CIS side field is required and determines which Rep role is available for external counterparty contacts throughout the deal
- [x] **WORK-02**: Deal list home screen shows all workspaces the authenticated user has access to (Admin sees all; other roles see only their assigned workspaces)
- [x] **WORK-03**: Deal status lifecycle supports: Engagement, Active DD, IOI Stage, Closing, Closed, Archived
- [ ] **WORK-04**: Admin can search and filter deal list by deal name or status
- [ ] **WORK-05**: Each deal workspace requires at least one active Client participant; system warns when none exists and enforces this constraint on deal status transitions

### Folders

- [x] **FOLD-01**: New workspace automatically creates 8 default folders: Financials, Legal, Operations, Human Capital, Tax, Technology, Deal Documents, Miscellaneous
- [x] **FOLD-02**: Admin can rename, add, and delete folders at any time
- [x] **FOLD-03**: Folder-level access control -- each participant can be granted or restricted from specific folders independently

### Files

- [ ] **FILE-01**: User can upload files via drag-and-drop interface with folder destination selector
- [ ] **FILE-02**: Bulk upload supported -- multiple files in a single operation
- [ ] **FILE-03**: Accepted file types: PDF, DOCX, XLSX, PPTX, CSV, JPG, PNG, MP4; maximum 500MB per file
- [ ] **FILE-04**: Files stored in AWS S3 with AES-256 server-side encryption; all file transfers over HTTPS; presigned URLs expire after 15 minutes
- [ ] **FILE-05**: File versioning -- re-uploading a file with the same name creates a new version; previous versions remain accessible
- [ ] **FILE-06**: Duplicate detection -- system warns if a file with the same name already exists in the target folder before upload completes
- [ ] **FILE-07**: User can download files via time-limited presigned S3 URLs; each download creates an activity log entry
- [ ] **FILE-08**: File list displays: filename, file size, upload date, uploaded by, and new/viewed status indicator

### Participants

- [ ] **PART-01**: Admin can invite a participant by email address, assigning a role and per-folder access checkboxes
- [ ] **PART-02**: Invited participant receives an email with a magic link granting access to the specific workspace
- [ ] **PART-03**: Six roles enforced with distinct permissions:
  - **Admin** -- full access: create/delete workspaces, invite/remove participants, manage folders, upload/download/delete files, view all activity
  - **CIS Team** -- upload, download, view activity for assigned folders; cannot delete workspace or manage participants
  - **Client** -- upload and download in assigned folders; view own activity only
  - **Counsel** -- upload and download in assigned folders; view own activity only
  - **Buyer Rep** or **Seller Rep** (mutually exclusive per deal, determined by CIS's advisory side at workspace creation -- if CIS is seller-side, Buyer Rep is available; if CIS is buyer-side, Seller Rep is available) -- download only in assigned folders; view own activity only
  - **View Only** -- view and download only; no upload capability
- [ ] **PART-04**: Admin can edit any participant's role and folder access after initial invitation
- [ ] **PART-05**: Admin can remove a participant -- immediately revokes access and invalidates all active sessions for that participant
- [ ] **PART-06**: Participant list displays name, role, email address, and online/offline status
- [ ] **PART-07**: Multiple users can hold the Client role in the same workspace (e.g., Founder, CFO, and General Counsel from the client organization can all be added as Clients)

### Activity Log

- [x] **ACTY-01**: All significant actions logged immutably (append-only, no edits or deletions): file uploaded, file downloaded, file deleted, folder created, folder renamed, participant invited, participant removed, access revoked, status changed
- [ ] **ACTY-02**: Activity feed displayed in reverse chronological order in the workspace right panel, showing user, action, file/folder name, and timestamp

### Notifications

- [ ] **NOTF-01**: Email notification sent to participants with folder access when a new file is uploaded to that folder
- [ ] **NOTF-02**: Email notification sent when a participant is invited to a new deal workspace
- [ ] **NOTF-03**: Per-user digest option -- participant can configure notifications as real-time or batched into a daily summary email

### Interface

- [ ] **UI-01**: Deal list home screen with card layout showing deal name, status badge, document count, participant count, last activity timestamp; create new workspace button; search and filter controls
- [x] **UI-02**: Three-panel workspace layout -- folder sidebar (240px), file list (flex-1), activity + participants panel (280px)
- [ ] **UI-03**: Upload modal with drag-and-drop zone, folder destination selector, file type and size validation, progress indicator
- [ ] **UI-04**: Invite modal with email field, role dropdown (showing contextually correct Rep role based on deal's CIS side), and folder access checkboxes
- [x] **UI-05**: Login screen with email input, magic link confirmation state, and CIS Partners branding
- [ ] **UI-06**: Responsive behavior -- folder sidebar collapses to top-level dropdown, right panel becomes expandable drawer on tablet (768px); single-column layout on mobile (375px)
- [ ] **UI-07**: CIS brand applied throughout -- #E10600 primary accent, #000000/#0D0D0D base, DM Sans UI font, JetBrains Mono for data values (file sizes, timestamps, IDs)

## v2 Requirements

### Document Experience

- **DOC-01**: In-browser document preview (PDF, images, Office files -- no download required to review)
- **DOC-02**: Q&A thread per document or folder -- structured question/response workflow
- **DOC-03**: Document request checklist -- track outstanding items with status per folder

### Download & Export

- **DL-01**: Bulk download -- select multiple files and download as ZIP archive
- **DL-02**: Full workspace export for deal close or archiving

### Notifications

- **NOTF-04**: In-app notification center (v1 is email-only)
- **NOTF-05**: Notification preferences UI within the portal

## Out of Scope

| Feature | Reason |
|---------|--------|
| DRM / watermarking / server-side document rendering | Not a VDR -- explicitly excluded in product spec |
| In-app notification center | Email only in v1; deferred to v2 |
| Nested subfolders | Flat structure keeps navigation simple; excluded in spec |
| Tasks, timelines, workflow automation | Not a project management tool |
| OAuth / password authentication | Magic links only for v1 |
| Mobile native app | Web-first; mobile web via responsive design |
| Full-text document search | High complexity; deferred to v2 |
| Automatic virus/malware scanning | Infrastructure complexity; deferred post-v1 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUTH-01 | Phase 1: Foundation | Complete |
| AUTH-02 | Phase 1: Foundation | Complete |
| AUTH-03 | Phase 1: Foundation | Complete |
| AUTH-04 | Phase 3: Collaboration | Pending |
| AUTH-05 | Phase 1: Foundation | Complete |
| AUTH-06 | Phase 1: Foundation | Complete |
| WORK-01 | Phase 1: Foundation | Complete |
| WORK-02 | Phase 1: Foundation | Complete |
| WORK-03 | Phase 1: Foundation | Complete |
| WORK-04 | Phase 4: Interface and Polish | Pending |
| WORK-05 | Phase 4: Interface and Polish | Pending |
| FOLD-01 | Phase 1: Foundation | Complete |
| FOLD-02 | Phase 1: Foundation | Complete |
| FOLD-03 | Phase 1: Foundation | Complete |
| FILE-01 | Phase 2: File Operations | Pending |
| FILE-02 | Phase 2: File Operations | Pending |
| FILE-03 | Phase 2: File Operations | Pending |
| FILE-04 | Phase 2: File Operations | Pending |
| FILE-05 | Phase 2: File Operations | Pending |
| FILE-06 | Phase 2: File Operations | Pending |
| FILE-07 | Phase 2: File Operations | Pending |
| FILE-08 | Phase 2: File Operations | Pending |
| PART-01 | Phase 3: Collaboration | Pending |
| PART-02 | Phase 3: Collaboration | Pending |
| PART-03 | Phase 3: Collaboration | Pending |
| PART-04 | Phase 3: Collaboration | Pending |
| PART-05 | Phase 3: Collaboration | Pending |
| PART-06 | Phase 3: Collaboration | Pending |
| PART-07 | Phase 3: Collaboration | Pending |
| ACTY-01 | Phase 1: Foundation | Complete |
| ACTY-02 | Phase 4: Interface and Polish | Pending |
| NOTF-01 | Phase 3: Collaboration | Pending |
| NOTF-02 | Phase 3: Collaboration | Pending |
| NOTF-03 | Phase 4: Interface and Polish | Pending |
| UI-01 | Phase 4: Interface and Polish | Pending |
| UI-02 | Phase 1: Foundation | Complete |
| UI-03 | Phase 2: File Operations | Pending |
| UI-04 | Phase 3: Collaboration | Pending |
| UI-05 | Phase 1: Foundation | Complete |
| UI-06 | Phase 4: Interface and Polish | Pending |
| UI-07 | Phase 1: Foundation | Pending |

**Coverage:**
- v1 requirements: 41 total
- Mapped to phases: 41
- Unmapped: 0

**By Phase:**
- Phase 1 (Foundation): 15 requirements
- Phase 2 (File Operations): 9 requirements
- Phase 3 (Collaboration): 11 requirements
- Phase 4 (Interface and Polish): 6 requirements

---
*Requirements defined: 2026-04-12*
*Last updated: 2026-04-12 after roadmap creation*
