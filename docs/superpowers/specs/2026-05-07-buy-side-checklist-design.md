# Design: Buy-side Custom Checklist (CIS Deal Room v1.6)

**Date:** 2026-05-07
**Status:** Approved (brainstorm), pending implementation plan

## 1. Overview

For buy-side advisory workspaces, replace the canonical 48-item Data Room Construction Playbook with a custom-uploaded request list. Admins upload their own .xlsx or .csv → existing PR #8 parser → DB inserts → renders in the existing Checklist tab. Cap table feature is unaffected (it's standalone, works on either advisory side). Readiness panel becomes a simple "Items received: X / N" counter on buy-side workspaces. Sell-side workspaces are unchanged.

The reframe: on buy-side, items are framed as "we're requesting from the seller" rather than "we're preparing for an investor". The 48-item canonical playbook was authored as a sell-side prep tool — it's not a meaningful starting point for a buy-side request list.

## 2. Scope

### In scope (v1.6)

- New rule: when `cisAdvisorySide = 'buyer_side'`, the canonical 48-item playbook overlay is hidden across all surfaces (checklist tab, readiness panel)
- Existing `POST /api/workspaces/[id]/checklist/import` endpoint extended to accept `.csv` in addition to `.xlsx` (single parser handles both via the `xlsx` library)
- Re-upload replaces the existing checklist on buy-side (relaxes the current "409 if exists" behavior); sell-side keeps the 409 (preserves v1.3 invariant that the canonical playbook IS the checklist on sell-side)
- One-time data migration cleans up canonical-overlay rows on existing buy-side workspaces so the import flow doesn't conflict with v1.3 auto-created items
- `ReadinessPanel` adapts on buy-side: simple "Items received: X / N" counter + thin bar; no deal-killer chips, no stage progress bars
- Sell-side workspaces are unchanged from v1.4 behavior

### Out of scope (deferred)

