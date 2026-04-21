# Diligence Checklist — Design

**Status:** Approved — ready for implementation planning
**Date:** 2026-04-21
**Owner:** Rob

## Problem

Buy-side M&A advisors hand sellers a diligence request list (typically an Excel spreadsheet with dozens of items across categories like Legal, IP, Financials). Today that list lives outside the Deal Room. The advisor reconciles uploads-to-requests manually by inspecting folders — error-prone, slow, and invisible to the seller.

## Goal

A per-workspace checklist that:

1. Imports from the advisor's existing `.xlsx`.
2. Maps each row to a folder so the seller can click → upload against a specific request.
3. Auto-tracks progress as files are linked to items.
4. Gives the advisor a single view of what's outstanding, in progress, received, or waived.
5. Filters visibility so participants only see items they're responsible for.

## Non-goals (explicit scope out)

- Template download / blank starter `.xlsx`
- CSV import
- Multi-checklist UI (schema allows many; UI exposes one)
- DealOverview integration (revisit with DealOverview redesign)
- Row reordering via drag-drop
- Auto-follow-through for file versioning (new version requires manual relink)
- Received / Waived / N/A notifications (reconsider after MVP usage)

## User flows

### 1. Admin imports a checklist (one-time bootstrap per workspace)

1. Left sidebar → **Checklist** (pinned above folder list). Empty state renders in center panel with **Import checklist** CTA (admin only; non-admin sees "No checklist yet").
2. Admin drops `.xlsx`. System parses rows.
3. Preview screen shows:
   - Valid rows (count + sample)
   - Rejected rows with reasons (missing `Category` or `Item`, invalid enum values reported as info not error — the importer coerces)
4. Admin confirms → system creates:
   - `checklists` row (default name "Diligence Checklist")
   - `checklist_items` rows
   - Folders for any `Category` value that doesn't have a matching workspace folder (auto-created with `sort_order` appended to end)
   - Each item's `folder_id` populated from the matched/created folder
5. Activity event: `checklist_imported`.

### 2. Admin edits post-import

In-table inline editing (admin-only):

- **Status chip** → click → popover with `Received`, `Waived`, `N/A`, `Reset to not started`
- **Priority** → chip → click → dropdown
- **Owner** → chip → click → dropdown (assignment fires `checklist_item_assigned` notification for unassigned → specific-side transitions)
- **Folder** → dropdown per row (lists workspace folders; admin can change post-import)
- **Notes, description** → row-expand → text fields

