---
phase: 01-foundation
plan: "04"
subsystem: ui
tags: [nextjs, react, tailwind, typescript, lucide-react, zod]

# Dependency graph
requires:
  - phase: 01-foundation-01
    provides: "Next.js 15 project scaffold, TypeScript config, Vitest setup"
  - phase: 01-foundation-02
    provides: "All API routes (workspaces, folders, auth), DAL functions (getWorkspacesForUser, getWorkspace, getFoldersForWorkspace, createWorkspace, updateWorkspaceStatus), verifySession() auth gate"
  - phase: 01-foundation-03
    provides: "Button, Input, Modal, Badge UI primitives; LoginForm; /login and /auth/verify pages; CIS @theme brand tokens"
provides:
  - "Auth-gated app layout at src/app/(app)/layout.tsx"
  - "/deals page: workspace list with admin conditional New Deal Room button"
  - "DealList component: workspace rows with status badge, advisory side, creation date"
  - "NewDealModal: 4-field workspace creation with zod validation, POST /api/workspaces, immediate navigation"
  - "Workspace page (async params): server component fetching workspace + folders"
  - "WorkspaceShell: three-panel flex layout (240px + flex-1 + 320px) with header, status badge dropdown"
  - "FolderSidebar: folder list, admin rename/delete/add, lucide Folder/FolderOpen icons"
  - "DealOverview: deal name, status badge, advisory side, creation timestamp, per-folder file count grid"
  - "RightPanel: Activity/Participants tabs with CIS accent on active, placeholder states"
affects:
  - 02-01 (file list UI replaces center panel placeholder when folder is selected)
  - 02-02 (upload modal integrates into WorkspaceShell header)
  - 03-01 (participant management replaces RightPanel participants placeholder)

# Tech tracking
tech-stack:
  added: []  # all dependencies installed in 01-01
  patterns:
    - "Three-panel workspace layout: w-[240px] shrink-0 + flex-1 min-w-0 + w-[320px] shrink-0"
    - "Optimistic UI updates for status change and folder rename/delete"
    - "Server Component data fetching + client component interactivity split at WorkspaceShell boundary"
    - "Next.js 15 async params: const { workspaceId } = await params in page components"
    - "Admin-only popover dropdown via absolute positioned div + fixed inset-0 backdrop"
    - "Inline folder rename via double-click activating input; blur/Enter commits"

key-files:
  created:
    - cis-deal-room/src/app/(app)/layout.tsx
    - cis-deal-room/src/app/(app)/deals/page.tsx
    - cis-deal-room/src/app/(app)/workspace/[workspaceId]/page.tsx
    - cis-deal-room/src/components/deals/DealList.tsx
    - cis-deal-room/src/components/deals/NewDealModal.tsx
    - cis-deal-room/src/components/workspace/WorkspaceShell.tsx
    - cis-deal-room/src/components/workspace/FolderSidebar.tsx
    - cis-deal-room/src/components/workspace/DealOverview.tsx
    - cis-deal-room/src/components/workspace/RightPanel.tsx
  modified: []

key-decisions:
  - "WorkspaceShell is 'use client': needs useState for selectedFolderId, status dropdown, and folder mutations — all three-panel state lives here"
  - "Optimistic updates for status change and folder rename/delete: immediate feedback, revert on API failure"
  - "Logo placeholder is a CIS-labeled div with aria-label and TODO comment — not a gradient square"
  - "Folder rename triggered by double-click on folder name OR pencil icon button in hover state"
  - "Zod v4 enum error param: uses error string directly (not errorMap object) per updated Zod v4 API"

patterns-established:
  - "Pattern: Server Component page fetches data → passes to 'use client' shell → shell owns all interactive state"
  - "Pattern: Admin-only UI gated on isAdmin prop at every component level (not just route level)"
  - "Pattern: Fixed backdrop div + z-index layering for inline dropdowns without a Popover library"
  - "Pattern: Optimistic update → revert on fetch failure for folder and status mutations"

requirements-completed:
  - UI-07
  - WORK-01
  - WORK-02
  - WORK-03
  - FOLD-01
  - FOLD-02
  - FOLD-03

# Metrics
duration: 4min
completed: 2026-04-12
---

# Phase 01 Plan 04: Workspace Shell, Deal List, and Workspace Creation UI Summary

**Three-panel workspace shell with 240px folder sidebar, flex-1 deal overview, and 320px activity/participants panel — completing the Phase 1 product-facing layer over the Plan 01-02 backend**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-04-12T20:46:07Z
- **Completed:** 2026-04-12T20:49:31Z
- **Tasks:** 1 completed (Task 2 is blocking human-verify checkpoint)
- **Files created:** 9

## Accomplishments

