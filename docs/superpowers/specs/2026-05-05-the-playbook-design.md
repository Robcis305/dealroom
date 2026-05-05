# Design: The Playbook (CIS Deal Room v1.3)

**Date:** 2026-05-05
**Status:** Approved (brainstorm), pending implementation plan

## 1. Overview

Turn the data room from passive document storage into an active diligence prep tool. Every workspace gets the canonical 48-item Data Room Construction Playbook as an always-on overlay. Sellers and CIS team see a readiness score, the 5 deal-killers as a pinned section, and a soft gate before inviting buyers when items remain blocked. Investors see no playbook UI — they see the doc room as today.

The reframe: a data room is not a list of things to upload, it is a list of things to resolve.

## 2. Scope

### In scope (v1.3)

- Canonical 48-item playbook structure, seeded as a single source of truth
- Per-deal state for each canonical item, plus support for custom items
- Six fixed categories (corporate/legal, financial, commercial, team/HR, IP/technical, operations/risk)
- New `blocked` status
- DealOverview readiness section (score + 5 deal-killer chips + per-category progress bars), kept above an unchanged activity stream
- Restructured checklist tab grouped by canonical category, with rationale text, deal-killer accents, and a custom-items section per category
- Buyer-invite friction modal that fires when any deal-killer item is unresolved

### Out of scope (deferred)

- Stage timeline (Day 1-3 → Day 21-28 sequencing per playbook)
- Bridge-document workflows (cap table reconciliation wizard, ARR bridge builder, IP audit)
- Cross-deal analytics ("which item stalls deals most?")
- Investor-perspective folder reorg (sub-project C)
- Pre-flight self-review wizard ("walk through as if you're the investor")
- Playbook variants by deal stage or type

## 3. Architecture

### New table: `playbook_items` (seeded once)

The canonical 48-item playbook lives in its own table. Single source of truth, upgradeable via migration without per-deal touch.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | Stable, referenced by checklist_items |
| `number` | int | 1–48, canonical position |
| `category` | enum | `corporate_legal` / `financial` / `commercial` / `team_hr` / `ip_technical` / `operations_risk` |
| `name` | text | Item label |
| `rationale` | text | "Why investors check this" copy from the playbook |
| `deal_killer_group` | enum nullable | NULL for non-killers. Otherwise one of `cap_table` / `eighty_three_b` / `customer_coc` / `ip_assignment` / `revenue_bridge`. Items 5, 8, 23, 33+34, 14+16 receive these tags respectively. |
| `default_priority` | enum | `critical` / `high` / `medium` / `low` |
| `sort_order` | int | Within category |

The five deal-killer groups collapse 7 underlying playbook items into 5 conceptual chips on DealOverview. A group's effective status is the worst-of its members (red > gray > yellow > green).

### Modified table: `checklist_items`

- Add `playbook_item_id` — nullable uuid FK to `playbook_items.id`. NULL = custom item; NOT NULL = canonical item per-deal state.
- Relax `folder_id` to nullable. Canonical items don't need a folder; files attach via `checklist_item_files`. Existing rows keep their `folder_id`.
- Constrain `category` to the same 6-value enum (custom items must pick one of the six — no free text).
- Unique constraint: `(checklist_id, playbook_item_id)` where `playbook_item_id IS NOT NULL` — one canonical item per checklist.

### Modified enum: `checklist_status`

Add `blocked` value. Final progression: `not_started` → `in_progress` → `blocked` → `received` / `waived` / `n_a`.

`received`, `waived`, and `n_a` count toward the readiness score. `blocked` and `not_started` do not.

### Virtual rows pattern

Fresh workspace = no `checklist_items` rows for canonical items. The DAL returns a merged view: every `playbook_item` LEFT JOIN `checklist_items` (workspace-scoped) — defaulting to `not_started` / no owner / no notes / no files when no row exists. A row is upserted only when status changes, notes are added, or files are linked.

This keeps workspace creation cheap, makes playbook upgrades automatic, and means the 48-item canon is never out of sync per deal.

## 4. Components

### Seller-side prep view (existing checklist page, restructured)

Located on the existing checklist tab inside `/workspace/[id]`. Visible to roles: `seller`, `cis_team`. Hidden for `buyer`.

- Items grouped by canonical category in playbook order (corporate/legal first → operations/risk last)
- Each item card displays: number, name, status pill, priority chip, owner, file links, notes
- Expand reveals the rationale text inline ("why investors check this")
- Deal-killer items get a red border accent and pin to the top of their category
- Custom items appear in a separate "Custom" section per category with an "Add custom item" CTA
- Filters: status, owner, deal-killers only

### DealOverview readiness section (above the activity stream)

Replaces the existing card-grid on `/workspace/[id]` overview. Two-section layout matches the previously scoped DealOverview rebuild:

**Top: Readiness panel**
- Headline: "Readiness: 32 / 48 (67%)"
- Five deal-killer chips, one per `deal_killer_group`, with color-coded status (worst-of underlying items):
  - Green: all members received / waived / n_a
  - Yellow: any member in_progress (no blocked / not_started members)
  - Gray: any member not_started (no blocked members)
  - Red: any member blocked
