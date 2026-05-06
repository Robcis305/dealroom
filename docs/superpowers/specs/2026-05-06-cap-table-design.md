# Design: Cap Table Reconciliation (CIS Deal Room v1.5)

**Date:** 2026-05-06
**Status:** Approved (brainstorm), pending implementation plan

## 1. Overview

Upload a structured cap table CSV → parse into typed rows → render on a dedicated `/workspace/[id]/cap-table` page with rounds summary, grouped rows, and validation warnings. Draft → Published toggle controls investor visibility. Publishing auto-marks playbook item #5 (Cap table) as `received`; unpublishing reverts it to `in_progress`. Re-upload replaces the live cap table; previously-published versions get archived in the activity log (admin-only audit trail). Standalone reconciliation: only self-checks (math, totals, no-duplicates, round-valuation consistency); no cross-reference to other playbook items.

The reframe: investors get a structured, machine-validated cap table that's a first-class part of the data room, not "just another file" buried in a folder.

UI work in this spec is to be designed via the **`ui-ux-pro-max`** skill (consistent with v1.3 and v1.4 patterns). Read `.impeccable.md` and `design-system/cis-deal-room/MASTER.md` first.

## 2. Scope

### In scope (v1.5)

- Strict opinionated CSV schema (13 columns: 7 required + 6 optional)
- Upload + parse + persist (rows materialized as DB rows; file kept on S3 for download)
- Live page at `/workspace/[id]/cap-table` with header, rounds summary, grouped rows, warnings banner
- Draft → Published toggle (admin only); buyers see the page only when published
- Original CSV download (pass-through via existing presign infra)
- Sidebar entry "Cap table" in WorkspaceShell
- Auto-coupling to playbook item #5: published → received; unpublished → in_progress; cap_table deleted → not_started
- Replace-on-reupload (single live cap table per workspace; previous published file archived in activity log)
- Both sell-side and buy-side workspaces

### Out of scope (deferred)

- Flexible column mapping (parse-approach option B — future v1.6+)
- In-app cap table editing or row-level edits
- Cross-document reconciliation (against board consents, SAFEs, option grants)
- PDF download generation
- Multiple cap tables per workspace / version diffing UI / restore from history
- Vesting math validation
- 409A freshness check
- SAFE/note conversion modeling (we display SAFE rows as-is; no convert-at-N modeling)
- Cross-deal analytics ("which clients' cap tables stall the most")
- Per-stockholder timeline / history

## 3. Architecture

### New tables (migration 0014)

**`cap_tables`** — one row per workspace; replaced on each upload.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `workspace_id` | uuid FK | UNIQUE — only one cap table per workspace at a time |
| `file_id` | uuid FK → `files` | The original CSV (live in S3, retrievable via existing presign infra) |
| `status` | enum `cap_table_status` | `draft` / `published` |
| `uploaded_by` | uuid FK → `users` | |
| `uploaded_at` | timestamp | |
| `published_at` | timestamp nullable | Set when status flips to `published`; cleared on unpublish |
| `published_by` | uuid FK nullable | |
| `parse_warnings` | jsonb | Array of `{row: number, code: string, message: string}` |
| `created_at` / `updated_at` | timestamp | |

**`cap_table_rows`** — N rows per cap_table; full re-parse on each upload (cascade delete preserves no rows from the prior).

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `cap_table_id` | uuid FK ON DELETE CASCADE | |
| `row_number` | int | Preserves CSV order |
| `holder` | text NOT NULL | |
| `class` | text NOT NULL | Free text label (e.g. "Common", "Series A Preferred") |
| `instrument` | enum `cap_table_instrument` | One of: `common` / `preferred` / `option` / `rsu` / `safe` / `convertible_note` / `warrant` |
| `shares` | bigint NOT NULL | |
| `ownership_percent` | numeric(7,4) NOT NULL | 0–100 with up to 4 decimal places |
| `price_per_share` | numeric(20,8) NOT NULL | Up to 8 decimals to handle fractional founder common pricing ($0.0001) |
| `amount_invested` | numeric(20,2) NOT NULL | $ amount |
| `round` | text nullable | |
| `round_valuation` | numeric(20,2) nullable | |
| `vesting_start` | date nullable | |
| `vesting_schedule` | text nullable | |
| `certificate_number` | text nullable | |
| `notes` | text nullable | |
| `created_at` | timestamp | |

### New enums

- `cap_table_status`: `draft`, `published`
- `cap_table_instrument`: `common`, `preferred`, `option`, `rsu`, `safe`, `convertible_note`, `warrant`

### Extended `activity_action` enum

Three new values: `cap_table_uploaded`, `cap_table_published`, `cap_table_unpublished`.

The unpublish-by-replacement event records the previous published version's `file_id`, `uploaded_at`, `summary` (rows count + total shares + total invested) in the `metadata` jsonb, so admins can reconstruct version history from the activity log even though the row itself is gone.

### Migration

`cis-deal-room/src/db/migrations/0014_cap_table.sql` + `cis-deal-room/scripts/apply-0014-direct.mjs` per the established pattern. Additive only — new tables, new enums, new enum values. Idempotent. Applied locally first, then to shared preview/prod DB.

