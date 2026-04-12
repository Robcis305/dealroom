# CIS Deal Room

## What This Is

CIS Deal Room is a secure, per-engagement document sharing portal built for CIS Partners, LLC. Each active deal gets its own workspace where CIS Partners and clients can upload, organize, and track documents throughout the engagement lifecycle. It replaces the current workflow of exchanging deal documents via email attachments, Slack messages, and ad hoc file sharing.

## Core Value

One organized, permission-controlled workspace per deal — so both CIS Partners and clients always know where to find documents and exactly what happened to them.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Passwordless magic link authentication with 24-hour sessions
- [ ] Role-based access (Admin, CIS Team, Client, Counsel, Buyer Rep, View Only) with folder-level permission control
- [ ] Deal workspace creation and management — codename, client name (admin-only), status lifecycle
- [ ] Default folder structure auto-created per deal (Financials, Legal, Operations, Human Capital, Tax, Technology, Deal Documents, Miscellaneous)
- [ ] File upload with drag-and-drop, bulk support, duplicate detection, and file versioning
- [ ] File download via presigned S3 URLs (15-minute expiry)
- [ ] Accepted file types: PDF, DOCX, XLSX, PPTX, CSV, JPG, PNG, MP4 (max 500MB)
- [ ] Immutable activity log — every upload, download, invite, folder action recorded
- [ ] Participant management — invite by email + role + folder access, revoke access instantly
- [ ] Email notifications via Resend — new file upload alerts and deal invitations
- [ ] Deal list home screen — card view with status, doc count, participant count, last activity
- [ ] Three-panel workspace layout: folder sidebar / file list / activity+participants panel
- [ ] Admin can create, rename, and delete folders
- [ ] Search/filter files within folders
- [ ] Responsive behavior: three-panel collapses to single-column on tablet/mobile
- [ ] CIS Partners branded experience — dark professional aesthetic, brand colors #E10600 / #000000, DM Sans font

### Out of Scope

- DRM, watermarking, server-side document rendering — not a virtual data room
- In-app notification center — email only in v1
- Tasks, timelines, or workflow automation — not a project management tool
- Nested subfolders — flat folder structure only in v1
- OAuth login — magic links only
- Mobile native app — web-first

## Context

- **Live deal in flight:** There is an active engagement that needs this running. Auth and workspace access are the highest-leverage first delivery.
- **Design reference:** Prototype at `cis-deal-portal-prototype.jsx` establishes the three-panel layout, component structure, and interaction patterns. Implementation uses this as the visual reference but replaces the blue (#2563EB) accent with CIS brand red (#E10600) per confirmed brand colors.
- **Brand colors confirmed:** Red #E10600, Black #000000, DM Sans (UI), JetBrains Mono (data values).
- **Spec document:** Full product requirements in `cis-deal-room-build-spec.pdf` — covers data model, security requirements, and file upload/download flow in detail.
- **Design system:** Persisted to `design-system/cis-deal-room/MASTER.md` — reference for all component styling decisions.

## Constraints

- **Stack:** Next.js (App Router) + TypeScript + Tailwind CSS — defined in spec, no deviation
- **Auth:** Magic link only via Resend — no passwords, no OAuth in v1
- **Storage:** AWS S3 with AES-256 server-side encryption, presigned URLs (15-min expiry)
- **Database:** PostgreSQL via Supabase or Neon — UUID PKs, append-only activity log
- **Hosting:** Vercel (frontend) + AWS S3 (file storage)
- **Security:** All file ops through authenticated API — no direct S3 access, HTTPS only, CORS locked to portal domain
- **File limit:** 500MB per file max

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Magic links over password auth | No accounts to manage, frictionless for deal participants who join once | — Pending |
| Presigned URLs for file transfer | Files never touch the app server — direct client↔S3, secure, scalable | — Pending |
| Flat folder structure (no subfolders) | Keeps navigation simple; the prototype confirms this works at deal scale | — Pending |
| Client name visible to Admin only | Protects confidential deal identity from non-admin participants | — Pending |
| Append-only activity log | Audit integrity — once logged, cannot be edited or deleted | — Pending |
| Brand red #E10600 as primary accent | Confirmed CIS Partners brand color — replaces blue from original prototype | — Pending |

---
*Last updated: 2026-04-12 after initialization*
