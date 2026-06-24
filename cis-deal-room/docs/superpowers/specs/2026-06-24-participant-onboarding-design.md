# Participant Onboarding — Design Spec

**Date:** 2026-06-24
**Status:** Approved (design) — pending spec review
**Phase:** 3 of 3 in the onboarding redesign (Role model → Admin deal setup → **Participant onboarding**). Builds on Phase 1 (role model, #30) and Phase 2 (admin setup wizard, #31). The dashboard-counts bug originally scoped here was already fixed in #31.

## Problem

The invite → accept → login plumbing already works: an invite creates a pending participant + a magic-link email; clicking the link activates the participant, creates a session, routes through `/complete-profile` (name) and into `/workspace/:id`. Two gaps remain:

1. **Admins can grant folder access at invite time but not workstream membership.** You can only add someone to a workstream *after* they accept, via the "Manage members" modal — and a Phase-1 rule blocks adding anyone who hasn't accepted yet.
2. **A newly-onboarded participant lands in the room with no orientation** — no clear statement of their role, which folders they can see, or which workstreams they're on.

## Goal

Let admins assign workstreams at invite time exactly the way they assign folder access, and greet each participant on first entry with a one-time welcome that shows their role, folders, and workstreams.

---

## Decisions (approved)

- **Workstream membership mirrors folder access.** Assignable at invite time and visible to the participant once they accept.
- **Relax the "active-only" workstream rule.** Invited (not-yet-accepted) participants are eligible workstream members everywhere. View-only participants remain excluded. (This also resolves the earlier friction where you couldn't add someone who hadn't logged in yet.)
- **First-run = a one-time welcome modal (Approach B).** A modal over the workspace shell on first entry — *not* a separate page. The existing `/complete-profile` name step stays as-is and precedes it. Shown **once per deal room**, tracked per participant.
- **Scope of the workstreams multiselect:** both invite entry points — the New-Deal wizard's Invite step **and** the standalone "add people later" modal (`ParticipantFormModal`).

---

## Part A — Workstream assignment at invite time

### Data / persistence
- `inviteParticipant` (DAL `src/lib/dal/participants.ts`) gains `workstreamIds: string[]` on `InviteInput`. Inside its existing transaction, mirror the `folder_access` handling: guard that every `workstreamId` belongs to this workspace (a `assertAllWorkstreamsInWorkspace` helper paralleling `assertAllFoldersInWorkspace`), delete the participant's existing `workstream_members` rows (re-invite path), then insert one `workstream_members` row per id (`{ workstreamId, participantId, addedBy: session.userId }`, `onConflictDoNothing`).
- The participant **update** path (`PATCH /participants/:id`, used by `ParticipantFormModal` edit mode) gains the same `workstreamIds` handling so memberships can be edited after invite, just like folder access.
- `getParticipants` (already returns `folderIds` via `array_agg`) gains a parallel `workstreamIds` aggregate so the edit modal can pre-check current memberships.

### API
- `inviteSchema` and the participant-update schema (`src/app/api/workspaces/[id]/participants/route.ts` and `.../participants/[participantId]/route.ts`) add `workstreamIds: z.array(z.string().uuid()).default([])`, passed through to the DAL.

### Policy relaxation
- `addWorkstreamMember` (DAL): remove the `status !== 'active'` rejection. Keep the `view_only` rejection and the not-found check. (The `ParticipantNotActive` mapping in the members route becomes dead — remove it; keep `ParticipantViewOnly` / `ParticipantNotFound`.)
- `WorkstreamMembersModal` (the "Manage members" modal): change the eligibility filter from `status === 'active' && role !== 'view_only'` to `role !== 'view_only'` (show **active and invited**, exclude view-only). Update the "N not shown" note to count only view-only/excluded. This means pre-assigned invited members appear and are managed consistently.

### Invite UI
- **Wizard Invite step (`StepInvite`):** add a workstreams multiselect per invite row, beside the existing folder-access control, with an "All workstreams" shortcut (mirrors the folders control). On save, include `workstreamIds` in each `POST /participants` body.
  - The wizard must thread the **created workstreams** into the Invite step the way it threads `createdFolders`. `StepWorkstreams` currently calls `onDone()` with nothing; change it to collect `{ id, name }` from each `POST /workstreams` `{ workstream }` response and pass the list up; the container holds `createdWorkstreams` and passes it to `StepInvite` as `workstreams`.
- **Standalone `ParticipantFormModal`:** add a `workstreams: { id; name }[]` prop (the workspace's workstreams, already loaded by the parent shell) and a `workstreamIds` selection state + multiselect, mirroring the existing folders control. Include `workstreamIds` in both the invite (POST) and edit (PATCH) bodies; pre-check from `existing?.workstreamIds` in edit mode.

---

## Part B — One-time welcome modal (first-run)

### Trigger / tracking
- New nullable column `workspace_participants.onboarded_at timestamp` (migration 0019).
- A participant sees the welcome when **`status = 'active'` AND `onboarded_at IS NULL`** on their participant row for that workspace. Global admins who are not participants never see it.
- `createWorkspace` sets the creator's own participant row `onboarded_at = now()` so the creator never gets a welcome for their own deal.
- Migration backfills `onboarded_at = coalesce(activated_at, now())` for all existing rows, so current users don't suddenly get a welcome.

### Server → client
- The workspace page (`src/app/(app)/workspace/[workspaceId]/page.tsx`) already loads the current participant. When the participant needs the welcome, it computes a `welcome` prop and passes it to `WorkspaceShell`:
  ```ts
  welcome: { roleLabel: string; folders: string[]; workstreams: string[] } | null
  ```
  - `roleLabel` = side-aware `roleLabel(participant.role, workspace.cisAdvisorySide)`.
  - `folders` = names of folders the participant has `folder_access` to (or "All folders the deal contains" wording if they have access to every folder — keep simple: list granted folder names; empty → "No folders yet").
  - `workstreams` = names of workstreams the participant is a member of (empty → "No workstreams yet").
  - `null` when no welcome is due (so the shell renders nothing).

### Component
- `WelcomeModal` (new, `src/components/workspace/WelcomeModal.tsx`) rendered by `WorkspaceShell` when `welcome != null`. Reuses the shared `Modal` (viewport-capped, paper theme). Content:
  - Heading: "Welcome to {deal name}".
  - "You've been added as **{roleLabel}**."
  - "Folders you can access" — list (or empty state).
  - "Workstreams you're on" — list (or empty state).
  - Primary button **"Enter deal room"** → `POST /api/workspaces/:id/onboarded` → on success, hide the modal (local state). The button shows a busy state and is the only dismissal (no backdrop close), so the mark-onboarded call always fires.

### Mark-onboarded endpoint
- `POST /api/workspaces/:id/onboarded`: `verifySession`; `requireDealAccess`; DAL `markOnboarded(workspaceId, session)` sets `onboarded_at = now()` on the caller's own active participant row (`where workspaceId AND userId = session.userId`). Idempotent (no-op if already set). Returns `{ ok: true }`.

---

## Migration (0019)

Hand-written `0019_participant_onboarding.sql` + idempotent `scripts/apply-0019-direct.mjs` (repo convention: `to_regclass`/`IF NOT EXISTS` guards, verify section exiting non-zero on failure):
1. `ALTER TABLE workspace_participants ADD COLUMN IF NOT EXISTS onboarded_at timestamp;`
2. Backfill: `UPDATE workspace_participants SET onboarded_at = coalesce(activated_at, now()) WHERE onboarded_at IS NULL;`
3. Verify: column exists; print count of rows still null (should be 0 post-backfill).

Apply to **each** environment DB (local, preview, production) — separate databases, no auto-migrate. Add `onboarded_at` to the Drizzle `workspaceParticipants` schema.

## Out of scope (YAGNI)

- No invitation-email redesign, no resend/revoke UI, no pending-vs-accepted dashboard (those were considered and dropped).
- No "always-available My access" panel — the welcome is one-time only.
- No change to the magic-link / expired / wrong-account handling.
- Q&A assignee eligibility is unchanged by this spec (the active-only relaxation is scoped to workstream membership).

## Testing

- **DAL:** `inviteParticipant` writes `workstream_members` for the given ids (and guards cross-workspace ids); update path replaces memberships; `getParticipants` returns `workstreamIds`. `addWorkstreamMember` now allows an invited participant and still rejects `view_only`. `markOnboarded` sets the timestamp on the caller's row only.
- **API:** invite/update routes accept and forward `workstreamIds`; `POST /onboarded` marks the row and is idempotent.
- **Components:** `StepInvite` posts `workstreamIds`; `ParticipantFormModal` posts `workstreamIds` on invite and edit and pre-checks in edit mode; `WorkstreamMembersModal` lists invited participants; `WelcomeModal` renders role/folders/workstreams and calls the onboarded endpoint then hides.
- **Migration:** script verify asserts the column exists and no null rows remain after backfill.
- **Gates:** `npm test`, `npm run typecheck`, `npm run build`.

## Rollout

Branch → PR → preview. Apply `0019` to preview before testing and to production at merge. Because the active-only relaxation touches authorization, the final whole-branch review confirms no over-grant (view-only still excluded; cross-workspace workstream ids rejected; `markOnboarded` only mutates the caller's own row).
