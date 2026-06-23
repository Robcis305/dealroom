# Admin Deal Setup Wizard — Design Spec

**Date:** 2026-06-23
**Status:** Approved (design) — pending spec review
**Phase:** 2 of 3 in the onboarding redesign (Role model → **Admin deal setup** → Participant onboarding). **Depends on Phase 1** (the 5-role model) for the Invite step. Builds on `feat/role-model` (PR #30).

## Problem

Creating a deal today is a single modal (codename, client name, advisory side, status) that drops the admin on an empty Deal Overview — no folders, no chosen workstreams, no members — with no guidance on what to do next or in what order. Folders, workstreams, and invites are all manual and disconnected.

## Goal

Turn "New Deal" into a short guided **wizard** that walks the admin through Details → Folders → Workstreams → Invite, persisting each step as real data, and lands them in a ready-to-use deal room.

---

## Flow & persistence model

The "New Deal" action opens a 4-step wizard with a progress indicator and Back / Next / **Skip** on each step (every step after Details is skippable):

**Details → Folders → Workstreams → Invite → (redirect to the deal room)**

**Persist per step (decided):** the **Details** step creates the workspace immediately (`POST /api/workspaces`) and the wizard holds the returned `workspaceId`; each later step persists via real API calls as the admin advances. Consequences:
- Exiting mid-wizard leaves a real, usable deal with whatever was completed — the admin finishes later through the normal room UI (sidebar "Add folder", workstream "Manage", "Invite Participant"). No separate resume-the-wizard state is built.
- Skipping a step creates nothing for it and advances.
- Going **Back** does not undo already-created data (folders/workstreams already created stay); re-running a step is additive/idempotent where practical (don't double-create a folder of the same name — see edge cases).

## The steps

### 1. Details
Fields: **Deal Codename**, **Client Name** (admin-visible), **CIS Advisory Side** (Buyer-side / Seller-side). Status is **not** asked — defaults to `engagement` (editable later via the header dropdown). On Next: `POST /api/workspaces` → store `workspaceId`. This step is required (can't skip — there's no deal without it); Cancel closes the wizard.

### 2. Folders
A checklist of the canonical 8, **all pre-checked**: **Financials, Legal, Operations, Human Capital, Tax, Technology, Deal Documents, Miscellaneous**. The admin may uncheck any and may add custom folder rows (free-text name). On Next: create each checked/added folder via `POST /api/workspaces/:id/folders`. Skip → create none.

### 3. Workstreams
The 5 canonical workstreams (**Legal, Finance, Technology, HR, Commercial**) shown with their color dots, **none pre-selected**. The admin checks which to add. On Next: create each selected via the new `POST /api/workspaces/:id/workstreams { key }`. Skip → create none.

### 4. Invite
Add people one row at a time; each row: **email**, **role** (the 5-role set via `assignableRolesFor(side)`), and **folder access** — a multiselect of the folders created in step 2, plus an **"All folders"** shortcut. (CIS Team / Admin don't need folder grants but the control is harmless for them.) On Next/Finish: create each via `POST /api/workspaces/:id/participants` (creates the invited participant + folder_access rows + invitation email). Skip → invite no one. Finish redirects to `/workspace/:id`.

## Backend

**Reused as-is:**
- `POST /api/workspaces` — create the workspace (Details).
- `POST /api/workspaces/:id/folders` — one call per folder (Folders).
- `POST /api/workspaces/:id/participants` — one call per invite, already takes role + folderIds + sends the invitation (Invite).

**New:**
- `POST /api/workspaces/:id/workstreams` with `{ key }` (a canonical `WorkstreamKey`) — creates that single canonical workstream (name/color/tileTint/sortOrder from `CANONICAL_WORKSTREAMS`), admin/CIS-only (`isCisTeamOrAdmin`), idempotent on `(workspaceId, key)`. Returns the created/existing row.

**Reconciliation — stop auto-seeding all 5 workstreams (important):**
Today `ensureWorkstreams(workspaceId)` (called inside `listWorkstreamsWithCounts`) inserts all 5 canonical workstreams `onConflictDoNothing` on first read. With the wizard letting the admin pick a subset, that auto-seed would silently re-add the unpicked ones. Change: **remove the auto-seed-all from the read path.** Workstreams exist only when explicitly created (the wizard's new endpoint, or the existing role-gated paths). `listWorkstreamsWithCounts` returns whatever rows exist (possibly zero). The sidebar Workstreams section already returns null when empty.
- **Existing deals** that already have the 5 seeded keep them (no data change).
- New deals start with none and get exactly the chosen ones.
- The `ensureWorkstreams` helper is either deleted or reduced to a no-op/explicit-seed used only by the new endpoint — implementer's call in the plan, but the read path must not seed.

## Components / files

**Create:**
- `src/components/deals/NewDealWizard.tsx` — the wizard container (step state machine, progress, nav). Replaces `NewDealModal` as the "New Deal" entry point.
- `src/components/deals/wizard/StepDetails.tsx`, `StepFolders.tsx`, `StepWorkstreams.tsx`, `StepInvite.tsx` — one focused component per step (each owns its fields + the API call for its step).
- `src/app/api/workspaces/[id]/workstreams/route.ts` — add the `POST { key }` handler (the GET list already exists here).

**Modify:**
- `src/components/deals/DealList.tsx` (or wherever `NewDealModal` is mounted) — open `NewDealWizard` instead.
- `src/lib/dal/workstreams.ts` — add `createWorkstreamByKey(workspaceId, key)`; remove the auto-seed-all behavior from `listWorkstreamsWithCounts`/`ensureWorkstreams` per the reconciliation.
- Possibly `src/components/deals/NewDealModal.tsx` — removed/retired once the wizard replaces it.

## Edge cases
- **Skip Details:** not allowed — Cancel instead (no workspace without it).
- **Exit after Details, before later steps:** deal exists, usable; finish via normal UI.
- **Back after creating folders/workstreams:** already-created items persist; re-advancing must not duplicate (folder create should no-op or be guarded on same name within the wizard session; workstream create is idempotent on key).
- **Custom folder with a duplicate name:** rely on existing folder-create behavior; surface its error inline, don't crash the wizard.
- **No workstreams selected / no invites:** valid — create none, proceed.
- **Invite with no folder access for a non-CIS role:** allowed, but the UI should hint that they'll see no documents until granted access (a soft note, not a block).
- **A step's API call fails:** show the error on that step, keep the wizard open, let the admin retry or skip; never lose the `workspaceId`.

## Testing
- Component: wizard step navigation (next/back/skip), Details creates workspace + advances, Folders creates only checked folders, Workstreams creates only selected, Invite posts each row with role + folderIds.
- DAL/route: `createWorkstreamByKey` idempotent + admin/CIS-gated; `listWorkstreamsWithCounts` no longer auto-seeds (returns [] for a fresh workspace).
- Gates: `npm test`, `npm run typecheck`, `npm run build`.

## Out of scope (later)
- **Phase 3** — Participant onboarding (invite→accept→first-run) and the **dashboard-counts bug** (workstream detail endpoint returns the raw row without counts → stat cards blank).
- Bulk/CSV invite, templated folder sets per deal type, reorder/rename within the wizard (use the existing room UI).

## Rollout
Branch off `feat/role-model` (Phase 2 needs the new roles); when #30 merges, rebase onto main. No new DB migration (workstreams/folders/participants tables already exist). PR → preview → review.