- Auth-gated `(app)` layout group — verifySession() at the layout boundary redirects to /login
- `/deals` page with workspace list: status badges, advisory side, creation dates, admin-conditional "New Deal Room" button
- NewDealModal: centered overlay with zod validation across 4 fields (codename, client name, advisory side radio buttons, status dropdown); POSTs to /api/workspaces then router.push to new workspace
- WorkspaceShell three-panel layout: FolderSidebar (w-[240px]), DealOverview or file area (flex-1), RightPanel (w-[320px])
- Header bar: logo placeholder slot (marked with TODO comment and aria-label), deal codename, admin-clickable status badge with absolute-positioned dropdown and optimistic update
- FolderSidebar: all folders listed with Folder/FolderOpen icons (lucide-react), admin rename via double-click or pencil icon, admin delete with Trash2 icon, add folder inline at bottom
- DealOverview: deal name heading, status badge, advisory side label, creation timestamp in font-mono, 2-column folder grid showing file count (0 for all in Phase 1)
- RightPanel: Activity (default) and Participants tabs with #E10600 accent on active tab, placeholder states for both tabs
- TypeScript compiles clean (tsc --noEmit exits 0); zero emoji in any component (all iconography from lucide-react)

## Components Built

| Component | Path | Purpose |
|-----------|------|---------|
| AppLayout | `src/app/(app)/layout.tsx` | Auth gate for (app) route group |
| DealsPage | `src/app/(app)/deals/page.tsx` | Server component fetching workspaces |
| WorkspacePage | `src/app/(app)/workspace/[workspaceId]/page.tsx` | Server component fetching workspace + folders |
| DealList | `src/components/deals/DealList.tsx` | Workspace list with admin New Deal Room button |
| NewDealModal | `src/components/deals/NewDealModal.tsx` | Workspace creation form with 4 fields |
| WorkspaceShell | `src/components/workspace/WorkspaceShell.tsx` | Three-panel layout container with header |
| FolderSidebar | `src/components/workspace/FolderSidebar.tsx` | Folder navigation with admin CRUD |
| DealOverview | `src/components/workspace/DealOverview.tsx` | Default center panel, workspace summary |
| RightPanel | `src/components/workspace/RightPanel.tsx` | Activity/Participants tabbed panel |

## Design System Tokens Applied

- `bg-[#0D0D0D]` — page background surface
- `bg-[#141414]` — elevated panels (header, sidebar, right panel, folder cards)
- `bg-[#1F1F1F]` — inputs, hover states, icon containers
- `#E10600` — active tab indicator, status dropdown selected state, brand accent
- `border-[#2A2A2A]` — all panel borders and card borders
- `font-mono` (JetBrains Mono) — creation timestamps in DealOverview
- `font-sans` (DM Sans) — all UI text

## User Journey Walkthrough

1. **Login** (`/login`) — Email input → magic link sent → click link → session created
2. **Deal list** (`/deals`) — Shows all workspaces; admin sees "New Deal Room" button
3. **Create workspace** — Modal opens with 4 fields; submit → POST /api/workspaces → navigate to `/workspace/[id]`
4. **Workspace entry** — DealOverview shown (no folder selected): deal name, status badge, advisory side, creation date, folder count grid (all 0)
5. **Folder navigation** — Click folder in sidebar → center panel shows "File upload coming in next release" placeholder (Phase 2)
6. **Status change** (admin) — Click status badge in header → dropdown → select new status → PATCH /api/workspaces/[id]/status
7. **Folder management** (admin) — Rename via double-click or pencil icon; delete via Trash2 icon; add via "+ Add folder" button

## Task Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Workspace shell, deal list, NewDealModal, folder sidebar, deal overview | ba2d815 | 9 files created |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Zod v4 enum error param API change**
- **Found during:** Task 1 (TypeScript compilation)
- **Issue:** `z.enum(['buyer_side', 'seller_side'], { errorMap: () => ({ message: '...' }) })` — `errorMap` does not exist on the Zod v4 params type; the correct property is `error`.
- **Fix:** Changed `{ errorMap: () => ({ message: '...' }) }` to `{ error: 'Advisory side is required' }`.
- **Files modified:** `cis-deal-room/src/components/deals/NewDealModal.tsx`
- **Commit:** ba2d815 (inline fix, committed with task)

None other — plan executed as written.

## Checkpoint Outcome

**Status: Awaiting human verification**

The human-verify checkpoint (Task 2) requires browser testing of the full Phase 1 user journey. The checkpoint is blocking — cannot proceed to Phase 2 without approval.

See checkpoint instructions below for required setup (env vars, database migration, dev server).

---
*Phase: 01-foundation*
*Completed: 2026-04-12*

## Self-Check: PASSED

- All 9 implementation files confirmed on disk (all created in this plan)
- SUMMARY.md confirmed at .planning/phases/01-foundation/01-04-SUMMARY.md
- Task 1 commit confirmed in git log (ba2d815)
- npx tsc --noEmit exits 0 (confirmed)
- Zero emoji confirmed in all new component files
- Pre-existing 16 test failures confirmed as pre-existing (same count before/after stash test)