Row-level actions (row-expand or overflow menu):
- Upload for this item (opens upload modal with folder + item pre-filled)
- Link existing file (opens file picker scoped to the item's folder)
- Unlink file (removes `checklist_item_files` row; may revert status)
- Edit item
- Delete item

Add single item: **+ Add item** button at end of table. Inline form collects category, item name, folder (required), priority, owner.

Bulk actions (multi-select checkbox column, sticky action bar — mirrors `FileList` pattern):
- Mark Received
- Mark Waived
- Mark N/A
- Reassign owner
- Delete

### 3. Participant responds

1. Left sidebar → **Checklist** → center panel renders table filtered to rows where `owner ∈ their role mapping` (see Permissions).
2. For participants whose role permits click-to-upload (per Permissions table), the **item name** is a click target opening the Upload modal; `view_only` viewers see the same rows read-only with no upload affordance.
3. Clicking the item name opens the existing Upload modal with:
   - Folder pre-selected (the item's `folder_id`)
   - New field: `Link to checklist item` pre-filled with this item
4. On upload success:
   - Standard file row created
   - `checklist_item_files` link row created with `linked_by = uploader`
   - If item status was `not_started` → transition to `in_progress`
   - Activity event: `checklist_item_linked`

### 4. Admin closes items

- Click status chip → `Received` (sets `received_at`, `received_by`) / `Waived` / `N/A` / `Reset`.
- Terminal states (`received`, `waived`, `n_a`) persist across file deletions — admin made an explicit judgment; an underlying file disappearing shouldn't silently undo it.
- Activity events: `checklist_item_received`, `checklist_item_waived`, `checklist_item_na`.

### 5. Normal folder-flow uploads (non-checklist entry)

The existing Upload modal gains an optional **Link to checklist item** field whenever the workspace has a checklist:

- Entered via item-click → field pre-filled with that item.
- Entered via folder-flow → field blank, dropdown filtered to items whose `folder_id` matches the currently-selected upload folder (user can also pick "none").
- Supports 0, 1, or several items. Each selection creates a `checklist_item_files` row.

Effect: linking is a zero-friction option at upload time. Admin rarely has to reconcile after the fact.

## Data model

### New tables

```
checklists
  id                uuid pk
  workspace_id      uuid fk workspaces(id) on delete cascade
  name              text not null default 'Diligence Checklist'
  created_by        uuid fk users(id) not null
  created_at        timestamp not null default now()
  updated_at        timestamp not null default now()

checklist_items
  id                uuid pk
  checklist_id      uuid fk checklists(id) on delete cascade
  folder_id         uuid fk folders(id) not null
                    -- block folder deletion while items reference it
  sort_order        integer not null default 0
  category          text not null
  name              text not null
  description       text
  priority          checklist_priority not null default 'medium'
  owner             checklist_owner not null default 'unassigned'
  status            checklist_status not null default 'not_started'
  notes             text
  requested_at      timestamp not null default now()
  received_at       timestamp
  received_by       uuid fk users(id)
  created_at        timestamp not null default now()
  updated_at        timestamp not null default now()

checklist_item_files
  item_id           uuid fk checklist_items(id) on delete cascade
  file_id           uuid fk files(id) on delete cascade
  linked_at         timestamp not null default now()
  linked_by         uuid fk users(id) not null
  primary key (item_id, file_id)
```

### New enums

```
checklist_priority  = critical | high | medium | low
checklist_owner     = seller | buyer | both | cis_team | unassigned
checklist_status    = not_started | in_progress | received | waived | n_a
```

### Alterations to existing tables

```
workspace_participants
  + view_only_shadow_side  enum(buyer | seller) nullable
    -- app-level constraint: required (NOT NULL) when role = 'view_only',
       null otherwise. Enforced in DAL + form validation.
```

### Enum additions to existing enums

```
participant_role
  + seller_counsel
  + buyer_counsel
  (counsel kept as deprecated — not offered in new-invite UI;
   existing rows preserved for manual reassignment)

activity_action
  + checklist_imported
  + checklist_item_linked
  + checklist_item_received
  + checklist_item_waived
  + checklist_item_na
  + checklist_item_assigned
```

## Status state machine

```
not_started  ─(first link created)→  in_progress
in_progress  ─(last link removed)─→  not_started
{any}        ─(admin action)──────→  received | waived | n_a
received | waived | n_a             admin-only, persists across link changes
received | waived | n_a  ─(reset)─→ recomputed from link count
                                    (0 links → not_started, ≥1 → in_progress)
```

## Permissions / filtering

| Role | Rows visible where `owner ∈` | Edit structure | Mark Received/Waived/N/A | Click-to-upload |
|---|---|---|---|---|
| `admin` | all + unassigned | ✓ | ✓ | ✓ |
| `cis_team` | all + unassigned | ✓ | ✓ | ✓ |
| `client` | derived from `workspace.cisAdvisorySide` + `both` | — | — | ✓ |
| `seller_rep` | seller, both | — | — | ✓ |
| `buyer_rep` | buyer, both | — | — | ✓ |
| `seller_counsel` | seller, both | — | — | ✓ |
| `buyer_counsel` | buyer, both | — | — | ✓ |
| `view_only` | `view_only_shadow_side` + `both` | — | — | — |
| `counsel` (deprecated) | none until reassigned | — | — | — |

`unassigned` rows are visible only to admin/cis_team. Assigning an owner is the signal to the counterparty that there's work for them — that's why `checklist_item_assigned` is the one new notification.

Folder-level `folder_access` remains the outer envelope: a participant must have folder access *and* be in the owner filter to both see the row and successfully upload.

## Import format (`.xlsx` only)

### Column → field mapping

| Excel column (aliases accepted) | Required | Field | Notes |
|---|---|---|---|
| `#` | no | `sort_order` | Falls back to 1-indexed row index |
| `Category` | **yes** | `category` | Also drives folder auto-create |
| `Item` / `Document` / `Request` | **yes** | `name` | |
| `Description` / `Description / Request Detail` / `Request Detail` | no | `description` | |
| `Priority` | no | `priority` | Defaults to `medium` if blank/invalid |
| `Owner` | no | `owner` | Defaults to `unassigned` |
| `Status` | no | — | Ignored on import (always seeds `not_started`) |
| `Date Requested` | no | `requested_at` | Defaults to import timestamp |
| `Date Received` | no | — | Ignored on import (computed from link events) |
| `Notes` | no | `notes` | Admin-visible only |

Header matching: case-insensitive, trimmed whitespace, exact or alias match.

### Bad-data handling

- Rows missing required fields (`Category`, `Item`) are **rejected**.
- Unknown `Priority` / `Owner` values are **coerced** to defaults (not rejected), reported in preview as warnings.
- Preview screen shows: count of valid rows, list of rejected rows (row number + reason). Admin confirms "Import N valid rows, skip M rejected" or cancels.

## Cascade semantics

### File deletion → checklist link

- `checklist_item_files` has `ON DELETE CASCADE` on both FKs.
- After a link row is removed (deletion or manual unlink):
  - If 0 remaining links for the item *and* status = `in_progress` → revert to `not_started`.
  - If status ∈ {`received`, `waived`, `n_a`} → status is unchanged (admin set it explicitly).

### File move (folder change)

- Link unaffected. Item's `folder_id` is unchanged (controls future upload destination, not the whereabouts of already-linked files).

### File versioning

- Links point to specific `files.id`. New versions (new `files` rows) do not auto-link. Admin can manually link the new version.

### Folder deletion with referencing items

- **Blocked.** Folder delete API returns error with count of referencing items. Admin must reassign or delete the items first.

### Workspace deletion

- Standard cascade: `workspaces` → `checklists` → `checklist_items` → `checklist_item_files`.

### Soft-delete caveat

Today's file soft-delete is a client-side 10-second undo only — the DB row isn't actually removed. Links stay intact during that window. When true server-side soft-delete ships (separate work), this cascade model applies.

## Notifications (MVP)

One new event: **`checklist_item_assigned`**

- Fires when `owner` transitions from `unassigned` → any concrete side (`seller`, `buyer`, `both`).
- Recipients: workspace participants whose role maps to the new owner (per the permissions table).
- Uses existing `notification_queue` infrastructure. `notifyUploads` is unrelated — that continues to fire on file uploads independently.
- Batched per admin session: if the admin assigns 12 items to seller in one sitting, the seller participant receives a single summary email ("12 new checklist items assigned to you") rather than 12.

Everything else (Received / Waived / item-linked / item edited) is in-app only for MVP.

## UI placement

### Left sidebar

```
┌─────────────────────────────┐
│ ▣ Checklist    (14 open)    │  ← pinned, top of sidebar
├─────────────────────────────┤
│ Folders                     │
│  📁 Legal         (12)      │
│  📁 Financials     (8)      │
│  📁 IP             (4)      │
│  ...                        │
└─────────────────────────────┘
```

- "Checklist" entry is always present (admin + participants) when a checklist exists for the workspace.
- Counter shows count of items visible to the viewer with status ∈ {`not_started`, `in_progress`} (i.e., "open for me").
- Clicking renders the checklist table in the center panel, replacing the DealOverview / FileList.

### Center panel — checklist table (desktop)

```
[☐] # │ Category │ Item (click=upload)        │ Priority │ Owner    │ Status       │ Files │ ···
[☐] 29│ Legal    │ Corporate Formation Docs   │ High     │ Seller   │ Not Started  │   0   │
[☐] 30│ Legal    │ Capitalization Table       │ Critical │ Seller   │ In Progress  │   1   │
[☐] 31│ Legal    │ Material Contracts         │ Critical │ Seller   │ Received     │   7   │
```

- Click item name → Upload modal with folder + item pre-filled.
- Click status chip (admin only) → status popover.
- Expand row → linked files, notes, dates, per-row actions.
- Multi-select → sticky bulk-action bar.

### Mobile / narrow viewport

Collapse to stacked card per row: Item name + category badge + status chip + owner chip. Tap card expands. Tap item name opens upload modal.

## Open-for-implementation considerations (not blockers)

- **Preview parsing:** use `exceljs` or `xlsx` for `.xlsx` read; decide at implementation time which one the repo already pulls in or prefers.
- **Large imports:** MVP doesn't need streaming — a typical diligence list is 50–200 rows, trivially imported synchronously.
- **Counter on sidebar:** can start as a server-rendered value (page load snapshot) and upgrade to live like `fileCounts` later. Not a blocker for MVP.
- **Activity feed display:** activity rows for new checklist actions should format naturally in `ActivityRow.tsx` — add verb mappings for the new `action` values.

## Success criteria

- [ ] Admin can import an `.xlsx` matching the screenshot format in under 30 seconds from drop to confirmed.
- [ ] Import creates folders for new categories and respects existing folders.
- [ ] Seller participant logged in with `seller_rep` role sees only seller-owned + both-owned rows.
- [ ] Clicking an item name opens the upload modal with the correct folder and item pre-filled.
- [ ] First successful upload via item-click transitions status to `in_progress` without admin intervention.
- [ ] Admin can mark an item `Received` via the status chip, and the state persists across file deletions.
- [ ] `view_only` with `shadow_side = seller` sees seller rows read-only with no upload affordance.
- [ ] Folder deletion is blocked while checklist items reference it.
- [ ] `checklist_item_assigned` notification reaches the correct participants after batch assignment.
