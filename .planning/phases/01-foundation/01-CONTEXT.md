# Phase 1: Foundation - Context

**Gathered:** 2026-04-12
**Status:** Ready for planning

<domain>
## Phase Boundary

A single admin can authenticate via magic link, create a deal workspace with default folders, and navigate the three-panel layout — with all security patterns (authorization utilities, token handling, S3 bucket config) established for every subsequent phase to inherit.

Activity logging writes to the database from this phase even though the feed UI ships in Phase 4.

</domain>

<decisions>
## Implementation Decisions

### Login Flow UX
- After email submit: Inline confirmation — same screen transforms, email input fades out, confirmation message ("Check your email, we sent a link to [email]") appears in its place. No page navigation.
- Resend email: Available immediately after sending — no cooldown, no rate limiting at the UX level (server-side rate limiting still applies per AUTH-06)
- Expired/already-used links: Show a specific inline error on the /auth/verify page — distinguish "This link has expired" from "This link has already been used" — with a button to request a new link from the same page
- Session expiry: Redirect to /login, always land on deal list after re-auth. No returnUrl preservation — keep it simple.

### New Workspace Creation
- Location: Centered modal overlay over the deal list (not a dedicated page)
- Form fields: Deal Codename (required), Client Name (required, admin-visible only), CIS Advisory Side (required radio buttons: Buyer-side / Seller-side), Initial Status (required dropdown — admin picks from the 6 status options at creation)
- CIS Advisory Side control: Radio buttons — clearly labeled, required, cannot be changed after creation
- After creation: Immediately enter the new workspace. Default to the deal overview state (no folder selected).

### Workspace Shell Layout & Defaults
- Default state on workspace entry: No folder selected — center panel shows deal overview
- Deal overview (no-folder-selected state): Shows deal name, status badge, CIS advisory side, creation date, and per-folder file counts as a summary grid
- Status change: Status badge in the workspace header is clickable → opens a dropdown for admin to change status. Admin-only.
- Right panel default: Activity tab on workspace entry
- Role-based header: Admin sees "New Deal Room" button on deal list; non-admin users do not see it. Workspace header "Invite" and "Upload" buttons visible to roles with those permissions only.
- User assignment constraint: Users are always invited to a specific workspace — there is no system-level account without a deal association. The "no workspaces" empty state should not occur in normal usage.

### Folder Management (Shell Phase)
- Folder icons: Proper SVG icons (lucide-react) — no emoji. Emoji render inconsistently and feel too casual for this context.
- Folder structure: Flat — no subfolders, no subfolder chips, no nested hierarchy. The prototype's subfolder chips are removed entirely.
- Default folders auto-created on workspace creation: Financials, Legal, Operations, Human Capital, Tax, Technology, Deal Documents, Miscellaneous

### File Icons
- File type icons: Proper SVG icons (consistent with folder icons) — no emoji for file types either.

### Visual Implementation
- Prototype fidelity: Visual match only — rebuild entirely in Tailwind CSS with proper React components. Do not port inline styles from prototype.
- Logo: Real CIS Partners logo file will be provided — implement a clearly marked placeholder slot in the header until the asset is delivered. No gradient square fallback.

### Claude's Discretion
- Tailwind component architecture and file structure
- Token hashing implementation (SHA-256 as specified in AUTH-02)
- Session storage strategy (database sessions vs JWT) — decide during research/planning
- Database provider (Neon vs Supabase) — decide during research based on auth integration
- Rate limiting implementation for AUTH-06
- Activity log schema design (append-only, UUID PKs)
- Exact lucide-react icon choices per folder/file type

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `cis-deal-portal-prototype.jsx`: Full prototype of the UI — three-panel layout, deal list cards, file table, activity feed, participant list, upload modal, invite modal. Use as visual pixel reference only.
- `design-system/cis-deal-room/MASTER.md`: Complete design system — color tokens, typography, spacing, button specs, card specs, input specs. Primary source of truth for all component styling.
- `design-system/cis-deal-room/pages/`: Per-page design overrides (check this directory before implementing any page).

### Established Patterns
- Color: Brand red `#E10600` replaces all blue (`#2563EB`) from the prototype. Design system is authoritative.
- Typography: DM Sans for UI, JetBrains Mono for data values (file sizes, timestamps, IDs).
- Dark base: `#0D0D0D` page background, `#141414` elevated surfaces, `#1F1F1F` inputs/hover.
- Icons: lucide-react for all iconography — no emoji anywhere in the built app.

### Integration Points
- Auth (Phase 1) → File operations (Phase 2): Auth middleware and session validation established here, inherited by all file API routes
- Auth (Phase 1) → Collaboration (Phase 3): `requireDealAccess` and `requireFolderAccess` security utilities established here
- Deal/folder data model (Phase 1) → Activity log (all phases): Activity table schema established here, writes begin immediately
- S3 bucket config established in Phase 1 even though presigned URL generation for file ops is Phase 2

</code_context>

<specifics>
## Specific Ideas

- "Check your email" confirmation state should show the specific email address the link was sent to (not just "check your email")
- Error messages on the /auth/verify page should distinguish between "expired" and "already used" — not a generic auth error
- The deal overview panel (no-folder state) should be the first thing an admin sees when entering a freshly created workspace, showing all 8 default folders with 0 counts
- The status badge in the workspace header is clickable for admin — this is the only place status changes happen (no separate settings flow in Phase 1)
- Logo slot in header: placeholder until CIS Partners provides the actual logo file asset

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 01-foundation*
*Context gathered: 2026-04-12*