- Named/reusable template library (option B from the brainstorm — future v1.7+)
- A built-in "Buy-side Standard Request List" canonical template (would belong in the template library)
- Per-workspace toggle to switch between canonical and custom (smart-default by `cisAdvisorySide` is enough for v1.6; if a buy-side deal needs the canonical view, the toggle is a future addition)
- Cross-deal analytics over imported items
- Rich editing of imported items beyond what PR #8 already supports
- Stage-style independent progress on imported items
- Cap table publish coupling to a custom checklist item (currently couples only to canonical item #5; on buy-side this auto-coupling is a no-op — by design)

## 3. Architecture

### No new tables

Reuses the existing `checklist_items` schema. Imported buy-side items have:
- `playbook_item_id IS NULL` (custom item — same shape as today's import flow uses)
- All existing columns: `category`, `name`, `description`, `priority`, `owner`, `status`, `notes`, `folder_id`, `requested_at`, `received_at`

The semantic flip ("requesting" vs "preparing") is presentation-only. No schema change.

### New DAL helper: `shouldShowCanonicalPlaybook`

A pure function in `cis-deal-room/src/lib/dal/playbook.ts`:

```ts
export function shouldShowCanonicalPlaybook(
  workspace: { cisAdvisorySide: CisAdvisorySide },
): boolean {
  return workspace.cisAdvisorySide === 'seller_side';
}
```

Used by:
- `GET /api/workspaces/[id]/checklist` (decides response shape)
- `GET /api/workspaces/[id]/readiness` (decides response mode)
- `ensureChecklistForWorkspace` in `lib/dal/checklist.ts` (decides whether to auto-create)

### Import endpoint changes

`POST /api/workspaces/[id]/checklist/import` (existing) gets two changes:

1. **Accept CSV in addition to XLSX.** The parser at `cis-deal-room/src/lib/checklist/parse-xlsx.ts` is currently XLSX-specific. Renamed to `parse-checklist-file.ts`, the parser detects file type from the upload and routes to the right `XLSX.read()` mode (the `xlsx` library handles `.csv` natively via `XLSX.read(text, { type: 'string' })`). The frontend `ChecklistImportModal.tsx` updates its file picker `accept` attribute to include both extensions.

2. **Replace-on-reupload (buy-side only).** Currently returns 409 if a checklist exists. New behavior:
   - If `cisAdvisorySide = 'buyer_side'`: cascade-delete existing `checklist_items` for the workspace's checklist, keep the `checklists` row, insert new items.
   - If `cisAdvisorySide = 'seller_side'`: keep the 409 (sell-side workflow assumes the canonical playbook is the checklist; replace would clobber playbook state).
   - Activity log entry on success: `checklist_imported` (existing action).

### Auto-create checklist behavior

The v1.3 `ensureChecklistForWorkspace` helper (in `lib/dal/checklist.ts`) auto-creates a `checklists` row when a playbook-eligible viewer GETs `/checklist`. For buy-side workspaces, this auto-create is now skipped — the import flow becomes the explicit way to populate the checklist. Sell-side behavior is unchanged.

### `GET /checklist` response shape

When `shouldShowCanonicalPlaybook(workspace) === false` (buy-side):
- Return `{ checklist, items }` (the legacy shape used for buyer-side viewers in v1.3)
- `playbook` field is absent
- `items` are the imported custom items (no canonical merge)
- The frontend `ChecklistView` already routes to `ChecklistTable` when `playbook` is null — no UI change needed for this branch

When `shouldShowCanonicalPlaybook(workspace) === true` (sell-side):
- Existing v1.3 behavior — `{ checklist, playbook }` with the 48-item canonical overlay

### `GET /readiness` response shape

Two response modes:

```ts
type ReadinessResponse =
  | {
      mode: 'canonical';
      total: number;          // 48
      ready: number;
      byCategory: Record<PlaybookCategory, { total: number; ready: number }>;
      byStage: Record<Stage, { total: number; ready: number; label: string; dayRange: string }>;
      dealKillerGroups: Array<{ group: DealKillerGroup; status: ChecklistStatus; color: DealKillerGroupStatus; members: Array<{...}> }>;
    }
  | {
      mode: 'simple';
      total: number;          // count of imported items
      ready: number;          // items where status ∈ (received, waived, n_a)
    };
```

The route picks the mode by calling `shouldShowCanonicalPlaybook(workspace)`.

### Migration: existing buy-side workspaces

Existing buy-side workspaces may already have:
1. An auto-created `checklists` row (from v1.3 `ensureChecklistForWorkspace`)
2. `checklist_items` rows: some with `playbook_item_id IS NOT NULL` (canonical items that were touched by an admin during v1.3-1.5), some with `playbook_item_id IS NULL` (any imports or custom adds)

A one-time data migration deletes canonical-overlay items only on buy-side workspaces:

```sql
DELETE FROM checklist_items
WHERE playbook_item_id IS NOT NULL
  AND checklist_id IN (
    SELECT c.id FROM checklists c
    JOIN workspaces w ON w.id = c.workspace_id
    WHERE w.cis_advisory_side = 'buyer_side'
  );
```

This preserves any existing custom items (e.g., Project Chronos's previously-imported 79 items stay intact; only the canonical-overlaid rows get cleaned up). Run via `apply-0015-direct.mjs`. No schema change.

## 4. Components

### `ChecklistView` (existing, no changes needed)

Already routes correctly: when API returns `{ checklist, playbook }`, renders `PlaybookChecklistView`; when API returns `{ checklist, items }`, renders `ChecklistTable`. The "Import diligence checklist" empty-state CTA already exists for the no-checklist case. New behavior: that CTA fires for fresh buy-side workspaces (since auto-create is skipped).

### `ChecklistImportModal` (existing, minimal change)

Currently `accept=".xlsx"`. Update to `accept=".xlsx,.csv,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"`. The parser handles the rest.

### `ReadinessPanel` (modify)

Add a `mode` prop derived from the readiness response:

```tsx
type ReadinessSummary =
  | { mode: 'canonical'; total: number; ready: number; byCategory: ...; byStage: ...; dealKillerGroups: ... }
  | { mode: 'simple'; total: number; ready: number };
```

When `mode === 'simple'`:
- Headline: "Items received: 12 / 48 (25%)" (the items being the imported custom items)
- Single thin progress bar across full width
- "Open checklist" link → switches view to checklist tab
- No deal-killer chips, no stage rows, no per-category bars

When `mode === 'canonical'`:
- Existing v1.4 layout: 5 deal-killer chips + 4 stage rows

The mode is decided at the API layer based on `cisAdvisorySide`. The component is reused.

UI work for the simple-mode design uses **`ui-ux-pro-max`** (consistent with the v1.3-v1.5 pattern).

### Sidebar entries

Unchanged. "Deal overview", "Checklist", "Cap table" all work on both advisory sides.

## 5. Data flow

### Fresh buy-side workspace, admin opens Checklist tab

1. `GET /api/workspaces/[id]/checklist` → server detects `cisAdvisorySide = 'buyer_side'` → `shouldShowCanonicalPlaybook = false` → `ensureChecklistForWorkspace` is NOT called → response is `{ checklist: null, items: [], playbook: null }`
2. `ChecklistView` sees no checklist → renders the existing "Import diligence checklist" empty-state CTA
3. Admin clicks Import → `ChecklistImportModal` opens → admin picks a `.csv` or `.xlsx` file → modal parses client-side via `parse-checklist-file.ts` → POSTs to `/checklist/import` with the parsed rows
4. Server: `createChecklist` creates the row, then inserts all items, then logs `checklist_imported` activity
5. Modal closes, page refreshes, `ChecklistView` now sees `{ checklist, items: [...] }` and renders `ChecklistTable`

### Re-import on a buy-side workspace

1. Admin clicks Import again (the existing button — wherever it lives in `ChecklistTable` for the workspace, or via a "Re-upload" affordance to be added if missing)
2. `ChecklistImportModal` flows as before
3. Server-side: detects existing checklist, sees `cisAdvisorySide = 'buyer_side'`, cascade-deletes existing `checklist_items` (preserves the `checklists` row), inserts new items
4. Activity log entry on each import

### DealOverview readiness on buy-side

1. `GET /api/workspaces/[id]/readiness` → server detects buy-side → returns `{ mode: 'simple', total: 24, ready: 5 }` (numbers from the imported items)
2. `ReadinessPanel` renders the simple mode

### Sell-side workspace (unchanged)

Existing v1.3-v1.5 behavior preserved end-to-end.

### Cap table (unchanged on either side)

`/workspace/[id]/cap-table` works the same. Publish auto-couples to playbook item #5 — but on buy-side, item #5 doesn't exist (no canonical items), so the coupling is a no-op. By design.

## 6. Visibility on buy-side workspaces

| Role | Checklist tab | Readiness panel | Cap table |
|---|---|---|---|
| `admin` / `cis_team` | full (all items) | simple counter | full |
| `client` (buyer) | full (all items) | simple counter | full when published, empty when draft |
| `buyer_rep` / `buyer_counsel` | full (all items) | simple counter | full when published, empty when draft |
| `seller_rep` / `seller_counsel` | owner-filtered | simple counter (filtered to their items) | full when published |
| `view_only` shadow=buyer | full | simple counter | full when published, empty when draft |
| `view_only` shadow=seller | owner-filtered | simple counter (filtered to their items) | full when published |

The owner-filter behavior for seller-side viewers preserves the existing PR #8 `ownerFilterForSession` logic — they see only items where `owner` is `seller` or `both`. The simple-counter total/ready for them reflects only their visible items.

## 7. Migration strategy

1. **`0015_buy_side_cleanup.sql`** + `apply-0015-direct.mjs` — runs the DELETE described in §3. Idempotent. No schema change. Applied locally first, then to shared preview/prod DB after review.
2. **No Drizzle schema changes.** The migration is purely data cleanup.

## 8. Testing approach

### DAL unit tests
- `shouldShowCanonicalPlaybook` returns `true` for `seller_side`, `false` for `buyer_side`
- `parse-checklist-file` handles both `.xlsx` and `.csv` inputs producing identical `ParseResult` shape
- Existing `parse-xlsx.test.ts` still passes after rename (rename + add CSV cases)

### API tests
- `POST /checklist/import` on a buy-side workspace with existing items → 200, items replaced, activity log entry
- `POST /checklist/import` on a sell-side workspace with existing items → 409 (preserved v1.3 invariant)
- `GET /checklist` on buy-side returns `{ checklist, items }` shape (no `playbook` field)
- `GET /checklist` on sell-side returns `{ checklist, playbook }` (existing behavior)
- `GET /readiness` on buy-side returns `{ mode: 'simple', total, ready }`
- `GET /readiness` on sell-side returns `{ mode: 'canonical', ... }` (existing v1.4 shape)
- `ensureChecklistForWorkspace` is NOT called on buy-side GETs

### Component tests
- `ReadinessPanel` renders simple counter when given `{ mode: 'simple' }`
- `ReadinessPanel` renders the existing v1.4 layout when given `{ mode: 'canonical' }`
- `ChecklistImportModal` accepts `.csv` files (file picker `accept` attribute)

### E2E manual
- Fresh buy-side workspace → checklist tab shows Import CTA → upload `.csv` request list → see items in `ChecklistTable` → readiness panel shows simple counter
- Re-import on the same buy-side workspace → existing items replaced, new items show
- Project Chronos (existing buy-side) → migration deletes canonical-overlay items, preserves the 79 originally-imported items
- Sell-side workspace (e.g., Avelia or another) → unchanged v1.4 behavior with stage panel + deal-killer chips

## 9. Open questions

None at design time. Implementation plan should resolve:

- Where the "Re-upload" button lives in the buy-side checklist UI when items already exist (the existing `ChecklistTable` doesn't have one — needs adding for buy-side, or the "Import" CTA can be re-surfaced)
- Whether the import endpoint detects buy-side automatically by looking up the workspace's `cisAdvisorySide`, or expects a flag from the client
- Backwards compat for the `parse-xlsx` import path: does the existing rename break any other call sites? (Should be only `cis-deal-room/src/app/api/workspaces/[id]/checklist/preview/route.ts` and the import route itself — verify in the plan)
