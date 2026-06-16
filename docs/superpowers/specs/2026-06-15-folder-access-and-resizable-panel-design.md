# Folder Access Visibility + Resizable/Collapsible Right Panel — Design

Date: 2026-06-15
Status: Approved (pending spec review)
Branch context: `feat/ai-data-room-integration` (live app — real client data)

## Overview

Two client-only UI changes to the Deal Room workspace. **Neither touches the
database, schema, or any API route** — both derive entirely from data the UI
already loads or from local component state. This keeps risk to the live
production app at essentially zero.

1. **Folder access visibility** — when a folder is open, show who has access to
   it, both as an indicator near the folder header and as a folder-scoped filter
   in the existing Participants panel.
2. **Resizable / collapsible right panel** — let the user drag-resize the
   right-hand Activity/Participants panel and collapse it to a small reopen rail.

---

## Feature 1: Folder access visibility

### Goal

As any user (framed by the request as "as an admin"), when a folder is open, see
which participants have access to that folder.

### Data — no new fetches

`getParticipants(workspaceId)` already returns, per participant, a `folderIds`
array and a `role` (`src/lib/dal/participants.ts`). `ParticipantList` already
fetches this via `GET /api/workspaces/{id}/participants`. The currently-open
folder is already tracked as `CenterView` (`{ kind: 'folder'; folderId }`) in
`WorkspaceShell` / `FolderSidebar`. So everything needed is already client-side.

### Access derivation — shared helper

A single pure function is the source of truth so the header indicator and the
panel filter cannot drift:

```ts
// participant has access to folderId if:
//   - role is 'admin' or 'cis_team'  (implicit full access), OR
//   - participant.folderIds includes folderId
function hasFolderAccess(participant, folderId): boolean
```

Admins / cis_team have **no** `folderAccess` rows (they bypass folder checks), so
they must be included explicitly and rendered with a "Full access" marker.

### UI

**1a. Folder-header indicator** (near the "Deal Documents" title in the center
file view, where the request's arrow points):
- Avatar stack (initials) of up to 4 participants + `+N` overflow.
- Label e.g. "5 with access".
- Renders only when the open view is a folder (not Deal Overview / Checklist).
- Clicking opens a popover listing the filtered participants (name, role, access
  type), reusing the panel's row rendering.

**1b. Participants panel filter** (`RightPanel` / `ParticipantList`):
- When a folder is open, show header "Users with access to this folder" and
  scope the list to participants for whom `hasFolderAccess` is true.
- A toggle ("This folder" / "All participants") restores the full list.
- When no folder is open (overview/checklist), show all participants, no folder
  header — current behavior preserved.

### Visibility

Visible to **everyone** (all roles). This matches current behavior: the
participants list and `folderIds` are already returned to non-admins. No new
data is exposed.

### Scope

Read-only. Managing access stays in the existing edit-participant modal
(`ParticipantFormModal`). No inline grant/revoke in this feature.

### Edge cases

- Folder with zero explicit grants → still lists admins/cis_team, so never empty.
- Participant with status `invited` (not yet active) but holding a grant → shown,
  with the existing "Invited" badge so it's clear access isn't live yet.
- Switching folders updates the indicator and the filter reactively.

### Testing

- Unit tests on `hasFolderAccess`: admin bypass, cis_team bypass, explicit grant
  present, no grant, invited-status participant with grant.
- Component check: panel filters to the open folder and the toggle restores the
  full list; indicator count matches the filtered list length.

---

## Feature 2: Resizable / collapsible right panel

### Goal

Let the user resize the right-hand panel and slide it away, with a small icon to
reopen when closed.

### Current state

`WorkspaceShell` renders the right panel as a fixed-width column:
`<div className="w-[320px] shrink-0 ... hidden lg:flex lg:flex-col">` wrapping
`<RightPanel>` (`src/components/workspace/WorkspaceShell.tsx:343`). Center is
`flex-1 min-w-0`.

### Design

Lift panel width + collapsed state into `WorkspaceShell` (so the center reflows):

- **Resize:** thin drag handle on the panel's left edge. Drag updates width,
  clamped **min 260px / max 600px**. Center (`flex-1`) reflows automatically.
- **Collapse:** a close control (chevron) in the panel header collapses it. When
  collapsed, the panel is replaced by a narrow (~40px) rail on the right edge
  with a small icon button to reopen. The panel never fully disappears.
- **No persistence:** width resets to 320px and panel is open on every page load.
- **Responsive:** unchanged below the `lg` breakpoint — the panel is already
  `hidden lg:flex`, so resize/collapse apply only on large screens.

### Scope

Pure local UI state in `WorkspaceShell`. No backend, API, or data changes.

### Testing

- Width clamps to the 260–600 bounds when dragging past them.
- Collapse hides the panel and shows the reopen rail; reopen restores it.
- Center area reflows without overflow at min and max widths.

---

## Non-goals

- No schema, migration, or API changes for either feature.
- No persistence of panel state across sessions.
- No inline access management from the folder access UI.
- No changes to mobile (< lg) layout.
