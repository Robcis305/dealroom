# Feature Landscape

**Domain:** Secure B2B Document Portal / Deal Room (M&A Advisory)
**Researched:** 2026-04-12
**Confidence:** MEDIUM (based on build spec + training data on VDR market; no live web verification available)

## Context: Where CIS Deal Room Sits

CIS Deal Room is **not** a full virtual data room. It sits in a deliberate gap between "email + Slack file sharing" (current state) and enterprise VDRs like Datasite/Intralinks ($15K-$100K+ per deal). The competitive frame is:

| Tier | Examples | Price Point | CIS Positioning |
|------|----------|-------------|-----------------|
| Ad hoc sharing | Email, Slack, Google Drive | Free | **Replacing this** |
| Lightweight portals | Box (branded portals), ShareFile, HighQ Lite | $50-500/mo | **Competing here** |
| Mid-market VDRs | Firmex, DealVDR, SecureDocs | $500-3K/deal | Adjacent, not competing |
| Enterprise VDRs | Datasite, Intralinks, Ansarada | $5K-100K+/deal | **Explicitly NOT this** |

This positioning means CIS does NOT need enterprise VDR features (DRM, watermarking, fence-view, AI redaction). It needs to be better-organized and more professional than Box/ShareFile while being dead simple for deal participants.

---

## Table Stakes

Features users expect. Missing = product feels incomplete or untrustworthy for professional M&A use.

### Authentication & Access Control

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Magic link auth (passwordless)** | Frictionless for deal participants who join once per engagement; no password fatigue | Medium | Spec-confirmed. Token expiry 10 min, session 24 hr. Must handle edge cases: expired links, re-auth flow, multiple devices |
| **Role-based access control (6 roles)** | M&A deals have distinct participant types with different trust levels; counsel sees different things than buyer reps | High | Admin, CIS Team, Client, Counsel, Buyer Rep, View Only. Most VDRs offer at minimum 3-4 role tiers |
| **Folder-level permissions** | Different DD categories contain different sensitivity levels; financials vs. deal docs have different audiences | High | Per-participant, per-folder grants (can_upload, can_download). This is the core security primitive |
| **Instant access revocation** | When a deal falls through or a participant is removed, access must stop immediately, not "eventually" | Medium | Must invalidate active sessions, not just future logins. Enterprise VDRs all do this in real-time |
| **Session expiry (24-hour inactivity)** | Prevents stale sessions on shared/public computers | Low | Standard JWT expiry pattern |

### Deal Workspace Management

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Deal creation with codename** | Every M&A deal uses a codename (Project Apollo, etc.) to protect client identity pre-close | Low | Standard in all VDRs. Codename is the public-facing identifier |
| **Client name (admin-only visibility)** | Non-admin participants should not see the real company name in early-stage deals | Low | Simple conditional rendering, but critical for confidentiality |
| **Deal status lifecycle** | Deals progress through stages; status communicates where things stand | Low | Engagement, Active DD, IOI Stage, Closing, Closed, Archived. Visual badge system |
| **Default folder structure (8 folders)** | Participants expect a familiar DD structure; reduces setup time per deal | Low | Financials, Legal, Operations, Human Capital, Tax, Technology, Deal Documents, Miscellaneous. Industry-standard categories |
| **Deal list with metadata** | Users need to see all their active deals at a glance with key stats | Medium | Card view with doc count, participant count, last activity. Every VDR has this |
| **Admin folder management** | Admins must be able to add, rename, delete folders as deal scope evolves | Low | Standard CRUD. Important: deleting a folder with files needs confirmation + cascade behavior |