## 4. CSV schema

13 columns (7 required + 6 optional). Headers are case-insensitive; we accept `Holder`, `holder`, `HOLDER` etc.

| Column | Required | Type | Notes |
|---|---|---|---|
| `Holder` | ✓ | text | Stockholder name (person or entity) |
| `Class` | ✓ | text | Free text label |
| `Instrument` | ✓ | enum | One of the 7 values (case-insensitive match) |
| `Shares` | ✓ | int ≥ 0 | |
| `Ownership %` | ✓ | decimal 0–100 | Fully-diluted % |
| `Price per Share` | ✓ | decimal ≥ 0 | Purchase price for common/preferred; strike for options/warrants/RSUs; projected conversion price for SAFE/note |
| `Amount Invested` | ✓ | decimal ≥ 0 | $ that flowed in. = Shares × Price/Share for purchases; = principal for SAFE/note; = $0 for unexercised options/RSUs/warrants |
| `Round` | optional | text | "Founders" / "Series A" / "Series Seed-2" / "ESOP" / etc. |
| `Round Valuation` | optional | decimal ≥ 0 | Post-money valuation. Repeated per row in the same round (denormalized in the CSV) |
| `Vesting Start` | optional | date ISO 8601 | YYYY-MM-DD |
| `Vesting Schedule` | optional | text | "4yr / 1yr cliff" or free |
| `Certificate / Grant #` | optional | text | |
| `Notes` | optional | text | |

## 5. Reconciliation logic

### Parse-time errors (block upload)

- Any required column missing from CSV header
- Any required field empty in any row
- `Instrument` value not in the 7-value enum (case-insensitive comparison)
- `Shares` < 0, non-integer, or non-numeric
- `Ownership %` outside 0–100 or non-numeric
- `Price per Share` < 0 or non-numeric
- `Amount Invested` < 0 or non-numeric
- `Round Valuation` differs across two rows sharing the same `Round` value

When any error fires, parse fails: API returns 400 with `{ errors: ParseError[] }`; nothing persists.

### Parse-time warnings (display, don't block)

- Sum of `Ownership %` deviates from 100 by more than 0.5 (could be intentional with rounding, but worth surfacing)
- For purchases (`common` or `preferred` instrument): `|Shares × Price per Share − Amount Invested| > $1` (rounding tolerance)
- Empty `Round` field on a `preferred` instrument row (every preferred should belong to a round)

Warnings persist to `cap_tables.parse_warnings`. Admins see them in a banner; buyers don't.

### Display-time reconciliation surface (page)

- Total fully-diluted shares (sum of `shares` across all rows)
- Sum of `Ownership %` (with delta callout if off from 100%)
- Per-instrument breakdown: count + total shares + % of fully-diluted
- Per-round breakdown: total invested + total shares + valuation
- Warnings banner (admin-only)

## 6. Components

### CSV parser (DAL)

`cis-deal-room/src/lib/cap-table/parse-csv.ts` — pure, deterministic function. Takes raw CSV text, returns `{ rows, errors, warnings }`. No DB access. Self-contained and unit-testable. Handles BOM, quoted fields, commas-in-quotes per RFC 4180.

### Cap-table DAL

`cis-deal-room/src/lib/dal/cap-table.ts` exports:
- `getCapTableForWorkspace(workspaceId)` — returns the cap_tables row + rows + warnings, or `null` if none
- `uploadCapTable({ workspaceId, fileId, parsed })` — transactional: archives prior published file_id to activity log, deletes prior rows, inserts new
- `publishCapTable(workspaceId)` — flips status, sets published_at/by, calls `setCanonicalItemStatus(...item-5..., 'received')`
- `unpublishCapTable(workspaceId)` — flips status, clears published_at/by, calls `setCanonicalItemStatus(...item-5..., 'in_progress')`
- `getCapTableForViewer(workspaceId, sessionScope)` — applies the visibility gate; returns `null` for buyer-side viewing a draft

The item-5 lookup happens by `playbook_items.number = 5` (the canonical "Cap table" row from the v1.3 seed). Looked up at runtime, not hardcoded.

### API endpoints

- `POST /api/workspaces/[id]/cap-table/upload` — multipart CSV; admin only; returns parse result
- `GET /api/workspaces/[id]/cap-table` — returns the full cap-table view (rows + summary + warnings); applies visibility gate
- `PATCH /api/workspaces/[id]/cap-table/status` — body `{ target: 'published' | 'draft' }`; admin only
- `GET /api/workspaces/[id]/cap-table/download` — issues presigned URL for original CSV; applies visibility gate

### Cap table page (`cis-deal-room/src/app/(app)/workspace/[workspaceId]/cap-table/page.tsx`)

Full route, not a tab in WorkspaceShell. Reuses WorkspaceShell's sidebar + chrome but the center pane is the cap table view, not a `view.kind` value.

Page layout (designed via ui-ux-pro-max):