- Six thin progress bars by category (one per canonical category)
- "Open checklist" CTA → deep-links to the checklist tab

**Below: Activity stream** (unchanged from prior DealOverview brief — "what's new since your last visit" event stream)

Each deal-killer chip deep-links to that item in the checklist tab (scrolls + highlights).

Visibility: `seller`, `cis_team` see the readiness panel. `buyer` sees only the activity stream (or whatever the current/prior buyer-side overview shows).

### Buyer-invite modal (extension of existing participant flow)

When a user adds or invites a participant with role = `buyer`:

- 0 deal-killers outstanding → existing flow proceeds, no friction
- ≥1 deal-killer outstanding → modal opens, lists each unresolved deal-killer with a link to its checklist item, requires the user to type the literal phrase `share anyway` (case-insensitive) before the invite button enables
- On confirmation, the invite proceeds and an entry is written to `activity_logs` with: actor user, target email, count of unresolved deal-killers, and the list of `playbook_item_id`s outstanding at time of send
- Seller-side (`seller`) and CIS-team (`cis_team`) invitations bypass this gate entirely

The phrase is intentionally low-friction (typed acknowledgement) but creates a deliberate moment and an audit trail. It is not a hard block.

## 5. Data flow

1. **Workspace created** → no `checklist_items` rows; playbook overlay loads via virtual merge from `playbook_items`.
2. **User opens checklist** → DAL: `playbook_items LEFT JOIN checklist_items ON checklist_items.playbook_item_id = playbook_items.id AND checklist_items.checklist_id = ?`. Returns 48 canonical + N custom rows.
3. **Status change / notes / file link on a canonical item** → upsert `checklist_items` keyed by `(checklist_id, playbook_item_id)`.
4. **DealOverview readiness query** → count canonical items with effective status ∈ (`received`, `waived`, `n_a`) divided by 48. Deal-killer subset query filters `is_deal_killer = true`. Custom items are visible in the checklist but do not count toward the 48-denominator score (they are visible signal, not gate signal).
5. **Buyer invite** → API checks `deal_killer_group IS NOT NULL AND effective_status NOT IN (received, waived, n_a)` for the workspace, then groups results by `deal_killer_group`. If any group has at least one outstanding item, response returns the affected groups; UI renders the friction modal. Otherwise the existing invite flow runs unchanged.

## 6. Migration strategy

1. **`0008_playbook_items.sql`**
   - Create `playbook_items` table
   - Create `playbook_category` enum (six values)
   - Add `blocked` to `checklist_status` enum
   - Add nullable `playbook_item_id` FK to `checklist_items`
   - Make `folder_id` nullable on `checklist_items`
   - Swap `checklist_items.category` to use the canonical 6-value enum. Existing free-text values are mapped via an explicit lookup table embedded in the migration (e.g. `Legal` → `corporate_legal`, `Financials` → `financial`, `Customers` → `commercial`, `Team` → `team_hr`, `IP`/`Engineering` → `ip_technical`, `Risk`/`Insurance` → `operations_risk`). Anything unmatched defaults to `corporate_legal` and is logged to a `migration_notes` table for one-time CIS-team review.

2. **`0009_seed_playbook.sql`**
   - INSERT the 48 canonical playbook items with rationale text, `is_deal_killer` flags, default priorities, and sort order — sourced verbatim from the Data Room Construction Playbook PDF.

3. **Existing checklist data**
   - All existing rows preserved with `playbook_item_id = NULL` (treated as custom)
   - CIS team gets a one-time admin tool to optionally relink existing items to canonical playbook IDs (out of scope to build automatically; manual relink via UI is sufficient)

The migrations are additive and reversible. Folder-id-required code paths in the API/DAL must be audited and updated to handle null folders for canonical items.

## 7. Testing approach

- Unit tests: DAL virtual-merge (no checklist_items rows / partial rows / custom items / canonical with file links)
- Unit tests: readiness score calculation (denominator = 48; deal-killer subset; status counted/not-counted edges)
- Unit tests: deal-killer outstanding query
- Integration test: buyer-invite endpoint returns outstanding deal-killers when present, empty otherwise
- Integration test: acknowledgement logged to `activity_logs` on buyer invite with outstanding deal-killers
- E2E happy path: fresh workspace → checklist shows 48 canonical items → mark all 5 deal-killers received → invite buyer → no modal
- E2E friction path: fresh workspace → leave deal-killers unresolved → invite buyer → modal appears, type `share anyway`, invite succeeds, activity log entry exists
- E2E negation: invite seller-role participant with deal-killers outstanding → no modal, no log entry

## 8. Open questions

None at design time. Implementation plan should resolve:

- Exact DAL shape (a single denormalized read endpoint vs. two queries merged client-side)
- Whether the buyer-invite modal lives in the existing `ParticipantFormModal` or a separate component
- How relink-to-canonical works for legacy items (UI shape, batch vs. one-at-a-time)