### File Management

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Drag-and-drop upload** | Standard UX expectation since 2015. Users will bounce if they have to click through a file picker only | Medium | Must support folder target selection, progress indicator, error handling |
| **Bulk file upload** | Clients often dump 20-50 files at once during initial DD document collection | Medium | Parallel presigned URL generation, progress tracking per file, partial failure handling |
| **Secure file download (presigned URLs)** | Files must never be publicly accessible; every download goes through auth check + time-limited URL | Medium | S3 presigned URLs with 15-min expiry. This is the standard pattern for secure file delivery |
| **File metadata display** | Users need to know who uploaded what, when, and how large it is | Low | Name, size, upload date, uploaded by, MIME type. Standard in every file portal |
| **File versioning** | Re-uploading a corrected financial statement should not lose the original; auditors need version history | Medium | Same-name re-upload creates new version. Must show version history, allow downloading prior versions |
| **Duplicate detection** | Warns when uploading a file that already exists in the target folder; prevents accidental overwrites | Low | Filename match in target folder, with "replace" or "keep both" options |
| **File type validation** | Accepting arbitrary files is a security risk; PDF/DOCX/XLSX/PPTX/CSV/JPG/PNG/MP4 covers 99% of M&A docs | Low | Server-side MIME validation, not just extension checking. Max 500MB |
| **Search/filter within folders** | With 50+ files in Financials, users need to find specific documents fast | Medium | Filename search, filter by type. Full-text search is NOT expected in v1 (that's enterprise VDR territory) |

### Activity & Audit

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Immutable activity log** | Audit trail is non-negotiable for M&A. "Who downloaded the financials?" must be answerable | Medium | Append-only. Upload, download, delete, invite, remove, folder ops. Every VDR from Firmex up has this |
| **Activity feed in workspace** | Participants need to see recent activity without switching screens | Low | Reverse chronological in right panel. Filterable by event type is a nice-to-have |
| **Per-action logging** | Every upload, download, view, delete, invite, removal, folder action must be captured | Medium | Covers the 8 event types in spec. Must include actor, target, timestamp, and context metadata |

### Participant Management

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Email-based invitation** | The standard way to add people to a deal; invite modal with email + role + folder access | Medium | Must generate magic link, send via Resend, handle invalid emails gracefully |
| **Role assignment at invite** | Admin decides what each participant can do at invite time | Low | Dropdown selector from 6 roles |
| **Folder access selection at invite** | Not every participant should see every folder; this is set at invite time | Medium | Checkbox matrix: which folders, can_upload/can_download per folder |
| **Participant list with metadata** | Admin needs to see who's in the deal, their role, and their status | Low | Name, email, role, invited/active/revoked status |
| **Access revocation** | Remove a participant and all their active sessions die immediately | Medium | Must invalidate JWT/sessions server-side, not just mark as revoked in DB |

### Notifications

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **New file upload email notification** | Participants need to know when new documents land in their folders | Medium | Triggered per-upload, scoped to participants with access to the target folder. Must not spam on bulk uploads |
| **Deal invitation email** | When invited to a deal, participant needs the magic link to get in | Low | Includes deal codename, role, and magic link. This is the primary onboarding path |

### Security Fundamentals

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Encryption at rest (S3 AES-256)** | M&A documents are highly sensitive; encryption at rest is non-negotiable for professional use | Low | AWS S3 server-side encryption, enabled at bucket level |
| **HTTPS only (TLS 1.2+)** | All data in transit must be encrypted | Low | Vercel handles this by default |
| **No direct S3 access** | All file operations go through authenticated API; no bucket URLs leak | Low | Architecture constraint, not a feature to build per se |
| **CORS locked to portal domain** | Prevents cross-origin attacks against the API | Low | Standard Next.js middleware config |
| **Rate limiting on auth endpoints** | Prevents brute-force magic link enumeration | Low | Standard middleware, but important for security posture |

---

## Differentiators

Features that set CIS Deal Room apart from ad-hoc sharing (email/Slack/Google Drive) and make it feel purpose-built for CIS Partners' workflow. Not expected in a lightweight portal, but valued.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Branded professional aesthetic** | Dark Bloomberg-meets-SaaS design reinforces CIS Partners' credibility with clients; most lightweight portals look generic | Medium | Brand red #E10600, DM Sans, JetBrains Mono. The design system is already defined. This is a real differentiator vs. Box/ShareFile which look like utility tools |
| **Deal codename + confidential client name** | Purpose-built for M&A where anonymity matters pre-close. Box/Google Drive don't understand this concept | Low | Simple but meaningful: codename visible to all, client name admin-only |
| **DD-specific default folder structure** | New deal auto-creates Financials, Legal, Operations, etc. No setup required. Generic portals start with an empty folder | Low | Saves 5-10 minutes per deal setup and ensures consistency across all engagements |
| **Folder-level permission matrix** | More granular than most lightweight portals (Box has folder permissions but not with role-specific upload/download controls) | High | The combination of 6 roles + per-folder can_upload/can_download is more granular than Box/ShareFile/Google Drive |
| **Activity feed as first-class panel** | Activity is a right-panel tab, always visible, not buried in settings. Most lightweight portals treat audit logs as admin-only backend features | Medium | Real-time visibility into deal activity is something enterprise VDRs do but lightweight tools don't |
| **Deal status lifecycle** | Visual deal stage tracking (Engagement through Closed/Archived) is M&A workflow-aware. Box doesn't know what "IOI Stage" means | Low | Color-coded status badges. Lightweight differentiator but communicates domain expertise |
| **Notification digest option** | Batch notifications into daily summary instead of per-file spam. Most lightweight portals are all-or-nothing on notifications | Medium | Configurable per user. Prevents email fatigue during heavy upload periods |
| **Three-panel workspace layout** | Information-dense layout shows folders, files, and activity simultaneously. Most lightweight portals use single-panel or two-panel layouts | Medium | Responsive collapse to single-column on mobile. The layout itself is a UX differentiator |

---

## Anti-Features

Features to explicitly NOT build in v1. These are deliberate scope decisions, not oversights.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **DRM / Information Rights Management** | Enterprise VDR territory ($15K+/deal). CIS doesn't need to prevent screenshots or printing. The trust model is "invited participants are trusted with the content" | Standard file download. If trust is a concern, don't invite that person |
| **Dynamic watermarking** | Same as DRM -- enterprise VDR feature. Complex to implement (server-side PDF rendering), adds latency, and CIS's clients would find it annoying | No watermarking. Consider as v2+ if demand emerges |
| **Server-side document rendering / fence-view** | Prevents download entirely, showing docs only in-browser. Requires a document rendering service (expensive, complex). Overkill for CIS's trust model | Allow downloads via presigned URLs. In-browser preview is a separate v2 feature |
| **Nested subfolders** | Adds navigation complexity. The 8 default DD categories are flat and cover CIS's needs. Deep nesting causes "where did I put that?" problems | Flat folder structure. Admin can create additional top-level folders. Revisit in v2 if deals grow past 8-10 categories |
| **OAuth / social login** | Adds IdP dependency (Google, Microsoft), requires account linking, and most deal participants use different email domains. Magic links are simpler and more universal | Magic link only. Works with any email address regardless of corporate SSO setup |
| **In-app notification center** | Adds real-time infrastructure (WebSockets or polling), notification state management, read/unread tracking. Email is sufficient for v1 deal cadence | Email notifications via Resend. In-app notifications are a v2 consideration |
| **Tasks / timelines / workflow automation** | This is a document portal, not a project management tool. Adding tasks conflates the product with Notion/Asana and bloats the scope | Stay focused on documents + activity. CIS uses Notion for deal ops separately |
| **Mobile native app** | Web works on mobile already (responsive). Native apps require App Store approval, separate codebase, push notification infrastructure | Responsive web design with single-column mobile layout |
| **Full-text document search** | Requires document indexing pipeline (extract text from PDFs/DOCX, build search index). Enterprise VDR feature | Filename search within folders. Full-text search is a v2+ feature |
| **In-app document preview (PDF viewer)** | Requires a document rendering service or client-side PDF.js integration. Adds complexity for every supported file type. Download-then-view is acceptable for v1 | Download via presigned URL, view in native app. Browser-based preview is a v2 feature |
| **Q&A / comments per file** | Standard in enterprise VDRs (Datasite, Intralinks). Requires threading, notifications, assignment, status tracking. Significant scope increase | Use email or existing communication channels for Q&A. This is the highest-value v2 feature |
| **Bulk download (zip entire folder)** | Requires server-side zip generation (Lambda or similar), temporary storage, progress tracking. Nice-to-have but not v1 | Individual file downloads only. Consider for v2 |
| **Document request checklist** | Admin creates a list of requested documents, client checks them off. Powerful but adds a parallel data model (requests vs. actual files) | Admin communicates requests via email/Notion. This is a strong v2 feature |
| **Two-factor authentication** | Adds friction to the magic link flow. For v1, the magic link itself is the "something you have" (access to email). Adding TOTP/SMS is overkill for most deals | Magic link auth provides single-factor email-based verification. Add 2FA for high-sensitivity deals in v2 |
| **Analytics dashboard** | Document completion rates, time-to-upload metrics, engagement scoring. Enterprise VDR feature (Ansarada's "deal score"). Requires data aggregation pipeline | Activity log provides raw data. Export or analytics layer can be added in v2 |
| **White-label per deal** | Custom logo/colors per deal workspace. Nice for multi-client advisory firms but CIS Partners is a single brand | CIS Partners branding only. All deals share the same brand experience |

---

## Feature Dependencies

Understanding what depends on what is critical for build ordering.

```
Auth (magic link) ──────────────────────────────────────────────────┐
  │                                                                  │
  ├── Session management (JWT, 24-hr expiry)                        │
  │     │                                                            │
  │     ├── RBAC middleware (role checks on every API route)         │
  │     │     │                                                      │
  │     │     ├── Folder-level permissions (can_upload/can_download) │
  │     │     │     │                                                │
  │     │     │     ├── File upload (permission check + presigned URL)
  │     │     │     ├── File download (permission check + presigned URL)
  │     │     │     └── File list (filtered by folder access)       │
  │     │     │                                                      │
  │     │     ├── Participant management (invite, role assign, revoke)
  │     │     │     │                                                │
  │     │     │     └── Email notifications (invite email, upload alerts)
  │     │     │                                                      │
  │     │     └── Activity log (every action writes to log)         │
  │     │           │                                                │
  │     │           └── Activity feed UI (reads from log)           │
  │     │                                                            │
  │     └── Deal workspace CRUD (create, status, list)              │
  │           │                                                      │
  │           ├── Default folder generation (auto-create 8 folders) │
  │           └── Deal list home screen (card view)                 │
  │                                                                  │
  └── Login screen + magic link flow                                │
                                                                     │
S3 bucket + presigned URL infra ─────────────────────────────────────┘
  (Independent: can be set up in parallel with auth)
```

**Critical path:** Auth --> RBAC --> Folder permissions --> File upload/download. Everything else hangs off this chain.

**Parallel work streams:**
- S3 infrastructure can be set up independently of auth
- UI shell (three-panel layout) can be built independently of API
- Design system / component library can be built independently
- Database schema + migrations can be done early

---

## Competitive Feature Matrix

How CIS Deal Room v1 stacks up against the competitive landscape. Based on training data knowledge of these products (MEDIUM confidence -- product features may have evolved).

| Feature | CIS v1 | Box (Portal) | ShareFile | Firmex | Datasite | Intralinks |
|---------|--------|--------------|-----------|--------|----------|------------|
| Passwordless auth (magic link) | Yes | No (password) | No (password) | No | No | No |
| Role-based access (3+ roles) | 6 roles | 7 roles | 3 roles | 5+ roles | 8+ roles | 8+ roles |
| Folder-level permissions | Yes | Yes | Yes | Yes | Yes | Yes |
| Drag-and-drop upload | Yes | Yes | Yes | Yes | Yes | Yes |
| File versioning | Yes | Yes | Yes | Yes | Yes | Yes |
| Activity/audit log | Yes | Yes (admin) | Basic | Full | Full | Full |
| Immutable audit trail | Yes | Partial | No | Yes | Yes | Yes |
| DRM/IRM | **No** | Optional | No | Yes | Yes | Yes |
| Watermarking | **No** | No | No | Yes | Yes | Yes |
| In-browser doc preview | **No (v2)** | Yes | Yes | Yes | Yes | Yes |
| Q&A threads | **No (v2)** | No | No | Yes | Yes | Yes |
| Full-text search | **No (v2)** | Yes | No | Yes | Yes | Yes |
| Document request list | **No (v2)** | No | No | Yes | Yes | Yes |
| Analytics/reporting | **No (v2)** | Basic | Basic | Yes | Advanced | Advanced |
| Bulk download (zip) | **No (v2)** | Yes | Yes | Yes | Yes | Yes |
| Custom branding | CIS only | Yes | Yes | Yes | Yes | Yes |
| Deal-aware (codenames, stages) | **Yes** | No | No | Yes | Yes | Yes |
| M&A default folder structure | **Yes** | No | No | Yes | Yes | Yes |
| Estimated cost per deal | ~$50-80/mo | $500+/mo | $200+/mo | $1K+/deal | $5K+/deal | $5K+/deal |

**CIS v1 advantage:** Frictionless auth (magic links vs. passwords), M&A-native workflow (codenames, DD folder structure, deal stages), professional branded experience, at 1/10th the cost of mid-market VDRs.

**CIS v1 gap:** No in-browser preview, no Q&A, no full-text search, no bulk download. These are acceptable gaps for CIS's use case because participants download files to review locally, and Q&A happens via email.

---

## MVP Recommendation

### Must ship (Phase 1-2 -- deal is in flight):
1. **Magic link authentication** -- participants need to get in
2. **Deal workspace with default folders** -- the organized space
3. **File upload + download (presigned URLs)** -- the core value
4. **RBAC + folder-level permissions** -- security is non-negotiable
5. **Participant invitation** -- need to add people to deals

### Must ship (Phase 3 -- collaboration):
6. **Activity logging (immutable)** -- audit trail from day one
7. **Activity feed UI** -- visibility into deal activity
8. **Email notifications** -- upload alerts + invitation emails
9. **File versioning + duplicate detection** -- data integrity

### Must ship (Phase 4 -- polish):
10. **Search/filter within folders** -- usability at scale
11. **Responsive design** -- tablet/mobile access
12. **Deal list home screen** -- multi-deal navigation
13. **Deal status lifecycle** -- workflow awareness

### Defer to v2 (based on usage data):
- **In-app document preview** -- highest user impact, but significant scope
- **Q&A threads per file** -- highest collaboration value, but requires threading infrastructure
- **Document request checklist** -- powerful for DD workflow, moderate scope
- **Bulk download (zip)** -- convenience feature, moderate scope
- **Full-text search** -- requires indexing pipeline, high scope
- **Notification digest** -- specified in build spec but can defer if tight on timeline
- **Analytics dashboard** -- requires data aggregation, lower priority than core features

---

## Security Expectations for Professional M&A Use

M&A advisors and their clients have specific security expectations. Missing any of these would undermine trust:

| Expectation | How CIS Addresses It | Risk If Missing |
|-------------|---------------------|-----------------|
| "My files can't be accessed by unauthorized people" | Folder-level permissions + presigned URLs (15-min expiry) + instant revocation | Deal-breaking. Clients won't upload sensitive financials |
| "I can see who accessed what" | Immutable activity log with user, action, target, timestamp | Regulatory/compliance concern. M&A advisors need audit trails |
| "Files are encrypted" | S3 AES-256 at rest + TLS in transit | Table stakes. Clients will ask about this |
| "Access stops when someone is removed" | Session invalidation on revoke, not just DB flag | Security incident if stale sessions persist |
| "The portal itself looks professional" | Dark branded design, CIS branding, clean UX | Perception issue. A generic-looking portal undermines trust in the advisory firm |
| "I don't need to create yet another account" | Magic link auth -- email only, no passwords | Friction reduction. Deal participants are already juggling multiple portals across deals |

---

## Sources

- **Primary:** CIS Deal Room Build Specification (cis-deal-room-build-spec.pdf) -- full product requirements, data model, security specs, and build phases [LOCAL, HIGH confidence]
- **Primary:** PROJECT.md -- validated requirements and constraints [LOCAL, HIGH confidence]
- **Primary:** Design system MASTER.md -- component specs and visual direction [LOCAL, HIGH confidence]
- **Competitive landscape:** Training data knowledge of Datasite, Intralinks, Ansarada, Firmex, Box, ShareFile feature sets [MEDIUM confidence -- products may have evolved since training cutoff]
- **M&A workflow patterns:** Training data knowledge of M&A due diligence processes and document management practices [HIGH confidence -- these processes are well-established and slow to change]

**Note:** WebSearch and WebFetch were unavailable during this research session. Competitive feature comparisons are based on training data (cutoff ~mid-2025) and should be treated as MEDIUM confidence. The CIS-specific requirements and features are HIGH confidence as they come directly from the build specification.