1. **Header bar**: "Cap Table" title + status pill (`Draft` / `Published`) + last-uploaded timestamp + admin-only buttons (Replace Upload / Publish / Unpublish / Download CSV)
2. **Warnings banner** (admin/seller-side only): collapsed summary of parse warnings; expand to see per-row details
3. **Rounds Summary**: cards or rows showing each unique `Round` value with: round name, total invested, total shares, valuation, member count. Rows without a Round bucket into "Pre-financing / Grants"
4. **Cap Table**: rows grouped by Instrument in this order: `common` → `preferred` → `option` → `rsu` → `warrant` → `safe` → `convertible_note`. Per-group subtotal at the bottom of each section. Columns shown adapt to the group (e.g., SAFE rows hide `Vesting Start`, common rows show it). Sortable by Holder name within each group.

### Sidebar entry

New entry in `WorkspaceShell.tsx`'s sidebar, between "Checklist" and the folder list: **"Cap table"**. State indicator pill:
- No cap table uploaded → no pill (or muted "—")
- `draft` → "Draft" pill (admin/seller-side only)
- `published` → "Published" pill (all roles)

For buyer-side viewers when status is `draft`: sidebar entry visible but the page renders an empty state ("Cap table not yet shared by the seller").

### Upload flow component

A modal or full-page upload step (TBD by ui-ux-pro-max):
- Drag-drop or file picker for CSV
- On submit: POST to upload endpoint
- On parse errors: render the error list (line + column + message) inline; no DB write happened
- On success: redirect/refresh to the live page in `draft` status

## 7. Data flow

1. **Admin uploads CSV** → POST endpoint receives file → parser runs → errors return 400 (no persistence) OR success persists rows + warnings
2. **Admin reviews on page** → sees warnings banner + rounds summary + grouped table → fixes data offline if needed → re-uploads or clicks Publish
3. **Publish** → PATCH → `cap_tables.status = published` + `setCanonicalItemStatus(...item-5..., 'received')` → activity log entry with action `cap_table_published`
4. **Buyer accesses /cap-table** → GET applies visibility gate → returns full data (status=published) or empty-state response (status=draft)
5. **Admin uploads new version** → previous published file's metadata snapshotted in activity log → cap_tables row replaced → status resets to `draft` → item #5 reverts to `in_progress` until republished

## 8. Visibility gating (re-stating)

| Role | Sidebar entry | Draft cap table | Published cap table |
|---|---|---|---|
| `admin` / `cis_team` | always visible | full page | full page |
| `seller_rep` / `seller_counsel` | always visible | full page | full page |
| `buyer_rep` / `buyer_counsel` | always visible | empty state | full page |
| `client` on a sell-side workspace | always visible | full page | full page |
| `client` on a buy-side workspace | always visible | empty state | full page |
| `view_only` (shadow=seller) | always visible | full page | full page |
| `view_only` (shadow=buyer) | always visible | empty state | full page |
| `counsel` (deprecated) | hidden | empty state | empty state |

Empty state copy: "Cap table not yet shared by the seller. Check back when it's published."

## 9. Migration strategy

1. **`0014_cap_table.sql`** — creates `cap_table_status` enum, `cap_table_instrument` enum, `cap_tables` table, `cap_table_rows` table, extends `activity_action` enum with 3 new values
2. **`apply-0014-direct.mjs`** — idempotent direct-apply script per the established pattern
3. Applied to local dev DB first; then to shared preview/prod DB after verification

No backfill — existing workspaces start with no cap table. The sidebar entry shows but the page invites upload.

## 10. Testing approach

### DAL unit tests
- `parse-csv` happy path (valid CSV → rows + zero errors)
- `parse-csv` errors: missing required column, missing required field, non-enum instrument, negative shares, ownership > 100, round-valuation mismatch
- `parse-csv` warnings: ownership sum off, math mismatch, preferred without round
- `uploadCapTable` archives prior published file_id in activity log on replace
- `publishCapTable` flips item #5 to `received`
- `unpublishCapTable` flips item #5 to `in_progress`
- Visibility gate: buyer + draft → null; buyer + published → full

### API integration tests
- Upload returns 400 with error list on parse error; no DB writes
- Upload returns 201 on success
- Status PATCH triggers item-5 update
- Download issues presigned URL only when visibility allows
- GET returns empty-state for buyer + draft

### Component tests
- Cap table page renders rounds summary aggregated by Round
- Rows grouped by Instrument in the right order
- Warnings banner appears for admin only
- Empty state renders for buyer + draft

### E2E manual
- Upload valid CSV → see warnings banner → publish → buyer view → re-upload → re-publish

## 11. Open questions

None at design time. Implementation plan should resolve:

- Multipart upload mechanism: direct multipart-form POST, or presigned-S3-upload then a separate confirm-and-parse call? Existing file-upload uses the presigned pattern; cap table COULD reuse that for consistency. Decision deferred to implementation.
- Parse warning persistence: store as jsonb (proposed) or as separate `cap_table_warnings` rows? Jsonb is simpler; separate table allows querying but is overkill for v1. Going with jsonb.
- Column-name flexibility: the spec says "case-insensitive header match." We could also accept whitespace variations ("Ownership%" vs "Ownership %") — TBD by parser implementation; the goal is "be permissive about formatting, strict about content."
