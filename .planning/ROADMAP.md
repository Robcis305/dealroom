# Roadmap: CIS Deal Room

## Overview

CIS Deal Room ships in four phases following the dependency chain: authentication and deal structure first (unblocking the live deal), then file operations (the core value), then multi-user collaboration (making it a deal room), then interface polish (responsive design, activity feed UI, search). Security patterns -- IDOR prevention, token replay protection, defense-in-depth authorization -- are established in Phase 1 and inherited by every subsequent phase. Activity logging writes to the database from Phase 1 even though the feed UI ships in Phase 4.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3, 4): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Foundation** - Auth, deal/folder data model, security patterns, workspace shell
- [ ] **Phase 2: File Operations** - Upload, download, versioning, duplicate detection via presigned S3 URLs
- [ ] **Phase 3: Collaboration** - Participant management, invitations, role enforcement, email notifications
- [ ] **Phase 4: Interface and Polish** - Deal list cards, activity feed UI, responsive layout, search/filter, digest notifications

## Phase Details

### Phase 1: Foundation
**Goal**: A single admin can authenticate via magic link, create a deal workspace with default folders, and navigate the three-panel layout -- with all security patterns (authorization utilities, token handling, S3 bucket config) established for every subsequent phase to inherit.
**Depends on**: Nothing (first phase)
**Requirements**: AUTH-01, AUTH-02, AUTH-03, AUTH-05, AUTH-06, WORK-01, WORK-02, WORK-03, FOLD-01, FOLD-02, FOLD-03, ACTY-01, UI-02, UI-05, UI-07
**Success Criteria** (what must be TRUE):
  1. User can enter their email on the login screen, receive a magic link, click it, and land in the deal list -- with the link expiring after 10 minutes and becoming single-use
  2. Authenticated session persists for 24 hours of inactivity; expired sessions redirect to login with the same magic link re-auth flow
  3. Admin can create a new deal workspace (codename, client name, CIS advisory side) and the 8 default due diligence folders are auto-created
  4. Admin can rename, add, and delete folders within a workspace, and folder-level access control data model is in place
  5. Three-panel workspace layout renders (folder sidebar, file list area, right panel) with CIS brand styling (#E10600 accent, DM Sans font, dark aesthetic) and the login screen displays CIS Partners branding
**Plans**: 4 plans

Plans:
- [ ] 01-01-PLAN.md -- Bootstrap Next.js project, Drizzle schema (8 tables), auth lib (tokens, session, rate-limit), Wave 0 test stubs (9 files incl. verify route stub)
- [ ] 01-02-PLAN.md -- Auth API routes, workspace/folder API routes, full DAL (verifySession, workspaces, folders, activity), access stubs (requireDealAccess/requireFolderAccess), S3 client stub
- [ ] 01-03-PLAN.md -- Tailwind brand config, UI primitives (Button, Input, Modal, Badge), login screen and auth verify page
- [ ] 01-04-PLAN.md -- Workspace shell (3-panel layout, folder sidebar, deal overview), deal list, NewDealModal, human-verify checkpoint

### Phase 2: File Operations
**Goal**: Users can upload, download, and manage files within deal folders -- the core value proposition of the platform -- with presigned S3 URLs ensuring files never transit through the app server, and every file action logged to the activity table.
**Depends on**: Phase 1 (auth, deal/folder model, security utilities)
**Requirements**: FILE-01, FILE-02, FILE-03, FILE-04, FILE-05, FILE-06, FILE-07, FILE-08, UI-03
**Success Criteria** (what must be TRUE):
  1. User can drag-and-drop one or multiple files into the upload modal, select a target folder, see type/size validation and progress, and have files land in S3 with AES-256 encryption via presigned URLs
  2. User can download a file via a time-limited presigned URL (15-minute expiry) and each download is recorded in the activity log
  3. Re-uploading a file with an existing name triggers a duplicate warning and creates a new version; previous versions remain accessible
  4. File list displays filename, size, upload date, uploader, and new/viewed status for each file in the selected folder
**Plans**: TBD

Plans:
- [ ] 02-01: TBD
- [ ] 02-02: TBD

### Phase 3: Collaboration
**Goal**: Multiple participants can be invited to a deal workspace with specific roles and folder-level permissions, transforming the single-admin file store into a multi-user deal room with email-driven onboarding and instant access revocation.
**Depends on**: Phase 2 (file operations that participants will use)
**Requirements**: AUTH-04, PART-01, PART-02, PART-03, PART-04, PART-05, PART-06, PART-07, NOTF-01, NOTF-02, UI-04
**Success Criteria** (what must be TRUE):
  1. Admin can invite a participant by email, assigning one of the six roles (with contextually correct Rep role based on deal's CIS advisory side) and per-folder access checkboxes via the invite modal
  2. Invited participant receives an email with a magic link, clicks it, and lands in the workspace seeing only their permitted folders with role-appropriate capabilities (upload/download/view per PART-03 permission matrix)
  3. Admin can edit a participant's role and folder access after invitation, remove a participant entirely, and removal immediately invalidates all active sessions for that participant
  4. Participant list displays name, role, email, and online/offline status; multiple users can hold the Client role in the same workspace
  5. Email notifications fire when a new file is uploaded to a folder (sent to participants with access) and when a participant is invited to a workspace
**Plans**: TBD

Plans:
- [ ] 03-01: TBD
- [ ] 03-02: TBD

### Phase 4: Interface and Polish
**Goal**: The complete, polished user experience -- deal list home screen with rich metadata cards, visible activity feed in the workspace, responsive layout that works on tablet and mobile, and remaining workflow refinements.
**Depends on**: Phase 3 (participant data for cards, activity data for feed)
**Requirements**: WORK-04, WORK-05, ACTY-02, NOTF-03, UI-01, UI-06
**Success Criteria** (what must be TRUE):
  1. Deal list home screen shows card layout with deal name, status badge, document count, participant count, and last activity timestamp; admin can search and filter by name or status
  2. Activity feed in the workspace right panel displays all logged events (uploads, downloads, invites, folder actions, status changes) in reverse chronological order with user, action, target, and timestamp
  3. Three-panel layout collapses gracefully: folder sidebar becomes dropdown on tablet (768px), right panel becomes expandable drawer, single-column layout on mobile (375px)
  4. Deal workspace enforces at least one active Client participant and warns when none exists; per-user notification digest option allows batching alerts into a daily summary email
**Plans**: TBD

Plans:
- [ ] 04-01: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 2/4 | In Progress|  |
| 2. File Operations | 0/2 | Not started | - |
| 3. Collaboration | 0/2 | Not started | - |
| 4. Interface and Polish | 0/1 | Not started | - |
