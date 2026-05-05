# The Playbook Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the data room into an active diligence prep tool by overlaying the canonical 48-item Data Room Construction Playbook on every workspace, surfacing readiness on DealOverview, and adding a soft gate before inviting buyer-side participants when deal-killer items are unresolved.

**Architecture:** A new `playbook_items` table holds the 48 canonical items as a single source of truth. The existing `checklist_items` table stores per-deal state, joined to playbook_items via a nullable FK; rows are virtual until a user touches an item (status change, file link, notes). Score and deal-killer queries are derived in the DAL. Buyer-side participant invites pass through a friction modal that requires a typed acknowledgement when any of the 5 deal-killer groups are outstanding.

**Tech Stack:** Next.js 16 (App Router) + React + TypeScript + TailwindCSS + Drizzle ORM (Postgres via Neon) + Vitest/RTL/jsdom + Sonner toasts.

**Codebase notes:**
- App lives in `cis-deal-room/`. All paths in this plan are repo-relative (e.g. `cis-deal-room/src/...`).
- This is Next.js **16** — before writing route handlers, consult `cis-deal-room/node_modules/next/dist/docs/01-app/` for current API. Notable: `params` is a `Promise` in route handlers.
- Existing checklist primitive is in PR #8 (commit de31741). It uses one shared checklist row per workspace, an items table with `folderId NOT NULL`, free-text `category`, and an `(itemId, fileId)` link table.
- Auth: routes use `verifySession()` from `@/lib/dal/index`. Admin guard via `session.isAdmin`. Workspace access via `requireDealAccess()`.
- Activity: `logActivity(txOrDb, params)` from `@/lib/dal/activity`. Append-only.
- Migrations: `npm run db:generate` (drizzle-kit) + apply via `npm run db:migrate` from `cis-deal-room/`. Pattern: hand-written for non-trivial DDL (see `0007_lowercase_user_emails.sql`), generated for table changes.
- Testing: vitest with mocked `@/db`. Existing pattern in `cis-deal-room/src/test/dal/checklist.test.ts` shows how to mock the chained query builder.
- Design system: dark-only, brand red `#E10600`, DM Sans + JetBrains Mono. Read `.impeccable.md` and `design-system/cis-deal-room/MASTER.md` before any new UI work.

---

## Phase 1: Schema foundation

Goal: schema reflects the canonical playbook overlay model. Migrations are reversible-by-edit (drop+recreate) but go forward only — no rollback scripts required.

### Task 1.1: Add `blocked` to checklist_status enum + new enums

**Files:**
- Create: `cis-deal-room/src/db/migrations/0008_playbook_enums.sql`
- Modify: `cis-deal-room/src/db/schema.ts:89-95` (add `blocked` to `checklistStatusEnum`)
- Modify: `cis-deal-room/src/db/schema.ts:74-95` (add new enums above checklist enums)

- [ ] **Step 1: Write the migration**

Create `cis-deal-room/src/db/migrations/0008_playbook_enums.sql`:

```sql
-- Add 'blocked' status to existing checklist_status enum.
ALTER TYPE "public"."checklist_status" ADD VALUE IF NOT EXISTS 'blocked' BEFORE 'received';
--> statement-breakpoint

-- Six canonical playbook categories (replaces free-text use over time).
CREATE TYPE "public"."playbook_category" AS ENUM(
  'corporate_legal',
  'financial',
  'commercial',
  'team_hr',
  'ip_technical',
  'operations_risk'
);
--> statement-breakpoint

-- Five deal-killer groups (NULL on non-killer playbook items).
CREATE TYPE "public"."deal_killer_group" AS ENUM(
  'cap_table',
  'eighty_three_b',
  'customer_coc',
  'ip_assignment',
  'revenue_bridge'
);
```

- [ ] **Step 2: Update Drizzle schema for the new enums**

In `cis-deal-room/src/db/schema.ts`, add `blocked` to `checklistStatusEnum`:

```ts
export const checklistStatusEnum = pgEnum('checklist_status', [
  'not_started',
  'in_progress',
  'blocked',
  'received',
  'waived',
  'n_a',
]);
```

Then add the two new enums immediately above `checklistPriorityEnum`:

```ts
export const playbookCategoryEnum = pgEnum('playbook_category', [
  'corporate_legal',
  'financial',
  'commercial',
  'team_hr',
  'ip_technical',
  'operations_risk',
]);

export const dealKillerGroupEnum = pgEnum('deal_killer_group', [
  'cap_table',
  'eighty_three_b',
  'customer_coc',
  'ip_assignment',
  'revenue_bridge',
]);
```

- [ ] **Step 3: Apply the migration**

Run from `cis-deal-room/`:

```bash
npm run db:migrate
```

Expected: migration `0008_playbook_enums.sql` applied without error.

- [ ] **Step 4: Verify the enum values**

Run from `cis-deal-room/`:

```bash
psql "$DATABASE_URL" -c "SELECT unnest(enum_range(NULL::checklist_status));"
```

Expected output includes `blocked` between `in_progress` and `received`.

- [ ] **Step 5: Commit**

```bash
cd cis-deal-room
git add src/db/migrations/0008_playbook_enums.sql src/db/schema.ts
git commit -m "feat(playbook): add blocked status + playbook_category and deal_killer_group enums"
```

---

### Task 1.2: Create `playbook_items` table + extend activity_action enum

**Files:**
- Create: `cis-deal-room/src/db/migrations/0009_playbook_items.sql`
- Modify: `cis-deal-room/src/db/schema.ts` (add `playbookItems` table; extend `activityActionEnum`)

- [ ] **Step 1: Write the migration**

Create `cis-deal-room/src/db/migrations/0009_playbook_items.sql`:

```sql
-- Two new activity actions:
--   * playbook_item_blocked      — when an item transitions to status='blocked'
--   * buyer_invite_with_outstanding — when a buyer-side participant is invited
--                                     while deal-killer items are outstanding
ALTER TYPE "public"."activity_action" ADD VALUE IF NOT EXISTS 'playbook_item_blocked';
--> statement-breakpoint
ALTER TYPE "public"."activity_action" ADD VALUE IF NOT EXISTS 'buyer_invite_with_outstanding';
--> statement-breakpoint

-- Canonical 48-item playbook. One row per playbook item, shared across all
-- workspaces. Per-deal state lives in checklist_items via playbook_item_id FK.
CREATE TABLE "public"."playbook_items" (
  "id"                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "number"            integer NOT NULL UNIQUE,
  "category"          "public"."playbook_category" NOT NULL,
  "name"              text NOT NULL,
  "rationale"         text NOT NULL,
  "deal_killer_group" "public"."deal_killer_group",
  "default_priority"  "public"."checklist_priority" NOT NULL DEFAULT 'medium',
  "sort_order"        integer NOT NULL,
  "created_at"        timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "playbook_items_category_sort_idx"
  ON "public"."playbook_items" ("category", "sort_order");
--> statement-breakpoint
CREATE INDEX "playbook_items_deal_killer_idx"
  ON "public"."playbook_items" ("deal_killer_group")
  WHERE "deal_killer_group" IS NOT NULL;
```

- [ ] **Step 2: Add the table to Drizzle schema**

In `cis-deal-room/src/db/schema.ts`, add after the `checklistItemFiles` table (around line 280):

```ts
export const playbookItems = pgTable('playbook_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  number: integer('number').notNull().unique(),
  category: playbookCategoryEnum('category').notNull(),
  name: text('name').notNull(),
  rationale: text('rationale').notNull(),
  dealKillerGroup: dealKillerGroupEnum('deal_killer_group'),
  defaultPriority: checklistPriorityEnum('default_priority').notNull().default('medium'),
  sortOrder: integer('sort_order').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
```

Also extend `activityActionEnum` to include the two new values:

```ts
export const activityActionEnum = pgEnum('activity_action', [
  // … existing values …
  'checklist_item_assigned',
  'playbook_item_blocked',
  'buyer_invite_with_outstanding',
]);
```

- [ ] **Step 3: Apply migration**

```bash
cd cis-deal-room && npm run db:migrate
```

Expected: success, no errors.

- [ ] **Step 4: Verify the table**

```bash
psql "$DATABASE_URL" -c "\\d playbook_items"
```

Expected: 9 columns, primary key on `id`, unique on `number`, two indexes.

- [ ] **Step 5: Commit**

```bash
cd cis-deal-room
git add src/db/migrations/0009_playbook_items.sql src/db/schema.ts
git commit -m "feat(playbook): create playbook_items table + extend activity_action enum"
```

---

### Task 1.3: Modify checklist_items — add playbook_item_id FK, relax folder_id

**Files:**
- Create: `cis-deal-room/src/db/migrations/0010_checklist_items_playbook_link.sql`
- Modify: `cis-deal-room/src/db/schema.ts:244-265` (`checklistItems` table)

- [ ] **Step 1: Write the migration**

Create `cis-deal-room/src/db/migrations/0010_checklist_items_playbook_link.sql`:

```sql
-- Canonical items reference playbook_items.id. Custom items keep this NULL.
ALTER TABLE "public"."checklist_items"
  ADD COLUMN "playbook_item_id" uuid REFERENCES "public"."playbook_items"("id") ON DELETE RESTRICT;
--> statement-breakpoint

-- Canonical items don't need a folder. Files attach via checklist_item_files.
ALTER TABLE "public"."checklist_items"
  ALTER COLUMN "folder_id" DROP NOT NULL;
--> statement-breakpoint

-- One canonical row per (checklist, playbook_item). Custom items are unconstrained.
CREATE UNIQUE INDEX "checklist_items_unique_playbook_idx"
  ON "public"."checklist_items" ("checklist_id", "playbook_item_id")
  WHERE "playbook_item_id" IS NOT NULL;
--> statement-breakpoint

CREATE INDEX "checklist_items_playbook_idx"
  ON "public"."checklist_items" ("playbook_item_id")
  WHERE "playbook_item_id" IS NOT NULL;
```

- [ ] **Step 2: Update Drizzle schema**

In `cis-deal-room/src/db/schema.ts`, replace the `checklistItems` table definition with:

```ts
export const checklistItems = pgTable('checklist_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  checklistId: uuid('checklist_id')
    .notNull()
    .references(() => checklists.id, { onDelete: 'cascade' }),
  playbookItemId: uuid('playbook_item_id').references(() => playbookItems.id, {
    onDelete: 'restrict',
  }),
  folderId: uuid('folder_id').references(() => folders.id, { onDelete: 'restrict' }),
  sortOrder: integer('sort_order').notNull().default(0),
  category: text('category').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  priority: checklistPriorityEnum('priority').notNull().default('medium'),
  owner: checklistOwnerEnum('owner').notNull().default('unassigned'),
  status: checklistStatusEnum('status').notNull().default('not_started'),
  notes: text('notes'),
  requestedAt: timestamp('requested_at').notNull().defaultNow(),
  receivedAt: timestamp('received_at'),
  receivedBy: uuid('received_by').references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
```

The `playbookItemId` field is added; `folderId` loses `.notNull()`. The `category` column stays as `text` for backward compat with existing rows (custom items pick from the 6 canonical values at the API layer).

- [ ] **Step 3: Apply migration**

```bash
cd cis-deal-room && npm run db:migrate
```

- [ ] **Step 4: Verify**

```bash
psql "$DATABASE_URL" -c "\\d checklist_items"
```

Expected: `playbook_item_id` column exists, `folder_id` is nullable, two new indexes present.

- [ ] **Step 5: Commit**

```bash
cd cis-deal-room
git add src/db/migrations/0010_checklist_items_playbook_link.sql src/db/schema.ts
git commit -m "feat(playbook): link checklist_items to playbook_items + relax folder_id"
```

---

### Task 1.4: Seed the 48 canonical playbook items

**Files:**
- Create: `cis-deal-room/src/db/migrations/0011_seed_playbook.sql`
- Create: `cis-deal-room/src/db/seed-playbook.ts` (a typed source of truth used to generate the SQL — kept in repo for future re-seeds)

- [ ] **Step 1: Write the typed seed source**

Create `cis-deal-room/src/db/seed-playbook.ts`:

```ts
/**
 * Source of truth for the canonical 48-item Data Room Construction Playbook.
 * Migration 0011 is a verbatim INSERT of the rows below. To revise the
 * playbook, edit this file, regenerate the SQL via `npm run playbook:gen-sql`,
 * and ship a new migration that UPSERTs the changed rows.
 */
import type { ChecklistPriority } from '@/types';

export type PlaybookCategory =
  | 'corporate_legal'
  | 'financial'
  | 'commercial'
  | 'team_hr'
  | 'ip_technical'
  | 'operations_risk';

export type DealKillerGroup =
  | 'cap_table'
  | 'eighty_three_b'
  | 'customer_coc'
  | 'ip_assignment'
  | 'revenue_bridge';

export interface PlaybookSeedItem {
  number: number;
  category: PlaybookCategory;
  name: string;
  rationale: string;
  dealKillerGroup: DealKillerGroup | null;
  defaultPriority: ChecklistPriority;
}

export const PLAYBOOK_SEED: PlaybookSeedItem[] = [
  // ─── 1. Corporate & Legal Foundations (11) ────────────────────────────────
  { number: 1, category: 'corporate_legal', name: 'Certificate of Incorporation (current, with all amendments)', rationale: 'Must reflect every share class and authorized share count to date. Mismatches with the cap table are the single most common diligence flag.', dealKillerGroup: null, defaultPriority: 'high' },
  { number: 2, category: 'corporate_legal', name: 'Bylaws and any amendments', rationale: "Reviewed for board structure, quorum requirements, and conflicts with the proposed term sheet's governance provisions.", dealKillerGroup: null, defaultPriority: 'medium' },
  { number: 3, category: 'corporate_legal', name: 'Board minutes and consents (every meeting and written consent)', rationale: 'Investors check that every option grant, share issuance, and major decision was properly authorized. Gaps here invalidate downstream actions.', dealKillerGroup: null, defaultPriority: 'high' },
  { number: 4, category: 'corporate_legal', name: 'Stockholder consents and voting agreements', rationale: 'Confirms drag-along, ROFR, and co-sale rights. A missing signature here can stall closing for weeks.', dealKillerGroup: null, defaultPriority: 'high' },
  { number: 5, category: 'corporate_legal', name: 'Cap table (fully diluted, reconciled with Carta or equivalent)', rationale: 'Must reconcile to the share, not the percent. Every SAFE, note, warrant, and option pool must appear and tie back to a board consent.', dealKillerGroup: 'cap_table', defaultPriority: 'critical' },
  { number: 6, category: 'corporate_legal', name: 'All SAFEs, convertible notes, and warrants (signed)', rationale: 'Investors will model conversion at the new round price. Missing or unsigned versions create phantom dilution risk.', dealKillerGroup: null, defaultPriority: 'high' },
  { number: 7, category: 'corporate_legal', name: 'Stock purchase agreements for all founder and early shares', rationale: 'Verifies that founder stock was actually issued, with vesting attached. Verbal promises do not survive diligence.', dealKillerGroup: null, defaultPriority: 'high' },
  { number: 8, category: 'corporate_legal', name: '83(b) election filings with proof of mailing', rationale: "If a founder filed late or never filed, the IRS treats vested stock as taxable income at the new round's valuation. This is the single most common item that delays closing.", dealKillerGroup: 'eighty_three_b', defaultPriority: 'critical' },
  { number: 9, category: 'corporate_legal', name: 'Equity incentive plan and all amendments', rationale: 'Confirms the option pool size matches what the cap table claims and that the plan is current with state and federal compliance.', dealKillerGroup: null, defaultPriority: 'medium' },
  { number: 10, category: 'corporate_legal', name: 'Option grant agreements for every employee and advisor', rationale: 'Each grant must reference a 409A valuation. Grants made without one create tax liability for the recipient and the company.', dealKillerGroup: null, defaultPriority: 'high' },
  { number: 11, category: 'corporate_legal', name: 'All 409A valuations with dates', rationale: 'A 409A older than 12 months or issued before a material event is invalid. Investors check the date against the option grant dates.', dealKillerGroup: null, defaultPriority: 'high' },

  // ─── 2. Financial Documentation (11) ──────────────────────────────────────
  { number: 12, category: 'financial', name: 'Audited or reviewed financial statements (last 2-3 years)', rationale: 'Series A and beyond expect at minimum a CPA-reviewed P&L, balance sheet, and cash flow. Unaudited founder spreadsheets are a yellow flag past Series A.', dealKillerGroup: null, defaultPriority: 'high' },
  { number: 13, category: 'financial', name: 'Monthly management accounts (last 24 months)', rationale: 'Must reconcile to annual statements within rounding. A discrepancy here suggests the founder does not control their own numbers.', dealKillerGroup: null, defaultPriority: 'high' },
  { number: 14, category: 'financial', name: 'Detailed revenue schedule by customer, by month', rationale: 'Investors test whether deck-stated ARR matches booked, contracted, and recognized revenue. Three numbers that should not differ but often do.', dealKillerGroup: 'revenue_bridge', defaultPriority: 'critical' },
  { number: 15, category: 'financial', name: 'Cohort analysis (gross and net revenue retention)', rationale: 'NRR below 100% at scale is a thesis-breaking metric for SaaS. Investors will rebuild this from raw data if you do not provide it.', dealKillerGroup: null, defaultPriority: 'high' },
  { number: 16, category: 'financial', name: 'Bookings vs. billings vs. revenue reconciliation', rationale: 'Founders who conflate these three numbers in the deck almost always get caught here. Pre-build the bridge document.', dealKillerGroup: 'revenue_bridge', defaultPriority: 'critical' },
  { number: 17, category: 'financial', name: 'Bank statements (last 24 months, all accounts)', rationale: 'Cross-checked against monthly accounts. Cash balance discrepancies are treated as evidence of poor controls.', dealKillerGroup: null, defaultPriority: 'medium' },
  { number: 18, category: 'financial', name: 'Tax returns (federal and state, last 3 years)', rationale: 'Investors confirm all filings are current and that revenue on returns matches GAAP statements within explainable bounds.', dealKillerGroup: null, defaultPriority: 'medium' },
  { number: 19, category: 'financial', name: 'Detailed financial model (assumptions visible and editable)', rationale: 'A locked model raises immediate suspicion. Show the formulas, the assumptions, and the sensitivity. Confidence is shown by transparency.', dealKillerGroup: null, defaultPriority: 'high' },
  { number: 20, category: 'financial', name: 'Burn rate and runway analysis', rationale: 'Investors model multiple downside scenarios. Provide them with a base, downside, and stress case so they do not invent their own.', dealKillerGroup: null, defaultPriority: 'high' },
  { number: 21, category: 'financial', name: 'Customer acquisition cost and payback period (by channel)', rationale: 'If CAC is ambiguous or only stated as a blended number, investors assume the worst channel is hiding the average.', dealKillerGroup: null, defaultPriority: 'medium' },
  { number: 22, category: 'financial', name: 'Accounts receivable aging report', rationale: 'Aging beyond 90 days suggests booked revenue may not collect. Investors discount the AR for valuation purposes.', dealKillerGroup: null, defaultPriority: 'medium' },

  // ─── 3. Commercial & Customer (9) ─────────────────────────────────────────
  { number: 23, category: 'commercial', name: 'Top 20 customer contracts (signed PDFs)', rationale: 'Investors read termination clauses, change-of-control provisions, and exclusivity terms. Each clause is a risk vector.', dealKillerGroup: 'customer_coc', defaultPriority: 'critical' },
  { number: 24, category: 'commercial', name: 'Customer concentration analysis (revenue % by top 10)', rationale: 'Above 20% from a single customer triggers concentration risk. Above 30% can be a thesis blocker entirely.', dealKillerGroup: null, defaultPriority: 'high' },
  { number: 25, category: 'commercial', name: 'Pipeline by stage with weighted probabilities', rationale: 'Investors call your pipeline customers. Inflated stages get caught immediately and destroy trust in the rest of the data room.', dealKillerGroup: null, defaultPriority: 'high' },
  { number: 26, category: 'commercial', name: 'Master service agreements and order forms (separated)', rationale: 'Term and pricing live in different documents. Investors need both to model true contract value.', dealKillerGroup: null, defaultPriority: 'medium' },
  { number: 27, category: 'commercial', name: 'Customer references list (with permission to contact)', rationale: 'Pre-warned references are a positive signal. Surprise references almost always include one bad call.', dealKillerGroup: null, defaultPriority: 'medium' },
  { number: 28, category: 'commercial', name: 'Churn analysis with reason codes', rationale: 'Churn without reason codes signals you are not learning from departures. Investors view this as an unscalable business.', dealKillerGroup: null, defaultPriority: 'medium' },
  { number: 29, category: 'commercial', name: 'Pricing history and discount log', rationale: 'If your blended ACV has dropped, investors want to see whether it is mix shift or pricing erosion. Two very different stories.', dealKillerGroup: null, defaultPriority: 'medium' },
  { number: 30, category: 'commercial', name: 'Sales compensation plans and quota attainment', rationale: "If reps are missing quota at a 10% growth assumption, the model's 60% growth case is fiction.", dealKillerGroup: null, defaultPriority: 'medium' },
  { number: 31, category: 'commercial', name: 'Marketing spend and attribution by channel', rationale: 'Investors will rebuild your CAC by channel. Hand them the data so they do not invent worse numbers.', dealKillerGroup: null, defaultPriority: 'medium' },

  // ─── 4. Team & HR (7) ─────────────────────────────────────────────────────
  { number: 32, category: 'team_hr', name: 'Org chart with reporting lines and tenure', rationale: 'Investors flag any single point of failure (one engineer who built everything, one salesperson who closes everything).', dealKillerGroup: null, defaultPriority: 'medium' },
  { number: 33, category: 'team_hr', name: 'Employee offer letters and confidentiality agreements (all)', rationale: 'Missing IP assignment language means the company may not actually own its own product. This kills deals at Series A.', dealKillerGroup: 'ip_assignment', defaultPriority: 'critical' },
  { number: 34, category: 'team_hr', name: 'Contractor agreements with IP assignment language', rationale: 'Every contractor who touched the codebase must have signed an assignment. Otherwise their work is not yours.', dealKillerGroup: 'ip_assignment', defaultPriority: 'critical' },
  { number: 35, category: 'team_hr', name: 'Employee handbook and policies', rationale: 'At Series A and beyond, investors expect formal policies for harassment, expense, and remote work. Their absence signals immaturity.', dealKillerGroup: null, defaultPriority: 'low' },
  { number: 36, category: 'team_hr', name: 'Compensation benchmarks and equity grants by role', rationale: 'Massively over- or under-paying employees is a flag. Investors check Pave or Option Impact comparables.', dealKillerGroup: null, defaultPriority: 'medium' },
  { number: 37, category: 'team_hr', name: 'Founder employment agreements with vesting schedules', rationale: 'Founders without vesting are an unacceptable risk. Investors will require a re-vest as a closing condition if missing.', dealKillerGroup: null, defaultPriority: 'high' },
  { number: 38, category: 'team_hr', name: 'Termination and severance documentation for any departures', rationale: 'An unresolved separation can become a lawsuit. Get releases signed before fundraising, not during it.', dealKillerGroup: null, defaultPriority: 'medium' },

  // ─── 5. Intellectual Property & Technical (8) ─────────────────────────────
  { number: 39, category: 'ip_technical', name: 'Trademark, patent, and copyright registrations', rationale: 'Provides evidence the company actually owns its brand and core IP. Pending applications still count, abandoned applications are a flag.', dealKillerGroup: null, defaultPriority: 'medium' },
  { number: 40, category: 'ip_technical', name: 'Open source software audit and license inventory', rationale: 'GPL or AGPL components in proprietary code can force-disclose your source. Discovered late, this can rewrite your business model.', dealKillerGroup: null, defaultPriority: 'high' },
  { number: 41, category: 'ip_technical', name: 'Architecture diagrams and technical documentation', rationale: 'Investors do a technical diligence call. Visible documentation signals a real engineering culture, not founder-dependent code.', dealKillerGroup: null, defaultPriority: 'medium' },
  { number: 42, category: 'ip_technical', name: 'Security policies, SOC 2 status, and any past audit reports', rationale: 'Enterprise customers and Series B+ investors will not move forward without at least SOC 2 Type 1 in progress.', dealKillerGroup: null, defaultPriority: 'high' },
  { number: 43, category: 'ip_technical', name: 'Data processing agreements and privacy policy', rationale: 'GDPR, CCPA, and HIPAA exposure must be documented. Verbal claims of compliance get tested against the actual data flow.', dealKillerGroup: null, defaultPriority: 'medium' },
  { number: 44, category: 'ip_technical', name: 'Third-party software and infrastructure vendor list', rationale: 'Investors check for single-vendor dependencies (one cloud, one data provider). Also confirms costs match the financial model.', dealKillerGroup: null, defaultPriority: 'medium' },
  { number: 45, category: 'ip_technical', name: 'Source code escrow agreements (if applicable)', rationale: 'Enterprise customers often require this. Investors check whether the obligation is current and whether the deposits are up to date.', dealKillerGroup: null, defaultPriority: 'low' },
  { number: 46, category: 'ip_technical', name: 'Any past or pending IP litigation', rationale: 'Even nuisance patent claims must be disclosed. Investors discover them through search anyway, so disclose first.', dealKillerGroup: null, defaultPriority: 'medium' },

  // ─── 6. Operations & Risk (2) ─────────────────────────────────────────────
  { number: 47, category: 'operations_risk', name: 'Insurance policies (D&O, E&O, cyber, general liability)', rationale: 'Investors require D&O insurance as a closing condition. Without it, the new directors will not take their seats.', dealKillerGroup: null, defaultPriority: 'high' },
  { number: 48, category: 'operations_risk', name: 'Real estate leases and equipment leases', rationale: 'Long-term leases are debt-equivalent. Investors model them into burn and check for unfavorable change-of-control clauses.', dealKillerGroup: null, defaultPriority: 'medium' },
];
```

- [ ] **Step 2: Write the seed migration**

Create `cis-deal-room/src/db/migrations/0011_seed_playbook.sql`. The INSERT below mirrors `seed-playbook.ts` verbatim. Use single quotes; escape internal single quotes by doubling. Sort order within a category equals item number (so a single ORDER BY sort_order works, scoped by category).

```sql
-- Seed the 48 canonical Data Room Construction Playbook items.
-- Idempotent: skips on conflict against the unique constraint on `number`.
INSERT INTO "public"."playbook_items"
  ("number", "category", "name", "rationale", "deal_killer_group", "default_priority", "sort_order")
VALUES
  (1, 'corporate_legal', 'Certificate of Incorporation (current, with all amendments)', 'Must reflect every share class and authorized share count to date. Mismatches with the cap table are the single most common diligence flag.', NULL, 'high', 1),
  (2, 'corporate_legal', 'Bylaws and any amendments', 'Reviewed for board structure, quorum requirements, and conflicts with the proposed term sheet''s governance provisions.', NULL, 'medium', 2),
  (3, 'corporate_legal', 'Board minutes and consents (every meeting and written consent)', 'Investors check that every option grant, share issuance, and major decision was properly authorized. Gaps here invalidate downstream actions.', NULL, 'high', 3),
  (4, 'corporate_legal', 'Stockholder consents and voting agreements', 'Confirms drag-along, ROFR, and co-sale rights. A missing signature here can stall closing for weeks.', NULL, 'high', 4),
  (5, 'corporate_legal', 'Cap table (fully diluted, reconciled with Carta or equivalent)', 'Must reconcile to the share, not the percent. Every SAFE, note, warrant, and option pool must appear and tie back to a board consent.', 'cap_table', 'critical', 5),
  (6, 'corporate_legal', 'All SAFEs, convertible notes, and warrants (signed)', 'Investors will model conversion at the new round price. Missing or unsigned versions create phantom dilution risk.', NULL, 'high', 6),
  (7, 'corporate_legal', 'Stock purchase agreements for all founder and early shares', 'Verifies that founder stock was actually issued, with vesting attached. Verbal promises do not survive diligence.', NULL, 'high', 7),
  (8, 'corporate_legal', '83(b) election filings with proof of mailing', 'If a founder filed late or never filed, the IRS treats vested stock as taxable income at the new round''s valuation. This is the single most common item that delays closing.', 'eighty_three_b', 'critical', 8),
  (9, 'corporate_legal', 'Equity incentive plan and all amendments', 'Confirms the option pool size matches what the cap table claims and that the plan is current with state and federal compliance.', NULL, 'medium', 9),
  (10, 'corporate_legal', 'Option grant agreements for every employee and advisor', 'Each grant must reference a 409A valuation. Grants made without one create tax liability for the recipient and the company.', NULL, 'high', 10),
  (11, 'corporate_legal', 'All 409A valuations with dates', 'A 409A older than 12 months or issued before a material event is invalid. Investors check the date against the option grant dates.', NULL, 'high', 11),
  (12, 'financial', 'Audited or reviewed financial statements (last 2-3 years)', 'Series A and beyond expect at minimum a CPA-reviewed P&L, balance sheet, and cash flow. Unaudited founder spreadsheets are a yellow flag past Series A.', NULL, 'high', 12),
  (13, 'financial', 'Monthly management accounts (last 24 months)', 'Must reconcile to annual statements within rounding. A discrepancy here suggests the founder does not control their own numbers.', NULL, 'high', 13),
  (14, 'financial', 'Detailed revenue schedule by customer, by month', 'Investors test whether deck-stated ARR matches booked, contracted, and recognized revenue. Three numbers that should not differ but often do.', 'revenue_bridge', 'critical', 14),
  (15, 'financial', 'Cohort analysis (gross and net revenue retention)', 'NRR below 100% at scale is a thesis-breaking metric for SaaS. Investors will rebuild this from raw data if you do not provide it.', NULL, 'high', 15),
  (16, 'financial', 'Bookings vs. billings vs. revenue reconciliation', 'Founders who conflate these three numbers in the deck almost always get caught here. Pre-build the bridge document.', 'revenue_bridge', 'critical', 16),
  (17, 'financial', 'Bank statements (last 24 months, all accounts)', 'Cross-checked against monthly accounts. Cash balance discrepancies are treated as evidence of poor controls.', NULL, 'medium', 17),
  (18, 'financial', 'Tax returns (federal and state, last 3 years)', 'Investors confirm all filings are current and that revenue on returns matches GAAP statements within explainable bounds.', NULL, 'medium', 18),
  (19, 'financial', 'Detailed financial model (assumptions visible and editable)', 'A locked model raises immediate suspicion. Show the formulas, the assumptions, and the sensitivity. Confidence is shown by transparency.', NULL, 'high', 19),
  (20, 'financial', 'Burn rate and runway analysis', 'Investors model multiple downside scenarios. Provide them with a base, downside, and stress case so they do not invent their own.', NULL, 'high', 20),
  (21, 'financial', 'Customer acquisition cost and payback period (by channel)', 'If CAC is ambiguous or only stated as a blended number, investors assume the worst channel is hiding the average.', NULL, 'medium', 21),
  (22, 'financial', 'Accounts receivable aging report', 'Aging beyond 90 days suggests booked revenue may not collect. Investors discount the AR for valuation purposes.', NULL, 'medium', 22),
  (23, 'commercial', 'Top 20 customer contracts (signed PDFs)', 'Investors read termination clauses, change-of-control provisions, and exclusivity terms. Each clause is a risk vector.', 'customer_coc', 'critical', 23),
  (24, 'commercial', 'Customer concentration analysis (revenue % by top 10)', 'Above 20% from a single customer triggers concentration risk. Above 30% can be a thesis blocker entirely.', NULL, 'high', 24),
  (25, 'commercial', 'Pipeline by stage with weighted probabilities', 'Investors call your pipeline customers. Inflated stages get caught immediately and destroy trust in the rest of the data room.', NULL, 'high', 25),
  (26, 'commercial', 'Master service agreements and order forms (separated)', 'Term and pricing live in different documents. Investors need both to model true contract value.', NULL, 'medium', 26),
  (27, 'commercial', 'Customer references list (with permission to contact)', 'Pre-warned references are a positive signal. Surprise references almost always include one bad call.', NULL, 'medium', 27),
  (28, 'commercial', 'Churn analysis with reason codes', 'Churn without reason codes signals you are not learning from departures. Investors view this as an unscalable business.', NULL, 'medium', 28),
  (29, 'commercial', 'Pricing history and discount log', 'If your blended ACV has dropped, investors want to see whether it is mix shift or pricing erosion. Two very different stories.', NULL, 'medium', 29),
  (30, 'commercial', 'Sales compensation plans and quota attainment', 'If reps are missing quota at a 10% growth assumption, the model''s 60% growth case is fiction.', NULL, 'medium', 30),
  (31, 'commercial', 'Marketing spend and attribution by channel', 'Investors will rebuild your CAC by channel. Hand them the data so they do not invent worse numbers.', NULL, 'medium', 31),
  (32, 'team_hr', 'Org chart with reporting lines and tenure', 'Investors flag any single point of failure (one engineer who built everything, one salesperson who closes everything).', NULL, 'medium', 32),
  (33, 'team_hr', 'Employee offer letters and confidentiality agreements (all)', 'Missing IP assignment language means the company may not actually own its own product. This kills deals at Series A.', 'ip_assignment', 'critical', 33),
  (34, 'team_hr', 'Contractor agreements with IP assignment language', 'Every contractor who touched the codebase must have signed an assignment. Otherwise their work is not yours.', 'ip_assignment', 'critical', 34),
  (35, 'team_hr', 'Employee handbook and policies', 'At Series A and beyond, investors expect formal policies for harassment, expense, and remote work. Their absence signals immaturity.', NULL, 'low', 35),
  (36, 'team_hr', 'Compensation benchmarks and equity grants by role', 'Massively over- or under-paying employees is a flag. Investors check Pave or Option Impact comparables.', NULL, 'medium', 36),
  (37, 'team_hr', 'Founder employment agreements with vesting schedules', 'Founders without vesting are an unacceptable risk. Investors will require a re-vest as a closing condition if missing.', NULL, 'high', 37),
  (38, 'team_hr', 'Termination and severance documentation for any departures', 'An unresolved separation can become a lawsuit. Get releases signed before fundraising, not during it.', NULL, 'medium', 38),
  (39, 'ip_technical', 'Trademark, patent, and copyright registrations', 'Provides evidence the company actually owns its brand and core IP. Pending applications still count, abandoned applications are a flag.', NULL, 'medium', 39),
  (40, 'ip_technical', 'Open source software audit and license inventory', 'GPL or AGPL components in proprietary code can force-disclose your source. Discovered late, this can rewrite your business model.', NULL, 'high', 40),
  (41, 'ip_technical', 'Architecture diagrams and technical documentation', 'Investors do a technical diligence call. Visible documentation signals a real engineering culture, not founder-dependent code.', NULL, 'medium', 41),
  (42, 'ip_technical', 'Security policies, SOC 2 status, and any past audit reports', 'Enterprise customers and Series B+ investors will not move forward without at least SOC 2 Type 1 in progress.', NULL, 'high', 42),
  (43, 'ip_technical', 'Data processing agreements and privacy policy', 'GDPR, CCPA, and HIPAA exposure must be documented. Verbal claims of compliance get tested against the actual data flow.', NULL, 'medium', 43),
  (44, 'ip_technical', 'Third-party software and infrastructure vendor list', 'Investors check for single-vendor dependencies (one cloud, one data provider). Also confirms costs match the financial model.', NULL, 'medium', 44),
  (45, 'ip_technical', 'Source code escrow agreements (if applicable)', 'Enterprise customers often require this. Investors check whether the obligation is current and whether the deposits are up to date.', NULL, 'low', 45),
  (46, 'ip_technical', 'Any past or pending IP litigation', 'Even nuisance patent claims must be disclosed. Investors discover them through search anyway, so disclose first.', NULL, 'medium', 46),
  (47, 'operations_risk', 'Insurance policies (D&O, E&O, cyber, general liability)', 'Investors require D&O insurance as a closing condition. Without it, the new directors will not take their seats.', NULL, 'high', 47),
  (48, 'operations_risk', 'Real estate leases and equipment leases', 'Long-term leases are debt-equivalent. Investors model them into burn and check for unfavorable change-of-control clauses.', NULL, 'medium', 48)
ON CONFLICT ("number") DO NOTHING;
```

- [ ] **Step 3: Apply migration**

```bash
cd cis-deal-room && npm run db:migrate
```

- [ ] **Step 4: Verify the seed**

```bash
psql "$DATABASE_URL" -c "SELECT count(*) FROM playbook_items;"
psql "$DATABASE_URL" -c "SELECT count(*) FROM playbook_items WHERE deal_killer_group IS NOT NULL;"
```

Expected: 48 rows total, 7 deal-killer rows (items 5, 8, 14, 16, 23, 33, 34).

- [ ] **Step 5: Commit**

```bash
cd cis-deal-room
git add src/db/migrations/0011_seed_playbook.sql src/db/seed-playbook.ts
git commit -m "feat(playbook): seed 48 canonical playbook items"
```

---

## Phase 2: DAL — virtual merge + readiness queries

Goal: a workspace's checklist view becomes a merged read of `playbook_items LEFT JOIN checklist_items`. Mutations upsert checklist_items rows on demand.

### Task 2.1: Virtual-merge query — `getPlaybookView`

**Files:**
- Create: `cis-deal-room/src/lib/dal/playbook.ts`
- Create: `cis-deal-room/src/test/dal/playbook.test.ts`

- [ ] **Step 1: Write the failing test for the virtual merge shape**

Create `cis-deal-room/src/test/dal/playbook.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';

const dbResults: Record<string, unknown[]> = {
  playbook_join: [],
  custom: [],
};

vi.mock('@/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        leftJoin: () => ({
          where: () => ({
            orderBy: async () => dbResults.playbook_join,
          }),
        }),
        where: () => ({
          orderBy: async () => dbResults.custom,
        }),
      }),
    }),
  },
}));

vi.mock('@/lib/dal/index', () => ({
  verifySession: async () => ({ userId: 'u1', userEmail: 'x@x', isAdmin: true }),
}));

import { getPlaybookView } from '@/lib/dal/playbook';

const CHECKLIST_ID = '550e8400-e29b-41d4-a716-446655440000';

describe('getPlaybookView', () => {
  it('returns 48 canonical rows with default state when no checklist_items exist', async () => {
    dbResults.playbook_join = Array.from({ length: 48 }, (_, i) => ({
      playbookItemId: `pb-${i + 1}`,
      number: i + 1,
      category: 'corporate_legal',
      name: `Item ${i + 1}`,
      rationale: 'Why',
      dealKillerGroup: null,
      defaultPriority: 'medium',
      sortOrder: i + 1,
      itemId: null,
      status: null,
      owner: null,
      priority: null,
      notes: null,
      receivedAt: null,
      folderId: null,
    }));
    dbResults.custom = [];

    const view = await getPlaybookView(CHECKLIST_ID);

    expect(view.canonical).toHaveLength(48);
    expect(view.canonical[0].status).toBe('not_started');
    expect(view.canonical[0].owner).toBe('unassigned');
    expect(view.custom).toEqual([]);
  });

  it('overlays checklist_items state onto canonical rows when present', async () => {
    dbResults.playbook_join = [
      {
        playbookItemId: 'pb-5',
        number: 5,
        category: 'corporate_legal',
        name: 'Cap table',
        rationale: 'Why',
        dealKillerGroup: 'cap_table',
        defaultPriority: 'critical',
        sortOrder: 5,
        itemId: 'ci-1',
        status: 'received',
        owner: 'seller',
        priority: 'critical',
        notes: 'looks good',
        receivedAt: new Date('2026-05-01'),
        folderId: null,
      },
    ];
    dbResults.custom = [];

    const view = await getPlaybookView(CHECKLIST_ID);

    expect(view.canonical).toHaveLength(1);
    expect(view.canonical[0].status).toBe('received');
    expect(view.canonical[0].notes).toBe('looks good');
  });

  it('returns custom items separately', async () => {
    dbResults.playbook_join = [];
    dbResults.custom = [
      {
        itemId: 'ci-99',
        category: 'commercial',
        name: 'Custom thing',
        status: 'in_progress',
        owner: 'seller',
        priority: 'medium',
        notes: null,
        folderId: 'f-1',
        sortOrder: 100,
      },
    ];

    const view = await getPlaybookView(CHECKLIST_ID);
    expect(view.canonical).toEqual([]);
    expect(view.custom).toHaveLength(1);
    expect(view.custom[0].name).toBe('Custom thing');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd cis-deal-room && npx vitest run src/test/dal/playbook.test.ts
```

Expected: FAIL with `Cannot find module '@/lib/dal/playbook'` or similar.

- [ ] **Step 3: Implement `getPlaybookView`**

Create `cis-deal-room/src/lib/dal/playbook.ts`:

```ts
import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { playbookItems, checklistItems } from '@/db/schema';
import type {
  ChecklistOwner,
  ChecklistPriority,
  ChecklistStatus,
} from '@/types';

export type PlaybookCategory =
  | 'corporate_legal'
  | 'financial'
  | 'commercial'
  | 'team_hr'
  | 'ip_technical'
  | 'operations_risk';

export type DealKillerGroup =
  | 'cap_table'
  | 'eighty_three_b'
  | 'customer_coc'
  | 'ip_assignment'
  | 'revenue_bridge';

export interface PlaybookCanonicalRow {
  playbookItemId: string;
  number: number;
  category: PlaybookCategory;
  name: string;
  rationale: string;
  dealKillerGroup: DealKillerGroup | null;
  defaultPriority: ChecklistPriority;
  sortOrder: number;

  // Effective per-deal state (defaults when no checklist_items row exists)
  itemId: string | null;
  status: ChecklistStatus;
  owner: ChecklistOwner;
  priority: ChecklistPriority;
  notes: string | null;
  receivedAt: Date | null;
  folderId: string | null;
}

export interface PlaybookCustomRow {
  itemId: string;
  category: PlaybookCategory;
  name: string;
  status: ChecklistStatus;
  owner: ChecklistOwner;
  priority: ChecklistPriority;
  notes: string | null;
  folderId: string | null;
  sortOrder: number;
}

export interface PlaybookView {
  canonical: PlaybookCanonicalRow[];
  custom: PlaybookCustomRow[];
}

/**
 * Returns the merged playbook view for a checklist:
 *   - 48 canonical rows (playbook_items LEFT JOIN checklist_items), defaulting
 *     to not_started/unassigned/default_priority when no checklist_items row
 *     exists for that (checklist, playbook_item) pair.
 *   - All custom rows (checklist_items where playbook_item_id IS NULL).
 *
 * Caller must have verified workspace access. This function does NOT enforce
 * authorization — wrap it in a route handler that does.
 */
export async function getPlaybookView(checklistId: string): Promise<PlaybookView> {
  const canonicalRows = await db
    .select({
      playbookItemId: playbookItems.id,
      number: playbookItems.number,
      category: playbookItems.category,
      name: playbookItems.name,
      rationale: playbookItems.rationale,
      dealKillerGroup: playbookItems.dealKillerGroup,
      defaultPriority: playbookItems.defaultPriority,
      sortOrder: playbookItems.sortOrder,
      itemId: checklistItems.id,
      status: checklistItems.status,
      owner: checklistItems.owner,
      priority: checklistItems.priority,
      notes: checklistItems.notes,
      receivedAt: checklistItems.receivedAt,
      folderId: checklistItems.folderId,
    })
    .from(playbookItems)
    .leftJoin(
      checklistItems,
      and(
        eq(checklistItems.playbookItemId, playbookItems.id),
        eq(checklistItems.checklistId, checklistId),
      ),
    )
    .where(isNotNull(playbookItems.id))
    .orderBy(playbookItems.category, playbookItems.sortOrder);

  const canonical: PlaybookCanonicalRow[] = canonicalRows.map((r) => ({
    playbookItemId: r.playbookItemId,
    number: r.number,
    category: r.category as PlaybookCategory,
    name: r.name,
    rationale: r.rationale,
    dealKillerGroup: (r.dealKillerGroup ?? null) as DealKillerGroup | null,
    defaultPriority: r.defaultPriority as ChecklistPriority,
    sortOrder: r.sortOrder,
    itemId: r.itemId,
    status: (r.status ?? 'not_started') as ChecklistStatus,
    owner: (r.owner ?? 'unassigned') as ChecklistOwner,
    priority: (r.priority ?? r.defaultPriority) as ChecklistPriority,
    notes: r.notes,
    receivedAt: r.receivedAt,
    folderId: r.folderId,
  }));

  const customRows = await db
    .select({
      itemId: checklistItems.id,
      category: checklistItems.category,
      name: checklistItems.name,
      status: checklistItems.status,
      owner: checklistItems.owner,
      priority: checklistItems.priority,
      notes: checklistItems.notes,
      folderId: checklistItems.folderId,
      sortOrder: checklistItems.sortOrder,
    })
    .from(checklistItems)
    .where(
      and(
        eq(checklistItems.checklistId, checklistId),
        isNull(checklistItems.playbookItemId),
      ),
    )
    .orderBy(checklistItems.category, checklistItems.sortOrder);

  const custom: PlaybookCustomRow[] = customRows.map((r) => ({
    itemId: r.itemId,
    category: r.category as PlaybookCategory,
    name: r.name,
    status: r.status as ChecklistStatus,
    owner: r.owner as ChecklistOwner,
    priority: r.priority as ChecklistPriority,
    notes: r.notes,
    folderId: r.folderId,
    sortOrder: r.sortOrder,
  }));

  return { canonical, custom };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd cis-deal-room && npx vitest run src/test/dal/playbook.test.ts
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
cd cis-deal-room
git add src/lib/dal/playbook.ts src/test/dal/playbook.test.ts
git commit -m "feat(playbook): virtual-merge DAL query getPlaybookView"
```

---

### Task 2.2: Readiness summary query — `getReadinessSummary`

**Files:**
- Modify: `cis-deal-room/src/lib/dal/playbook.ts` (add new function)
- Modify: `cis-deal-room/src/test/dal/playbook.test.ts` (add tests)

- [ ] **Step 1: Write the failing test**

Append to `cis-deal-room/src/test/dal/playbook.test.ts` inside a new `describe`:

```ts
describe('getReadinessSummary', () => {
  it('counts ready items as received/waived/n_a; returns 0/48 with no rows', async () => {
    dbResults.playbook_join = Array.from({ length: 48 }, (_, i) => ({
      playbookItemId: `pb-${i + 1}`,
      number: i + 1,
      category: i < 11 ? 'corporate_legal' : 'financial',
      name: `Item ${i + 1}`,
      rationale: 'r',
      dealKillerGroup: null,
      defaultPriority: 'medium',
      sortOrder: i + 1,
      itemId: null,
      status: null,
      owner: null,
      priority: null,
      notes: null,
      receivedAt: null,
      folderId: null,
    }));
    dbResults.custom = [];

    const { getReadinessSummary } = await import('@/lib/dal/playbook');
    const summary = await getReadinessSummary(CHECKLIST_ID);

    expect(summary.total).toBe(48);
    expect(summary.ready).toBe(0);
    expect(summary.byCategory.corporate_legal.total).toBe(11);
    expect(summary.byCategory.corporate_legal.ready).toBe(0);
  });

  it('counts received/waived/n_a as ready; blocked and not_started not ready', async () => {
    const base = (status: string | null, dealKiller: string | null = null) => ({
      playbookItemId: `pb-x`,
      number: 1,
      category: 'corporate_legal',
      name: 'X',
      rationale: 'r',
      dealKillerGroup: dealKiller,
      defaultPriority: 'medium',
      sortOrder: 1,
      itemId: 'ci',
      status,
      owner: 'seller',
      priority: 'medium',
      notes: null,
      receivedAt: null,
      folderId: null,
    });
    dbResults.playbook_join = [
      base('received'),
      base('waived'),
      base('n_a'),
      base('blocked'),
      base('in_progress'),
      base('not_started'),
      base(null), // virtual = not_started
    ];
    dbResults.custom = [];

    const { getReadinessSummary } = await import('@/lib/dal/playbook');
    const summary = await getReadinessSummary(CHECKLIST_ID);

    expect(summary.total).toBe(7);
    expect(summary.ready).toBe(3);
  });

  it('groups deal-killers by deal_killer_group with worst-of status', async () => {
    dbResults.playbook_join = [
      {
        playbookItemId: 'pb-33', number: 33, category: 'team_hr',
        name: 'Offers', rationale: 'r', dealKillerGroup: 'ip_assignment',
        defaultPriority: 'critical', sortOrder: 33,
        itemId: 'ci-a', status: 'received', owner: 'seller',
        priority: 'critical', notes: null, receivedAt: null, folderId: null,
      },
      {
        playbookItemId: 'pb-34', number: 34, category: 'team_hr',
        name: 'Contractors', rationale: 'r', dealKillerGroup: 'ip_assignment',
        defaultPriority: 'critical', sortOrder: 34,
        itemId: null, status: null, owner: null,
        priority: null, notes: null, receivedAt: null, folderId: null,
      },
    ];
    dbResults.custom = [];

    const { getReadinessSummary } = await import('@/lib/dal/playbook');
    const summary = await getReadinessSummary(CHECKLIST_ID);

    const ip = summary.dealKillerGroups.find((g) => g.group === 'ip_assignment');
    expect(ip).toBeDefined();
    // worst-of: received + not_started → not_started
    expect(ip!.status).toBe('not_started');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd cis-deal-room && npx vitest run src/test/dal/playbook.test.ts
```

Expected: 3 new tests fail with `getReadinessSummary is not a function` or similar.

- [ ] **Step 3: Implement `getReadinessSummary`**

Append to `cis-deal-room/src/lib/dal/playbook.ts`:

```ts
export type DealKillerGroupStatus = 'green' | 'yellow' | 'red' | 'gray';

export interface ReadinessSummary {
  total: number;
  ready: number;
  byCategory: Record<PlaybookCategory, { total: number; ready: number }>;
  dealKillerGroups: Array<{
    group: DealKillerGroup;
    status: ChecklistStatus;
    color: DealKillerGroupStatus;
    members: Array<{ playbookItemId: string; number: number; status: ChecklistStatus }>;
  }>;
}

const READY_STATUSES: ReadonlySet<ChecklistStatus> = new Set([
  'received',
  'waived',
  'n_a',
]);

/** Worst-of ordering for deal-killer group status. Higher = worse. */
const STATUS_RANK: Record<ChecklistStatus, number> = {
  blocked: 4,
  not_started: 3,
  in_progress: 2,
  received: 1,
  waived: 1,
  n_a: 1,
};

function statusToColor(status: ChecklistStatus): DealKillerGroupStatus {
  if (status === 'blocked') return 'red';
  if (status === 'not_started') return 'gray';
  if (status === 'in_progress') return 'yellow';
  return 'green';
}

const EMPTY_BY_CATEGORY: ReadinessSummary['byCategory'] = {
  corporate_legal: { total: 0, ready: 0 },
  financial: { total: 0, ready: 0 },
  commercial: { total: 0, ready: 0 },
  team_hr: { total: 0, ready: 0 },
  ip_technical: { total: 0, ready: 0 },
  operations_risk: { total: 0, ready: 0 },
};

export async function getReadinessSummary(checklistId: string): Promise<ReadinessSummary> {
  const view = await getPlaybookView(checklistId);

  const byCategory: ReadinessSummary['byCategory'] = {
    corporate_legal: { total: 0, ready: 0 },
    financial: { total: 0, ready: 0 },
    commercial: { total: 0, ready: 0 },
    team_hr: { total: 0, ready: 0 },
    ip_technical: { total: 0, ready: 0 },
    operations_risk: { total: 0, ready: 0 },
  };

  let total = 0;
  let ready = 0;
  for (const row of view.canonical) {
    total += 1;
    byCategory[row.category].total += 1;
    if (READY_STATUSES.has(row.status)) {
      ready += 1;
      byCategory[row.category].ready += 1;
    }
  }

  // Group deal-killer items by group, take worst-of status
  const grouped = new Map<DealKillerGroup, PlaybookCanonicalRow[]>();
  for (const row of view.canonical) {
    if (row.dealKillerGroup) {
      const list = grouped.get(row.dealKillerGroup) ?? [];
      list.push(row);
      grouped.set(row.dealKillerGroup, list);
    }
  }

  const dealKillerGroups = Array.from(grouped.entries()).map(([group, members]) => {
    const worst = members.reduce<ChecklistStatus>(
      (acc, m) => (STATUS_RANK[m.status] > STATUS_RANK[acc] ? m.status : acc),
      'received' as ChecklistStatus,
    );
    return {
      group,
      status: worst,
      color: statusToColor(worst),
      members: members.map((m) => ({
        playbookItemId: m.playbookItemId,
        number: m.number,
        status: m.status,
      })),
    };
  });

  // Stable order: cap_table, eighty_three_b, customer_coc, ip_assignment, revenue_bridge
  const ORDER: DealKillerGroup[] = [
    'cap_table',
    'eighty_three_b',
    'customer_coc',
    'ip_assignment',
    'revenue_bridge',
  ];
  dealKillerGroups.sort((a, b) => ORDER.indexOf(a.group) - ORDER.indexOf(b.group));

  return { total, ready, byCategory, dealKillerGroups };
}

// Suppress unused import warning when tests run with a partial module.
void EMPTY_BY_CATEGORY;
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd cis-deal-room && npx vitest run src/test/dal/playbook.test.ts
```

Expected: all 6 tests pass.

- [ ] **Step 5: Commit**

```bash
cd cis-deal-room
git add src/lib/dal/playbook.ts src/test/dal/playbook.test.ts
git commit -m "feat(playbook): readiness summary query with deal-killer worst-of grouping"
```

---

### Task 2.3: Outstanding deal-killer groups query — `getOutstandingDealKillerGroups`

**Files:**
- Modify: `cis-deal-room/src/lib/dal/playbook.ts`
- Modify: `cis-deal-room/src/test/dal/playbook.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `cis-deal-room/src/test/dal/playbook.test.ts`:

```ts
describe('getOutstandingDealKillerGroups', () => {
  it('returns only groups with at least one non-ready member', async () => {
    dbResults.playbook_join = [
      // ip_assignment: one received, one not_started → outstanding
      {
        playbookItemId: 'pb-33', number: 33, category: 'team_hr',
        name: 'A', rationale: 'r', dealKillerGroup: 'ip_assignment',
        defaultPriority: 'critical', sortOrder: 33,
        itemId: 'ci', status: 'received', owner: 'seller',
        priority: 'critical', notes: null, receivedAt: null, folderId: null,
      },
      {
        playbookItemId: 'pb-34', number: 34, category: 'team_hr',
        name: 'B', rationale: 'r', dealKillerGroup: 'ip_assignment',
        defaultPriority: 'critical', sortOrder: 34,
        itemId: null, status: null, owner: null,
        priority: null, notes: null, receivedAt: null, folderId: null,
      },
      // revenue_bridge: both received → not outstanding
      {
        playbookItemId: 'pb-14', number: 14, category: 'financial',
        name: 'C', rationale: 'r', dealKillerGroup: 'revenue_bridge',
        defaultPriority: 'critical', sortOrder: 14,
        itemId: 'ci2', status: 'waived', owner: 'seller',
        priority: 'critical', notes: null, receivedAt: null, folderId: null,
      },
      {
        playbookItemId: 'pb-16', number: 16, category: 'financial',
        name: 'D', rationale: 'r', dealKillerGroup: 'revenue_bridge',
        defaultPriority: 'critical', sortOrder: 16,
        itemId: 'ci3', status: 'received', owner: 'seller',
        priority: 'critical', notes: null, receivedAt: null, folderId: null,
      },
    ];
    dbResults.custom = [];

    const { getOutstandingDealKillerGroups } = await import('@/lib/dal/playbook');
    const result = await getOutstandingDealKillerGroups(CHECKLIST_ID);

    expect(result).toHaveLength(1);
    expect(result[0].group).toBe('ip_assignment');
  });
});
```

- [ ] **Step 2: Run to confirm fail**

```bash
cd cis-deal-room && npx vitest run src/test/dal/playbook.test.ts
```

Expected: new test fails (function not found).

- [ ] **Step 3: Implement**

Append to `cis-deal-room/src/lib/dal/playbook.ts`:

```ts
/**
 * Returns the deal-killer groups that have at least one member NOT in
 * (received, waived, n_a). Used to gate buyer-side participant invites.
 */
export async function getOutstandingDealKillerGroups(
  checklistId: string,
): Promise<ReadinessSummary['dealKillerGroups']> {
  const summary = await getReadinessSummary(checklistId);
  return summary.dealKillerGroups.filter(
    (g) => !READY_STATUSES.has(g.status),
  );
}
```

- [ ] **Step 4: Run, verify pass**

```bash
cd cis-deal-room && npx vitest run src/test/dal/playbook.test.ts
```

Expected: all 7 tests pass.

- [ ] **Step 5: Commit**

```bash
cd cis-deal-room
git add src/lib/dal/playbook.ts src/test/dal/playbook.test.ts
git commit -m "feat(playbook): outstanding deal-killer groups query for buyer-invite gate"
```

---

### Task 2.4: Upsert canonical item state — `upsertCanonicalItem` + status helper

The existing `setItemStatus` and `linkFileToItem` operate on existing `checklist_items.id` rows. For canonical items where no row exists yet (status changes from virtual `not_started`), we need an upsert path. We add `upsertCanonicalItem` and a new entry point `setCanonicalItemStatus` that handles both cases.

**Files:**
- Modify: `cis-deal-room/src/lib/dal/checklist.ts`
- Modify: `cis-deal-room/src/test/dal/checklist.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `cis-deal-room/src/test/dal/checklist.test.ts` (study the existing mock pattern in the file first):

```ts
describe('setCanonicalItemStatus', () => {
  it('inserts a checklist_items row when none exists for the (checklist, playbook_item)', async () => {
    // Arrange: mock select to return playbook item but no existing checklist_items row
    // Mock insert to return a new id.
    // (Use the existing mockSelectChain pattern; sketch shown — adapt to actual mocks.)
    const insertedId = 'new-ci-id';
    const session = { userId: 'admin', isAdmin: true, userEmail: 'a@a' };
    vi.mocked(verifySession).mockResolvedValueOnce(session as any);
    // Two-phase mock: existing-row-lookup returns []; then upsert returns insertedId.
    mockSelectChain
      .mockResolvedValueOnce([{ id: 'pb-5', checklistId: 'cl-1', workspaceId: 'ws-1' }])
      .mockResolvedValueOnce([]); // no existing checklist_items row

    // Act
    const { setCanonicalItemStatus } = await import('@/lib/dal/checklist');
    await setCanonicalItemStatus({
      checklistId: 'cl-1',
      playbookItemId: 'pb-5',
      target: 'received',
    });

    // Assert: insert was called (delegated to drizzle mock — verify via spy). For now,
    // assert no throw + verifySession called with admin guard.
    expect(verifySession).toHaveBeenCalled();
  });

  it('rejects non-admin callers', async () => {
    vi.mocked(verifySession).mockResolvedValueOnce({
      userId: 'u1', isAdmin: false, userEmail: 'u@u',
    } as any);
    const { setCanonicalItemStatus } = await import('@/lib/dal/checklist');
    await expect(
      setCanonicalItemStatus({
        checklistId: 'cl-1',
        playbookItemId: 'pb-5',
        target: 'received',
      }),
    ).rejects.toThrow('Admin required');
  });
});
```

Note: this test sketch validates contract (auth + delegation). Behavioral tests of the upsert (DB-touching) are covered by an integration test in Phase 3.

- [ ] **Step 2: Run to confirm fail**

```bash
cd cis-deal-room && npx vitest run src/test/dal/checklist.test.ts
```

Expected: fails — `setCanonicalItemStatus is not a function`.

- [ ] **Step 3: Implement `setCanonicalItemStatus`**

Append to `cis-deal-room/src/lib/dal/checklist.ts`:

```ts
import { playbookItems } from '@/db/schema';

interface SetCanonicalStatusInput {
  checklistId: string;
  playbookItemId: string;
  target: ChecklistStatus | 'reset';
}

/**
 * Set status for a CANONICAL playbook item. Upserts a checklist_items row
 * keyed by (checklist_id, playbook_item_id) if one doesn't exist yet.
 * Admin-only. Logs activity. Returns the resulting item id.
 */
export async function setCanonicalItemStatus(input: SetCanonicalStatusInput): Promise<string> {
  const session = await verifySession();
  if (!session) throw new Error('Unauthorized');
  if (!session.isAdmin) throw new Error('Admin required');

  return db.transaction(async (tx) => {
    // Resolve the playbook item + workspace context
    const [pb] = await tx
      .select({
        id: playbookItems.id,
        category: playbookItems.category,
        name: playbookItems.name,
        defaultPriority: playbookItems.defaultPriority,
        number: playbookItems.number,
      })
      .from(playbookItems)
      .where(eq(playbookItems.id, input.playbookItemId))
      .limit(1);
    if (!pb) throw new Error('Playbook item not found');

    const [cl] = await tx
      .select({ id: checklists.id, workspaceId: checklists.workspaceId })
      .from(checklists)
      .where(eq(checklists.id, input.checklistId))
      .limit(1);
    if (!cl) throw new Error('Checklist not found');

    // Find existing row (if any)
    const [existing] = await tx
      .select({ id: checklistItems.id, status: checklistItems.status })
      .from(checklistItems)
      .where(
        and(
          eq(checklistItems.checklistId, input.checklistId),
          eq(checklistItems.playbookItemId, input.playbookItemId),
        ),
      )
      .limit(1);

    let nextStatus: ChecklistStatus;
    if (input.target === 'reset') {
      nextStatus = 'not_started';
    } else {
      nextStatus = input.target;
    }

    let itemId: string;
    if (existing) {
      const patch: Partial<typeof checklistItems.$inferInsert> = {
        status: nextStatus,
        updatedAt: new Date(),
      };
      if (nextStatus === 'received') {
        patch.receivedAt = new Date();
        patch.receivedBy = session.userId;
      } else {
        patch.receivedAt = null;
        patch.receivedBy = null;
      }
      await tx.update(checklistItems).set(patch).where(eq(checklistItems.id, existing.id));
      itemId = existing.id;
    } else {
      const [inserted] = await tx
        .insert(checklistItems)
        .values({
          checklistId: input.checklistId,
          playbookItemId: input.playbookItemId,
          folderId: null,
          category: pb.category,
          name: pb.name,
          priority: pb.defaultPriority,
          owner: 'unassigned',
          status: nextStatus,
          sortOrder: pb.number,
          ...(nextStatus === 'received'
            ? { receivedAt: new Date(), receivedBy: session.userId }
            : {}),
        })
        .returning({ id: checklistItems.id });
      itemId = inserted.id;
    }

    // Activity logging
    const action: import('@/types').ActivityAction | null = (() => {
      if (nextStatus === 'received') return 'checklist_item_received';
      if (nextStatus === 'waived') return 'checklist_item_waived';
      if (nextStatus === 'n_a') return 'checklist_item_na';
      if (nextStatus === 'blocked') return 'playbook_item_blocked';
      return null;
    })();
    if (action) {
      await logActivity(tx, {
        workspaceId: cl.workspaceId,
        userId: session.userId,
        action,
        targetType: 'file',
        targetId: itemId,
        metadata: { playbookItemId: input.playbookItemId, number: pb.number },
      });
    }

    return itemId;
  });
}
```

- [ ] **Step 4: Run tests, verify pass**

```bash
cd cis-deal-room && npx vitest run src/test/dal/checklist.test.ts
```

Expected: all tests pass (including the two new ones).

- [ ] **Step 5: Commit**

```bash
cd cis-deal-room
git add src/lib/dal/checklist.ts src/test/dal/checklist.test.ts
git commit -m "feat(playbook): setCanonicalItemStatus upserts checklist_items for canonical playbook items"
```

---

### Task 2.5: Extend `setItemStatus` to support `blocked`

The existing `setItemStatus` (line 270) handles non-canonical items. Add `blocked` to the action map and update the receivedAt/receivedBy reset logic.

**Files:**
- Modify: `cis-deal-room/src/lib/dal/checklist.ts:318-324` (action map)

- [ ] **Step 1: Update action map**

In `cis-deal-room/src/lib/dal/checklist.ts`, locate the `actionMap` inside `setItemStatus` (around line 318) and add `blocked`:

```ts
const actionMap: Record<ChecklistStatus, import('@/types').ActivityAction | null> = {
  received: 'checklist_item_received',
  waived: 'checklist_item_waived',
  n_a: 'checklist_item_na',
  blocked: 'playbook_item_blocked',
  not_started: null,
  in_progress: null,
};
```

- [ ] **Step 2: Run existing checklist tests**

```bash
cd cis-deal-room && npx vitest run src/test/dal/checklist.test.ts
```

Expected: pass (the `blocked` value is now accepted, previously missing key would have been a TS error).

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd cis-deal-room && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd cis-deal-room
git add src/lib/dal/checklist.ts
git commit -m "feat(playbook): support blocked status in setItemStatus action map"
```

---

### Task 2.6: Update types — add `blocked` to ChecklistStatus + new playbook types

**Files:**
- Modify: `cis-deal-room/src/types/index.ts` (or wherever `ChecklistStatus` and `ActivityAction` are exported)

- [ ] **Step 1: Locate the type file**

```bash
cd cis-deal-room && grep -rn "export type ChecklistStatus" src/types/
```

Expected: a single match — record its path.

- [ ] **Step 2: Update the union**

Open the matched file. Update `ChecklistStatus`:

```ts
export type ChecklistStatus =
  | 'not_started'
  | 'in_progress'
  | 'blocked'
  | 'received'
  | 'waived'
  | 'n_a';
```

And `ActivityAction` (locate similarly):

```ts
export type ActivityAction =
  // … existing values …
  | 'checklist_item_assigned'
  | 'playbook_item_blocked'
  | 'buyer_invite_with_outstanding';
```

Also export the new playbook union types so the API and UI can consume them:

```ts
export type PlaybookCategory =
  | 'corporate_legal'
  | 'financial'
  | 'commercial'
  | 'team_hr'
  | 'ip_technical'
  | 'operations_risk';

export type DealKillerGroup =
  | 'cap_table'
  | 'eighty_three_b'
  | 'customer_coc'
  | 'ip_assignment'
  | 'revenue_bridge';
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd cis-deal-room && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd cis-deal-room
git add src/types
git commit -m "chore(types): add blocked + playbook category and deal-killer-group types"
```

---

## Phase 3: API endpoints

### Task 3.1: Update `GET /api/workspaces/[id]/checklist` to return playbook view

**Files:**
- Modify: `cis-deal-room/src/app/api/workspaces/[id]/checklist/route.ts`

- [ ] **Step 1: Read the existing route to confirm current shape**

```bash
cd cis-deal-room && cat src/app/api/workspaces/[id]/checklist/route.ts
```

Note the response shape currently returned (likely `{ checklist, items }`).

- [ ] **Step 2: Replace the GET handler**

Edit `cis-deal-room/src/app/api/workspaces/[id]/checklist/route.ts`. The new GET returns the merged playbook view + the checklist row, only for seller-side and CIS roles. Buyers and view_only-as-buyer get the legacy items list (no canonical overlay). Use `requireDealAccess` and check role inline.

```ts
import { verifySession } from '@/lib/dal/index';
import { requireDealAccess } from '@/lib/dal/access';
import { getChecklistForWorkspace, listItemsForViewer } from '@/lib/dal/checklist';
import { getPlaybookView } from '@/lib/dal/playbook';

const PLAYBOOK_VISIBLE_ROLES = new Set([
  'admin',
  'cis_team',
  'client',         // The seller themselves on a seller_side deal — visibility check below
  'seller_rep',
  'seller_counsel',
]);

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await verifySession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: workspaceId } = await params;

  let access;
  try {
    access = await requireDealAccess(workspaceId, session);
  } catch {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const checklist = await getChecklistForWorkspace(workspaceId);
  if (!checklist) {
    return Response.json({ checklist: null, items: [], playbook: null });
  }

  // Decide whether this viewer sees the playbook overlay.
  // Hide playbook from buyer-side, view_only, and the deprecated counsel role.
  const role = access.role;
  const isClientOnSellerSide =
    role === 'client' && access.workspace.cisAdvisorySide === 'seller_side';
  const showPlaybook =
    session.isAdmin ||
    role === 'admin' ||
    role === 'cis_team' ||
    role === 'seller_rep' ||
    role === 'seller_counsel' ||
    isClientOnSellerSide;

  if (showPlaybook) {
    const playbook = await getPlaybookView(checklist.id);
    return Response.json({ checklist, playbook });
  }

  // Legacy view for buyer-side / view_only / counsel — items only, no playbook.
  const items = await listItemsForViewer(workspaceId);
  return Response.json({ checklist, items });
}
```

Note: this assumes `requireDealAccess` returns `{ role, workspace }`. Verify against `cis-deal-room/src/lib/dal/access.ts`. If the shape differs, adjust the destructure.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd cis-deal-room && npx tsc --noEmit
```

Expected: no errors. If `requireDealAccess` doesn't expose `workspace.cisAdvisorySide`, fetch it via `getWorkspace(workspaceId)`.

- [ ] **Step 4: Smoke test against dev DB**

```bash
cd cis-deal-room && npm run dev &
# wait ~5s, then curl with a session cookie from the browser:
curl -s -b "session=<cookie>" http://localhost:3000/api/workspaces/<id>/checklist | jq '.playbook.canonical | length'
```

Expected: `48` for an admin user in a fresh workspace.

- [ ] **Step 5: Commit**

```bash
cd cis-deal-room
git add src/app/api/workspaces/[id]/checklist/route.ts
git commit -m "feat(playbook): GET /api/workspaces/[id]/checklist returns playbook view for seller-side roles"
```

---

### Task 3.2: New endpoint — `GET /api/workspaces/[id]/readiness`

**Files:**
- Create: `cis-deal-room/src/app/api/workspaces/[id]/readiness/route.ts`

- [ ] **Step 1: Implement the route**

```ts
import { verifySession } from '@/lib/dal/index';
import { requireDealAccess } from '@/lib/dal/access';
import { getChecklistForWorkspace } from '@/lib/dal/checklist';
import { getReadinessSummary } from '@/lib/dal/playbook';

const PLAYBOOK_VISIBLE_ROLES = new Set([
  'admin',
  'cis_team',
  'seller_rep',
  'seller_counsel',
]);

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await verifySession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: workspaceId } = await params;

  let access;
  try {
    access = await requireDealAccess(workspaceId, session);
  } catch {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const role = access.role;
  const isClientOnSellerSide =
    role === 'client' && access.workspace.cisAdvisorySide === 'seller_side';
  const allowed =
    session.isAdmin || PLAYBOOK_VISIBLE_ROLES.has(role) || isClientOnSellerSide;
  if (!allowed) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const checklist = await getChecklistForWorkspace(workspaceId);
  if (!checklist) {
    return Response.json({
      total: 0,
      ready: 0,
      byCategory: {
        corporate_legal: { total: 0, ready: 0 },
        financial: { total: 0, ready: 0 },
        commercial: { total: 0, ready: 0 },
        team_hr: { total: 0, ready: 0 },
        ip_technical: { total: 0, ready: 0 },
        operations_risk: { total: 0, ready: 0 },
      },
      dealKillerGroups: [],
    });
  }

  const summary = await getReadinessSummary(checklist.id);
  return Response.json(summary);
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd cis-deal-room && npx tsc --noEmit
```

- [ ] **Step 3: Smoke test**

```bash
curl -s -b "session=<cookie>" http://localhost:3000/api/workspaces/<id>/readiness | jq '.total, .ready'
```

Expected: `48` and a number 0–48.

- [ ] **Step 4: Commit**

```bash
cd cis-deal-room
git add src/app/api/workspaces/[id]/readiness/route.ts
git commit -m "feat(playbook): GET /api/workspaces/[id]/readiness returns score + per-category + deal-killer groups"
```

---

### Task 3.3: New endpoint — `PATCH /api/workspaces/[id]/checklist/playbook/[playbookItemId]/status`

For canonical items, we route status changes through a playbook-aware endpoint that upserts the checklist_items row. (Custom items keep using the existing `/items/[itemId]/status` endpoint.)

**Files:**
- Create: `cis-deal-room/src/app/api/workspaces/[id]/checklist/playbook/[playbookItemId]/status/route.ts`

- [ ] **Step 1: Implement**

```ts
import { z } from 'zod';
import { verifySession } from '@/lib/dal/index';
import { requireDealAccess } from '@/lib/dal/access';
import { getChecklistForWorkspace } from '@/lib/dal/checklist';
import { setCanonicalItemStatus } from '@/lib/dal/checklist';

const bodySchema = z.object({
  target: z.enum([
    'not_started',
    'in_progress',
    'blocked',
    'received',
    'waived',
    'n_a',
    'reset',
  ]),
});

export async function PATCH(
  request: Request,
  {
    params,
  }: { params: Promise<{ id: string; playbookItemId: string }> },
) {
  const session = await verifySession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (!session.isAdmin) return Response.json({ error: 'Admin required' }, { status: 403 });

  const { id: workspaceId, playbookItemId } = await params;

  try {
    await requireDealAccess(workspaceId, session);
  } catch {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch (err) {
    if (err instanceof z.ZodError) {
      return Response.json({ error: err.issues }, { status: 400 });
    }
    return Response.json({ error: 'Invalid body' }, { status: 400 });
  }

  const checklist = await getChecklistForWorkspace(workspaceId);
  if (!checklist) return Response.json({ error: 'No checklist' }, { status: 404 });

  const itemId = await setCanonicalItemStatus({
    checklistId: checklist.id,
    playbookItemId,
    target: body.target,
  });

  return Response.json({ itemId, status: body.target });
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd cis-deal-room && npx tsc --noEmit
```

- [ ] **Step 3: Smoke test**

```bash
curl -s -b "session=<cookie>" -X PATCH \
  -H "Content-Type: application/json" \
  -d '{"target":"received"}' \
  http://localhost:3000/api/workspaces/<id>/checklist/playbook/<pb-uuid>/status
```

Expected: `{"itemId":"...","status":"received"}` — and a row appears in checklist_items.

- [ ] **Step 4: Commit**

```bash
cd cis-deal-room
git add src/app/api/workspaces/[id]/checklist/playbook/
git commit -m "feat(playbook): PATCH endpoint to set canonical playbook item status"
```

---

### Task 3.4: Extend participant invite — gate buyer-side invites

The POST handler in `cis-deal-room/src/app/api/workspaces/[id]/participants/route.ts` checks outstanding deal-killers before issuing an invite for buyer-side roles. The client must include `acknowledgement: "share anyway"` in the body when deal-killers are outstanding. Without it, the server rejects with 409 + the list.

**Files:**
- Modify: `cis-deal-room/src/app/api/workspaces/[id]/participants/route.ts`
- Create: `cis-deal-room/src/test/api/participants-gate.test.ts`

- [ ] **Step 1: Define buyer-side roles + write the failing test**

Create `cis-deal-room/src/test/api/participants-gate.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/db', () => ({ db: {} }));

vi.mock('@/lib/dal/index', () => ({
  verifySession: vi.fn().mockResolvedValue({
    userId: 'admin', userEmail: 'a@x', isAdmin: true,
  }),
}));

const getOutstandingMock = vi.fn();
vi.mock('@/lib/dal/playbook', () => ({
  getOutstandingDealKillerGroups: getOutstandingMock,
}));

vi.mock('@/lib/dal/checklist', () => ({
  getChecklistForWorkspace: vi.fn().mockResolvedValue({ id: 'cl-1' }),
}));

vi.mock('@/lib/dal/access', () => ({
  requireDealAccess: vi.fn().mockResolvedValue({ workspace: { cisAdvisorySide: 'seller_side' } }),
}));

const inviteMock = vi.fn();
vi.mock('@/lib/dal/participants', () => ({
  inviteParticipant: inviteMock,
  getParticipants: vi.fn(),
}));

vi.mock('@/lib/dal/workspaces', () => ({
  getWorkspace: vi.fn().mockResolvedValue({ id: 'ws', name: 'Deal' }),
}));

vi.mock('@/lib/email/send', () => ({ sendEmail: vi.fn() }));
vi.mock('@/lib/email/invitation', () => ({ InvitationEmail: vi.fn() }));
vi.mock('@/lib/app-url', () => ({ getAppUrl: () => 'https://test' }));

import { POST } from '@/app/api/workspaces/[id]/participants/route';

function makeReq(body: unknown): Request {
  return new Request('http://test/x', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /participants — buyer-invite gate', () => {
  beforeEach(() => {
    inviteMock.mockReset();
    inviteMock.mockResolvedValue({
      participant: { id: 'p1' },
      rawToken: 't',
    });
  });

  it('blocks buyer_rep invite with outstanding deal-killers and no ack', async () => {
    getOutstandingMock.mockResolvedValueOnce([
      { group: 'cap_table', status: 'blocked', color: 'red', members: [] },
    ]);

    const res = await POST(
      makeReq({ email: 'b@x', role: 'buyer_rep', folderIds: [] }),
      { params: Promise.resolve({ id: 'ws' }) },
    );

    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.outstanding).toHaveLength(1);
    expect(json.outstanding[0].group).toBe('cap_table');
    expect(inviteMock).not.toHaveBeenCalled();
  });

  it('allows buyer_rep invite with outstanding deal-killers when ack matches', async () => {
    getOutstandingMock.mockResolvedValueOnce([
      { group: 'cap_table', status: 'blocked', color: 'red', members: [] },
    ]);

    const res = await POST(
      makeReq({
        email: 'b@x',
        role: 'buyer_rep',
        folderIds: [],
        acknowledgement: 'share anyway',
      }),
      { params: Promise.resolve({ id: 'ws' }) },
    );

    expect(res.status).toBe(201);
    expect(inviteMock).toHaveBeenCalled();
  });

  it('does not gate seller_rep invites', async () => {
    getOutstandingMock.mockResolvedValueOnce([
      { group: 'cap_table', status: 'blocked', color: 'red', members: [] },
    ]);

    const res = await POST(
      makeReq({ email: 's@x', role: 'seller_rep', folderIds: [] }),
      { params: Promise.resolve({ id: 'ws' }) },
    );

    expect(res.status).toBe(201);
    expect(inviteMock).toHaveBeenCalled();
  });

  it('passes through buyer_rep invite when no deal-killers outstanding', async () => {
    getOutstandingMock.mockResolvedValueOnce([]);

    const res = await POST(
      makeReq({ email: 'b@x', role: 'buyer_rep', folderIds: [] }),
      { params: Promise.resolve({ id: 'ws' }) },
    );

    expect(res.status).toBe(201);
    expect(inviteMock).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run, confirm fail**

```bash
cd cis-deal-room && npx vitest run src/test/api/participants-gate.test.ts
```

Expected: tests fail (handler doesn't call `getOutstandingDealKillerGroups` yet).

- [ ] **Step 3: Modify the route**

Edit `cis-deal-room/src/app/api/workspaces/[id]/participants/route.ts`. Add to imports:

```ts
import { getOutstandingDealKillerGroups } from '@/lib/dal/playbook';
import { getChecklistForWorkspace } from '@/lib/dal/checklist';
import { logActivity } from '@/lib/dal/activity';
import { db } from '@/db';
```

Update the Zod schema to include `acknowledgement`:

```ts
const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum([
    'admin', 'cis_team', 'client', 'counsel',
    'buyer_rep', 'seller_rep', 'view_only',
    'seller_counsel', 'buyer_counsel',
  ]),
  folderIds: z.array(z.string().uuid()).default([]),
  viewOnlyShadowSide: z.enum(['buyer', 'seller']).nullable().optional(),
  acknowledgement: z.string().optional(),
});

const BUYER_SIDE_ROLES = new Set(['buyer_rep', 'buyer_counsel']);
```

Inside POST, after the schema parse and before `inviteParticipant`, insert the gate check:

```ts
// Gate: buyer-side invites with outstanding deal-killers require acknowledgement.
// view_only with shadowSide='buyer' also counts as buyer-side for this gate.
const isBuyerSideInvite =
  BUYER_SIDE_ROLES.has(parsed.role) ||
  (parsed.role === 'view_only' && parsed.viewOnlyShadowSide === 'buyer');

if (isBuyerSideInvite) {
  const checklist = await getChecklistForWorkspace(workspaceId);
  if (checklist) {
    const outstanding = await getOutstandingDealKillerGroups(checklist.id);
    if (outstanding.length > 0) {
      const ackOk = parsed.acknowledgement?.trim().toLowerCase() === 'share anyway';
      if (!ackOk) {
        return Response.json(
          { error: 'Outstanding deal-killers', outstanding },
          { status: 409 },
        );
      }
      // Acknowledged — log to activity for audit trail.
      await logActivity(db, {
        workspaceId,
        userId: session.userId,
        action: 'buyer_invite_with_outstanding',
        targetType: 'participant',
        metadata: {
          targetEmail: email,
          outstandingGroups: outstanding.map((o) => o.group),
        },
      });
    }
  }
}
```

Place this block **after** the `email = parsed.email.toLowerCase()` line and **before** `inviteParticipant({...})`.

- [ ] **Step 4: Run tests, verify pass**

```bash
cd cis-deal-room && npx vitest run src/test/api/participants-gate.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
cd cis-deal-room
git add src/app/api/workspaces/[id]/participants/route.ts src/test/api/participants-gate.test.ts
git commit -m "feat(playbook): gate buyer-side invites on outstanding deal-killers (typed ack required)"
```

---

## Phase 4: Checklist UI restructure

Goal: the checklist tab renders the playbook view grouped by canonical category, with rationale, deal-killer accents, and a custom-items section per category.

### Task 4.1: Add `blocked` to ChecklistStatusChip + status labels

**Files:**
- Modify: `cis-deal-room/src/components/workspace/ChecklistStatusChip.tsx`
- Modify: `cis-deal-room/src/components/workspace/ChecklistTable.tsx:40-42` (STATUS_LABEL map)

- [ ] **Step 1: Read the current chip component**

```bash
cd cis-deal-room && cat src/components/workspace/ChecklistStatusChip.tsx
```

Note where status → label and status → color mapping lives.

- [ ] **Step 2: Add `blocked` to label and color maps**

In `ChecklistStatusChip.tsx`, locate the status-to-color map and add the `blocked` case (red, matching the brand red `#E10600`). Locate the dropdown options if admin can transition status, and include `blocked` in the list. The exact code edits depend on the chip's current shape — for a typical pattern:

```ts
const STATUS_LABEL: Record<ChecklistStatus, string> = {
  not_started: 'Not Started',
  in_progress: 'In Progress',
  blocked: 'Blocked',
  received: 'Received',
  waived: 'Waived',
  n_a: 'N/A',
};

const STATUS_CLASS: Record<ChecklistStatus, string> = {
  not_started: 'bg-surface text-text-muted border-border',
  in_progress: 'bg-amber-950/40 text-amber-200 border-amber-800/60',
  blocked: 'bg-accent/20 text-accent border-accent/60',
  received: 'bg-emerald-950/40 text-emerald-200 border-emerald-800/60',
  waived: 'bg-surface text-text-secondary border-border',
  n_a: 'bg-surface text-text-muted border-border',
};
```

In `ChecklistTable.tsx:40-42`, update the STATUS_LABEL map to include `blocked: 'Blocked'`.

- [ ] **Step 3: Verify TypeScript**

```bash
cd cis-deal-room && npx tsc --noEmit
```

- [ ] **Step 4: Run existing checklist component tests**

```bash
cd cis-deal-room && npx vitest run src/components/workspace/FileList.test.tsx src/components/workspace/PreviewModal.test.tsx
```

Expected: pass (no regression).

- [ ] **Step 5: Commit**

```bash
cd cis-deal-room
git add src/components/workspace/ChecklistStatusChip.tsx src/components/workspace/ChecklistTable.tsx
git commit -m "feat(playbook): blocked status visible in chip + filter labels"
```

---

### Task 4.2: New component — `PlaybookChecklistView`

This renders the canonical view (grouped by category, deal-killer pinning, rationale expand). The existing `ChecklistView` becomes the entry point that picks between the playbook view (when `playbook` data is present) and the legacy `ChecklistTable`.

**Files:**
- Create: `cis-deal-room/src/components/workspace/PlaybookChecklistView.tsx`
- Modify: `cis-deal-room/src/components/workspace/ChecklistView.tsx`
- Create: `cis-deal-room/src/test/components/PlaybookChecklistView.test.tsx`

- [ ] **Step 1: Write the failing component test**

Create `cis-deal-room/src/test/components/PlaybookChecklistView.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PlaybookChecklistView } from '@/components/workspace/PlaybookChecklistView';

const mockCanonical = [
  {
    playbookItemId: 'pb-5',
    number: 5,
    category: 'corporate_legal' as const,
    name: 'Cap table',
    rationale: 'Must reconcile to the share.',
    dealKillerGroup: 'cap_table' as const,
    defaultPriority: 'critical' as const,
    sortOrder: 5,
    itemId: null,
    status: 'not_started' as const,
    owner: 'unassigned' as const,
    priority: 'critical' as const,
    notes: null,
    receivedAt: null,
    folderId: null,
  },
  {
    playbookItemId: 'pb-1',
    number: 1,
    category: 'corporate_legal' as const,
    name: 'Cert of Inc',
    rationale: 'Must reflect every share class.',
    dealKillerGroup: null,
    defaultPriority: 'high' as const,
    sortOrder: 1,
    itemId: null,
    status: 'received' as const,
    owner: 'seller' as const,
    priority: 'high' as const,
    notes: null,
    receivedAt: new Date(),
    folderId: null,
  },
];

describe('PlaybookChecklistView', () => {
  it('renders canonical items grouped by category', () => {
    render(
      <PlaybookChecklistView
        workspaceId="ws-1"
        isAdmin={true}
        canonical={mockCanonical}
        custom={[]}
        folders={[]}
        onChanged={() => {}}
        onUploadForItem={() => {}}
      />,
    );

    expect(screen.getByText('Corporate & Legal')).toBeInTheDocument();
    expect(screen.getByText('Cap table')).toBeInTheDocument();
    expect(screen.getByText('Cert of Inc')).toBeInTheDocument();
  });

  it('pins deal-killer items above non-killer items in the same category', () => {
    render(
      <PlaybookChecklistView
        workspaceId="ws-1"
        isAdmin={true}
        canonical={mockCanonical}
        custom={[]}
        folders={[]}
        onChanged={() => {}}
        onUploadForItem={() => {}}
      />,
    );

    const items = screen.getAllByTestId('playbook-item');
    // Cap table (deal-killer) must come before Cert of Inc despite higher number.
    expect(items[0]).toHaveTextContent('Cap table');
    expect(items[1]).toHaveTextContent('Cert of Inc');
  });
});
```

- [ ] **Step 2: Run, confirm fail**

```bash
cd cis-deal-room && npx vitest run src/test/components/PlaybookChecklistView.test.tsx
```

Expected: fail with "module not found".

- [ ] **Step 3: Implement the component**

Create `cis-deal-room/src/components/workspace/PlaybookChecklistView.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, AlertCircle, Plus } from 'lucide-react';
import clsx from 'clsx';
import type {
  PlaybookCategory,
  ChecklistStatus,
  ChecklistOwner,
  ChecklistPriority,
  DealKillerGroup,
} from '@/types';
import { ChecklistStatusChip } from './ChecklistStatusChip';

interface CanonicalRow {
  playbookItemId: string;
  number: number;
  category: PlaybookCategory;
  name: string;
  rationale: string;
  dealKillerGroup: DealKillerGroup | null;
  defaultPriority: ChecklistPriority;
  sortOrder: number;
  itemId: string | null;
  status: ChecklistStatus;
  owner: ChecklistOwner;
  priority: ChecklistPriority;
  notes: string | null;
  receivedAt: Date | string | null;
  folderId: string | null;
}

interface CustomRow {
  itemId: string;
  category: PlaybookCategory;
  name: string;
  status: ChecklistStatus;
  owner: ChecklistOwner;
  priority: ChecklistPriority;
  notes: string | null;
  folderId: string | null;
  sortOrder: number;
}

interface Props {
  workspaceId: string;
  isAdmin: boolean;
  canonical: CanonicalRow[];
  custom: CustomRow[];
  folders: Array<{ id: string; name: string }>;
  onChanged: () => void;
  onUploadForItem: (itemId: string, name: string) => void;
}

const CATEGORY_LABEL: Record<PlaybookCategory, string> = {
  corporate_legal: 'Corporate & Legal',
  financial: 'Financial',
  commercial: 'Commercial & Customer',
  team_hr: 'Team & HR',
  ip_technical: 'IP & Technical',
  operations_risk: 'Operations & Risk',
};

const CATEGORY_ORDER: PlaybookCategory[] = [
  'corporate_legal',
  'financial',
  'commercial',
  'team_hr',
  'ip_technical',
  'operations_risk',
];

export function PlaybookChecklistView({
  workspaceId,
  isAdmin,
  canonical,
  custom,
  onChanged,
  onUploadForItem,
}: Props) {
  return (
    <div className="px-8 pt-6 pb-12 max-w-5xl">
      <h2 className="text-lg font-semibold text-text-primary mb-1">Diligence Playbook</h2>
      <p className="text-sm text-text-muted mb-6">
        48-item Data Room Construction Playbook. Resolve every item before sharing the room.
      </p>

      {CATEGORY_ORDER.map((cat) => {
        const items = canonical.filter((c) => c.category === cat);
        const customItems = custom.filter((c) => c.category === cat);
        // Deal-killers first within category, then by sort_order.
        items.sort((a, b) => {
          if (!!a.dealKillerGroup !== !!b.dealKillerGroup) {
            return a.dealKillerGroup ? -1 : 1;
          }
          return a.sortOrder - b.sortOrder;
        });

        return (
          <CategorySection
            key={cat}
            label={CATEGORY_LABEL[cat]}
            items={items}
            customItems={customItems}
            isAdmin={isAdmin}
            workspaceId={workspaceId}
            onChanged={onChanged}
            onUploadForItem={onUploadForItem}
          />
        );
      })}
    </div>
  );
}

interface CategorySectionProps {
  label: string;
  items: CanonicalRow[];
  customItems: CustomRow[];
  isAdmin: boolean;
  workspaceId: string;
  onChanged: () => void;
  onUploadForItem: (itemId: string, name: string) => void;
}

function CategorySection({
  label,
  items,
  customItems,
  isAdmin,
  workspaceId,
  onChanged,
  onUploadForItem,
}: CategorySectionProps) {
  return (
    <section className="mb-8">
      <h3 className="text-xs font-medium text-text-muted uppercase tracking-wider mb-3">
        {label}
      </h3>
      <div className="border border-border rounded-xl divide-y divide-border bg-surface">
        {items.map((item) => (
          <PlaybookItemRow
            key={item.playbookItemId}
            item={item}
            isAdmin={isAdmin}
            workspaceId={workspaceId}
            onChanged={onChanged}
            onUploadForItem={onUploadForItem}
          />
        ))}
        {customItems.map((item) => (
          <CustomItemRow
            key={item.itemId}
            item={item}
            isAdmin={isAdmin}
            workspaceId={workspaceId}
            onChanged={onChanged}
            onUploadForItem={onUploadForItem}
          />
        ))}
      </div>
      {isAdmin && (
        <button
          className="mt-3 flex items-center gap-2 text-xs text-text-muted hover:text-text-secondary transition-colors"
          onClick={() => {
            // Open existing ChecklistItemEditModal in 'create' mode for this category.
            // Wired in Task 4.4.
            console.log('add custom item to', label);
          }}
        >
          <Plus size={12} />
          Add custom item
        </button>
      )}
    </section>
  );
}

interface PlaybookItemRowProps {
  item: CanonicalRow;
  isAdmin: boolean;
  workspaceId: string;
  onChanged: () => void;
  onUploadForItem: (itemId: string, name: string) => void;
}

function PlaybookItemRow({
  item,
  isAdmin,
  workspaceId,
  onChanged,
  onUploadForItem,
}: PlaybookItemRowProps) {
  const [expanded, setExpanded] = useState(false);
  const isKiller = !!item.dealKillerGroup;

  return (
    <div
      data-testid="playbook-item"
      className={clsx(
        'p-4 flex flex-col gap-2',
        isKiller && 'border-l-2 border-l-accent',
      )}
    >
      <div className="flex items-start gap-3">
        <button
          aria-label={expanded ? 'Collapse' : 'Expand'}
          onClick={() => setExpanded((v) => !v)}
          className="text-text-muted hover:text-text-secondary mt-0.5"
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        <span className="text-xs font-mono text-text-muted shrink-0 mt-0.5 w-6 text-right">
          {item.number}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {isKiller && (
              <span
                title="Deal-killer"
                className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-accent"
              >
                <AlertCircle size={10} />
                Deal-killer
              </span>
            )}
            <span className="text-sm text-text-primary">{item.name}</span>
          </div>
          {expanded && (
            <p className="text-xs text-text-secondary mt-2 leading-relaxed">
              <span className="font-semibold">Why investors check this:</span> {item.rationale}
            </p>
          )}
        </div>
        <div className="shrink-0">
          <ChecklistStatusChip
            workspaceId={workspaceId}
            itemId={item.itemId ?? `pb:${item.playbookItemId}`}
            status={item.status}
            isAdmin={isAdmin}
            onChanged={onChanged}
            // For canonical virtual rows (itemId === null), the chip's mutation
            // path needs to call the playbook PATCH endpoint. Implemented in 4.3.
            playbookItemId={item.itemId ? null : item.playbookItemId}
          />
        </div>
      </div>
    </div>
  );
}

interface CustomItemRowProps {
  item: CustomRow;
  isAdmin: boolean;
  workspaceId: string;
  onChanged: () => void;
  onUploadForItem: (itemId: string, name: string) => void;
}

function CustomItemRow({
  item,
  isAdmin,
  workspaceId,
  onChanged,
}: CustomItemRowProps) {
  return (
    <div data-testid="playbook-item-custom" className="p-4 flex items-center gap-3">
      <span className="text-[10px] font-medium uppercase tracking-wider text-text-muted shrink-0">
        Custom
      </span>
      <span className="text-sm text-text-primary flex-1 min-w-0 truncate">{item.name}</span>
      <ChecklistStatusChip
        workspaceId={workspaceId}
        itemId={item.itemId}
        status={item.status}
        isAdmin={isAdmin}
        onChanged={onChanged}
        playbookItemId={null}
      />
    </div>
  );
}
```

- [ ] **Step 4: Update ChecklistStatusChip to accept `playbookItemId`**

In `cis-deal-room/src/components/workspace/ChecklistStatusChip.tsx`, add a new optional prop and route mutations to the playbook endpoint when set. Locate the props interface and the fetch call:

```tsx
interface Props {
  workspaceId: string;
  itemId: string;
  status: ChecklistStatus;
  isAdmin: boolean;
  onChanged: () => void;
  /** When set, status changes route to /checklist/playbook/[playbookItemId]/status */
  playbookItemId?: string | null;
}
```

In the function body, when calling the API, branch:

```tsx
const url = playbookItemId
  ? `/api/workspaces/${workspaceId}/checklist/playbook/${playbookItemId}/status`
  : `/api/workspaces/${workspaceId}/checklist/items/${itemId}/status`;
```

(Existing call sites passing only the legacy `itemId` keep working because `playbookItemId` is optional.)

- [ ] **Step 5: Run the component tests, verify pass**

```bash
cd cis-deal-room && npx vitest run src/test/components/PlaybookChecklistView.test.tsx
```

Expected: 2 tests pass.

- [ ] **Step 6: Commit**

```bash
cd cis-deal-room
git add src/components/workspace/PlaybookChecklistView.tsx src/components/workspace/ChecklistStatusChip.tsx src/test/components/PlaybookChecklistView.test.tsx
git commit -m "feat(playbook): PlaybookChecklistView grouped by canonical category with deal-killer pinning"
```

---

### Task 4.3: Wire `PlaybookChecklistView` into `ChecklistView`

**Files:**
- Modify: `cis-deal-room/src/components/workspace/ChecklistView.tsx`

- [ ] **Step 1: Update the response handling and render path**

Replace the body of `ChecklistView` so it switches on the API response shape. When `playbook` is present, render `PlaybookChecklistView`. Otherwise fall back to the existing `ChecklistTable`.

```tsx
'use client';

import { useEffect, useState, useCallback } from 'react';
import { ClipboardList, Upload } from 'lucide-react';
import { fetchWithAuth } from '@/lib/fetch-with-auth';
import { ChecklistImportModal } from './ChecklistImportModal';
import { ChecklistTable } from './ChecklistTable';
import type { ChecklistItemRow } from './ChecklistTable';
import { PlaybookChecklistView } from './PlaybookChecklistView';

export type { ChecklistItemRow };

interface Props {
  workspaceId: string;
  isAdmin: boolean;
  onChanged?: () => void;
  onUploadForItem: (folderId: string | null, itemId: string, itemName: string) => void;
  folders: Array<{ id: string; name: string }>;
}

interface PlaybookView {
  canonical: Array<unknown>; // typed in PlaybookChecklistView
  custom: Array<unknown>;
}

export function ChecklistView({ workspaceId, isAdmin, onChanged, onUploadForItem, folders }: Props) {
  const [loading, setLoading] = useState(true);
  const [checklist, setChecklist] = useState<{ id: string; name: string } | null>(null);
  const [playbook, setPlaybook] = useState<PlaybookView | null>(null);
  const [items, setItems] = useState<ChecklistItemRow[]>([]);
  const [showImport, setShowImport] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const res = await fetchWithAuth(`/api/workspaces/${workspaceId}/checklist`);
    if (res.ok) {
      const data = await res.json();
      setChecklist(data.checklist);
      setPlaybook(data.playbook ?? null);
      setItems(data.items ?? []);
    }
    setLoading(false);
  }, [workspaceId]);

  useEffect(() => { refresh(); }, [refresh]);

  if (loading) return <div className="p-8 text-text-muted">Loading…</div>;

  if (!checklist) {
    if (isAdmin) {
      return (
        <div className="p-8 max-w-xl">
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <ClipboardList size={32} className="text-text-muted" />
            <h2 className="text-lg font-semibold text-text-primary">Import diligence checklist</h2>
            <p className="text-sm text-text-secondary">
              Upload an .xlsx of requested diligence items to track progress and let
              participants upload against each request.
            </p>
            <button
              onClick={() => setShowImport(true)}
              className="flex items-center gap-2 bg-accent hover:bg-accent-hover text-text-inverse
                text-sm font-medium px-4 py-2 rounded-lg transition-colors cursor-pointer"
            >
              <Upload size={14} />
              Import checklist
            </button>
          </div>
          {showImport && (
            <ChecklistImportModal
              workspaceId={workspaceId}
              onClose={() => setShowImport(false)}
              onImported={() => {
                setShowImport(false);
                refresh();
                onChanged?.();
              }}
            />
          )}
        </div>
      );
    }
    return <div className="p-8 text-text-muted text-sm">No checklist yet.</div>;
  }

  if (playbook) {
    return (
      <PlaybookChecklistView
        workspaceId={workspaceId}
        isAdmin={isAdmin}
        canonical={playbook.canonical as never}
        custom={playbook.custom as never}
        folders={folders}
        onChanged={() => { refresh(); onChanged?.(); }}
        onUploadForItem={(itemId, name) => onUploadForItem(null, itemId, name)}
      />
    );
  }

  return (
    <div>
      <div className="px-8 pt-6 pb-2">
        <h2 className="text-lg font-semibold text-text-primary">{checklist.name}</h2>
      </div>
      <ChecklistTable
        workspaceId={workspaceId}
        items={items}
        isAdmin={isAdmin}
        onChanged={() => { refresh(); onChanged?.(); }}
        onUploadForItem={(item) => onUploadForItem(item.folderId, item.id, item.name)}
        folders={folders}
      />
    </div>
  );
}
```

The `onUploadForItem` prop signature changes — the first arg becomes `string | null` because canonical items don't have a folder. Audit call sites in `WorkspaceShell.tsx` and update the upload flow to handle null folderId.

- [ ] **Step 2: Update `WorkspaceShell` to handle nullable folderId on upload**

```bash
cd cis-deal-room && grep -n "onUploadForItem" src/components/workspace/WorkspaceShell.tsx
```

For null folderId on canonical playbook items, the upload modal should prompt the user to pick a destination folder (or open an existing UploadModal with no preselected folder). Open `WorkspaceShell.tsx` and update the handler:

```tsx
onUploadForItem={(folderId, itemId, itemName) => {
  // Canonical playbook items have null folderId; the upload modal lets the user pick.
  setUploadModalState({ open: true, folderId, itemId, itemName });
}}
```

The existing `UploadModal` may already accept a nullable `folderId`. If not, add a folder picker to the modal when `folderId === null`. Keep the change minimal — the picker can reuse the folder list already passed to ChecklistView.

- [ ] **Step 3: TypeScript check + manual smoke test**

```bash
cd cis-deal-room && npx tsc --noEmit && npm run dev
```

Open a workspace as admin. Navigate to the Checklist tab. You should see the 6-category playbook view with 48 items, deal-killers pinned in red.

- [ ] **Step 4: Commit**

```bash
cd cis-deal-room
git add src/components/workspace/ChecklistView.tsx src/components/workspace/WorkspaceShell.tsx
git commit -m "feat(playbook): ChecklistView routes to PlaybookChecklistView when playbook data is present"
```

---

### Task 4.4: Add custom-item creation flow

The "Add custom item" button in `CategorySection` currently logs to console. Wire it to the existing `ChecklistItemEditModal` in create mode, with category prefilled.

**Files:**
- Modify: `cis-deal-room/src/components/workspace/PlaybookChecklistView.tsx`
- Modify: `cis-deal-room/src/components/workspace/ChecklistItemEditModal.tsx` (extend to accept `defaultCategory`)
- Modify: `cis-deal-room/src/app/api/workspaces/[id]/checklist/items/route.ts` (validate category against the canonical 6-value enum)

- [ ] **Step 1: Read the existing ChecklistItemEditModal**

```bash
cd cis-deal-room && cat src/components/workspace/ChecklistItemEditModal.tsx
```

Note its props (likely `mode`, `existing`, `workspaceId`, `onClose`, `onSaved`, `folders`). Determine if it already supports a "create" mode.

- [ ] **Step 2: Extend the modal**

Add `defaultCategory?: PlaybookCategory` to its props. Use it as the initial value of the category field. The category dropdown options should be the 6 canonical values (label + value).

- [ ] **Step 3: Wire the modal in `CategorySection`**

Replace the `console.log` button click with state that opens the modal:

```tsx
const [showAddModal, setShowAddModal] = useState(false);

// … in JSX:
<button onClick={() => setShowAddModal(true)}>…</button>
{showAddModal && (
  <ChecklistItemEditModal
    mode="create"
    workspaceId={workspaceId}
    defaultCategory={categoryEnum}  // pass the parent's category prop
    folders={[]}                     // optional folder linkage
    onClose={() => setShowAddModal(false)}
    onSaved={() => { setShowAddModal(false); onChanged(); }}
  />
)}
```

`CategorySection` needs to pass through its category as a prop to the modal — update the section's prop interface:

```tsx
interface CategorySectionProps {
  // …
  category: PlaybookCategory;
}
```

And in `PlaybookChecklistView`, pass `category={cat}` when rendering each section.

- [ ] **Step 4: Validate category server-side**

In `cis-deal-room/src/app/api/workspaces/[id]/checklist/items/route.ts`, ensure the create-item Zod schema constrains `category` to the canonical 6 values:

```ts
const createSchema = z.object({
  category: z.enum([
    'corporate_legal', 'financial', 'commercial',
    'team_hr', 'ip_technical', 'operations_risk',
  ]),
  // … other fields
});
```

- [ ] **Step 5: Test the flow manually**

Restart `npm run dev`, open a workspace, click "Add custom item" under Financial. Modal opens with Financial preselected. Submit; the new custom item appears in the Custom list under Financial.

- [ ] **Step 6: Commit**

```bash
cd cis-deal-room
git add src/components/workspace/PlaybookChecklistView.tsx src/components/workspace/ChecklistItemEditModal.tsx src/app/api/workspaces/[id]/checklist/items/route.ts
git commit -m "feat(playbook): add custom item flow with category-scoped modal"
```

---

## Phase 5: DealOverview readiness panel

### Task 5.1: New component — `ReadinessPanel`

**Files:**
- Create: `cis-deal-room/src/components/workspace/ReadinessPanel.tsx`
- Create: `cis-deal-room/src/test/components/ReadinessPanel.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `cis-deal-room/src/test/components/ReadinessPanel.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReadinessPanel } from '@/components/workspace/ReadinessPanel';

const summary = {
  total: 48,
  ready: 12,
  byCategory: {
    corporate_legal: { total: 11, ready: 5 },
    financial: { total: 11, ready: 3 },
    commercial: { total: 9, ready: 2 },
    team_hr: { total: 7, ready: 1 },
    ip_technical: { total: 8, ready: 1 },
    operations_risk: { total: 2, ready: 0 },
  },
  dealKillerGroups: [
    { group: 'cap_table' as const, status: 'received' as const, color: 'green' as const, members: [] },
    { group: 'eighty_three_b' as const, status: 'blocked' as const, color: 'red' as const, members: [] },
    { group: 'customer_coc' as const, status: 'in_progress' as const, color: 'yellow' as const, members: [] },
    { group: 'ip_assignment' as const, status: 'not_started' as const, color: 'gray' as const, members: [] },
    { group: 'revenue_bridge' as const, status: 'received' as const, color: 'green' as const, members: [] },
  ],
};

describe('ReadinessPanel', () => {
  it('renders the score headline', () => {
    render(<ReadinessPanel summary={summary} onOpenChecklist={() => {}} onChipClick={() => {}} />);
    expect(screen.getByText(/12 \/ 48/)).toBeInTheDocument();
    expect(screen.getByText(/25%/)).toBeInTheDocument();
  });

  it('renders all 5 deal-killer chips', () => {
    render(<ReadinessPanel summary={summary} onOpenChecklist={() => {}} onChipClick={() => {}} />);
    expect(screen.getByText('Cap Table')).toBeInTheDocument();
    expect(screen.getByText('83(b) Filings')).toBeInTheDocument();
    expect(screen.getByText('Customer COC')).toBeInTheDocument();
    expect(screen.getByText('IP Assignments')).toBeInTheDocument();
    expect(screen.getByText('Revenue Bridge')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run, confirm fail**

```bash
cd cis-deal-room && npx vitest run src/test/components/ReadinessPanel.test.tsx
```

Expected: module not found.

- [ ] **Step 3: Implement the component**

Create `cis-deal-room/src/components/workspace/ReadinessPanel.tsx`:

```tsx
'use client';

import { ArrowRight } from 'lucide-react';
import clsx from 'clsx';

type DealKillerGroup =
  | 'cap_table'
  | 'eighty_three_b'
  | 'customer_coc'
  | 'ip_assignment'
  | 'revenue_bridge';

type ChipColor = 'green' | 'yellow' | 'red' | 'gray';

interface Summary {
  total: number;
  ready: number;
  byCategory: Record<
    'corporate_legal' | 'financial' | 'commercial' | 'team_hr' | 'ip_technical' | 'operations_risk',
    { total: number; ready: number }
  >;
  dealKillerGroups: Array<{
    group: DealKillerGroup;
    color: ChipColor;
  }>;
}

interface Props {
  summary: Summary;
  onOpenChecklist: () => void;
  /** Called with the playbook category to deep-link to in the checklist tab. */
  onChipClick: (group: DealKillerGroup) => void;
}

const GROUP_LABEL: Record<DealKillerGroup, string> = {
  cap_table: 'Cap Table',
  eighty_three_b: '83(b) Filings',
  customer_coc: 'Customer COC',
  ip_assignment: 'IP Assignments',
  revenue_bridge: 'Revenue Bridge',
};

const COLOR_CLASS: Record<ChipColor, string> = {
  green: 'bg-emerald-950/40 text-emerald-200 border-emerald-800/60',
  yellow: 'bg-amber-950/40 text-amber-200 border-amber-800/60',
  red: 'bg-accent/20 text-accent border-accent/60',
  gray: 'bg-surface text-text-muted border-border',
};

const CATEGORY_LABEL = {
  corporate_legal: 'Corporate',
  financial: 'Financial',
  commercial: 'Commercial',
  team_hr: 'Team',
  ip_technical: 'IP/Tech',
  operations_risk: 'Ops',
} as const;

const CATEGORY_ORDER = [
  'corporate_legal',
  'financial',
  'commercial',
  'team_hr',
  'ip_technical',
  'operations_risk',
] as const;

export function ReadinessPanel({ summary, onOpenChecklist, onChipClick }: Props) {
  const pct = summary.total === 0 ? 0 : Math.round((summary.ready / summary.total) * 100);

  return (
    <section className="border border-border rounded-xl bg-surface p-5 mb-6">
      {/* Headline */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-xs font-medium text-text-muted uppercase tracking-wider mb-1">
            Readiness
          </div>
          <div className="text-2xl font-semibold text-text-primary">
            {summary.ready} / {summary.total}{' '}
            <span className="text-base font-normal text-text-muted">({pct}%)</span>
          </div>
        </div>
        <button
          onClick={onOpenChecklist}
          className="flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary transition-colors"
        >
          Open checklist
          <ArrowRight size={14} />
        </button>
      </div>

      {/* Deal-killer chips */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-5">
        {summary.dealKillerGroups.map((g) => (
          <button
            key={g.group}
            onClick={() => onChipClick(g.group)}
            className={clsx(
              'border rounded-lg px-3 py-2 text-xs text-left transition-colors hover:opacity-90',
              COLOR_CLASS[g.color],
            )}
          >
            <div className="font-medium">{GROUP_LABEL[g.group]}</div>
          </button>
        ))}
      </div>

      {/* Per-category progress bars */}
      <div className="space-y-2">
        {CATEGORY_ORDER.map((cat) => {
          const c = summary.byCategory[cat];
          const ratio = c.total === 0 ? 0 : (c.ready / c.total) * 100;
          return (
            <div key={cat} className="flex items-center gap-3 text-xs">
              <span className="w-20 text-text-muted shrink-0">{CATEGORY_LABEL[cat]}</span>
              <div className="flex-1 h-1.5 bg-surface-sunken rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-700/60 transition-all"
                  style={{ width: `${ratio}%` }}
                />
              </div>
              <span className="w-12 font-mono text-text-muted text-right shrink-0">
                {c.ready}/{c.total}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run tests, verify pass**

```bash
cd cis-deal-room && npx vitest run src/test/components/ReadinessPanel.test.tsx
```

Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
cd cis-deal-room
git add src/components/workspace/ReadinessPanel.tsx src/test/components/ReadinessPanel.test.tsx
git commit -m "feat(playbook): ReadinessPanel — score, deal-killer chips, per-category progress"
```

---

### Task 5.2: Integrate ReadinessPanel into DealOverview

**Files:**
- Modify: `cis-deal-room/src/components/workspace/DealOverview.tsx`
- Modify: `cis-deal-room/src/components/workspace/WorkspaceShell.tsx` (pass workspace role through)

- [ ] **Step 1: Update DealOverview to fetch + render readiness for seller-side roles**

```tsx
'use client';

import { useEffect, useState } from 'react';
import { Folder } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { fetchWithAuth } from '@/lib/fetch-with-auth';
import { ReadinessPanel } from './ReadinessPanel';
import type { WorkspaceStatus, ParticipantRole } from '@/types';

interface Workspace {
  id: string;
  name: string;
  clientName: string;
  status: WorkspaceStatus;
  cisAdvisorySide: 'buyer_side' | 'seller_side';
  createdAt: Date | string;
}

interface FolderItem {
  id: string;
  name: string;
}

interface DealOverviewProps {
  workspace: Workspace;
  status: WorkspaceStatus;
  folders: FolderItem[];
  fileCounts: Record<string, number>;
  onFolderSelect: (folderId: string) => void;
  /** New: viewer role + admin flag, for readiness gating. */
  isAdmin: boolean;
  role: ParticipantRole;
  /** New: open the checklist tab (set view to {kind:'checklist'}). */
  onOpenChecklist: () => void;
}

const ADVISORY_LABELS = {
  buyer_side: 'Buyer-side Advisory',
  seller_side: 'Seller-side Advisory',
} as const;

const PLAYBOOK_VISIBLE_ROLES = new Set<ParticipantRole>([
  'admin', 'cis_team', 'seller_rep', 'seller_counsel',
]);

export function DealOverview({
  workspace, status, folders, fileCounts, onFolderSelect,
  isAdmin, role, onOpenChecklist,
}: DealOverviewProps) {
  const showReadiness =
    isAdmin ||
    PLAYBOOK_VISIBLE_ROLES.has(role) ||
    (role === 'client' && workspace.cisAdvisorySide === 'seller_side');

  const [summary, setSummary] = useState<Parameters<typeof ReadinessPanel>[0]['summary'] | null>(null);

  useEffect(() => {
    if (!showReadiness) return;
    let cancelled = false;
    fetchWithAuth(`/api/workspaces/${workspace.id}/readiness`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (!cancelled && data) setSummary(data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [showReadiness, workspace.id]);

  const createdDate = new Date(workspace.createdAt);
  const formattedDate = createdDate.toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  });

  return (
    <div className="p-8 max-w-3xl">
      <h1 className="text-2xl md:text-3xl font-semibold text-text-primary mb-3">{workspace.name}</h1>
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <Badge status={status} />
        <span className="text-sm text-text-secondary">{ADVISORY_LABELS[workspace.cisAdvisorySide]}</span>
        <span className="text-xs text-text-muted">&#8226;</span>
        <span className="text-xs font-mono text-text-muted">Created {formattedDate}</span>
      </div>

      {showReadiness && summary && (
        <ReadinessPanel
          summary={summary}
          onOpenChecklist={onOpenChecklist}
          onChipClick={() => onOpenChecklist()}
        />
      )}

      <div>
        <h2 className="text-xs font-medium text-text-muted uppercase tracking-wider mb-4">Folders</h2>
        <div className="grid grid-cols-2 gap-3">
          {folders.map((folder) => {
            const fileCount = fileCounts[folder.id] ?? 0;
            return (
              <button
                key={folder.id}
                onClick={() => onFolderSelect(folder.id)}
                className="bg-surface border border-border rounded-xl px-4 py-3
                  flex items-center justify-between w-full text-left
                  hover:border-accent hover:bg-accent-subtle/40 transition-colors
                  focus:outline-none focus:ring-2 focus:ring-accent"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Folder size={14} className="text-text-muted shrink-0" />
                  <span className="text-sm text-text-secondary truncate">{folder.name}</span>
                </div>
                <span className="text-xs font-mono text-text-muted shrink-0 ml-2">{fileCount}</span>
              </button>
            );
          })}
        </div>
        {folders.length === 0 && (
          <p className="text-sm text-text-muted text-center py-8">No folders in this workspace.</p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Pass new props from WorkspaceShell**

In `cis-deal-room/src/components/workspace/WorkspaceShell.tsx`, find where `<DealOverview ... />` is rendered. Pass `isAdmin`, `role`, and `onOpenChecklist`:

```tsx
<DealOverview
  workspace={workspace}
  status={status}
  folders={folders}
  fileCounts={fileCounts}
  onFolderSelect={(id) => setView({ kind: 'folder', folderId: id })}
  isAdmin={isAdmin}
  role={participantRole}
  onOpenChecklist={() => setView({ kind: 'checklist' })}
/>
```

`participantRole` should already be available in WorkspaceShell scope (or fetched from session). If not, add a prop or use the workspace participants list.

- [ ] **Step 3: Manual smoke test**

```bash
cd cis-deal-room && npm run dev
```

Open a workspace as admin. The DealOverview should now show the readiness panel above the folder grid.

- [ ] **Step 4: Commit**

```bash
cd cis-deal-room
git add src/components/workspace/DealOverview.tsx src/components/workspace/WorkspaceShell.tsx
git commit -m "feat(playbook): DealOverview shows ReadinessPanel for seller-side roles"
```

---

## Phase 6: Buyer-invite friction modal

### Task 6.1: Handle 409 response in ParticipantFormModal

**Files:**
- Modify: `cis-deal-room/src/components/workspace/ParticipantFormModal.tsx`

- [ ] **Step 1: Extend the modal state to track outstanding deal-killers**

After the existing `useState` calls (around line 58), add:

```tsx
type Outstanding = { group: string; status: string; color: string };
const [outstanding, setOutstanding] = useState<Outstanding[] | null>(null);
const [acknowledgement, setAcknowledgement] = useState('');
```

- [ ] **Step 2: Update `handleSubmit` to handle the 409 response**

In the existing `handleSubmit` (around line 70), modify the body for invite mode to include the acknowledgement when set:

```tsx
const body =
  mode === 'invite'
    ? {
        email: email.trim(),
        role,
        folderIds: Array.from(selectedFolderIds),
        viewOnlyShadowSide: role === 'view_only' ? viewOnlyShadowSide : null,
        ...(acknowledgement ? { acknowledgement } : {}),
      }
    : {
        // … unchanged
      };
```

After the `if (!res.ok)` branch, before `setError(message)`, insert handling for 409:

```tsx
if (res.status === 409) {
  const data = await res.json().catch(() => null);
  if (data?.outstanding) {
    setOutstanding(data.outstanding);
    return;
  }
}
```

- [ ] **Step 3: Render the acknowledgement step when outstanding is set**

After the existing Modal body (where role, email, folder pickers live), insert a conditional second-step render:

```tsx
{outstanding && (
  <div className="mt-4 p-4 border border-accent/40 bg-accent/10 rounded-lg">
    <h3 className="text-sm font-semibold text-accent mb-2">
      {outstanding.length} deal-killer{outstanding.length === 1 ? '' : 's'} outstanding
    </h3>
    <p className="text-sm text-text-secondary mb-3">
      You're inviting a buyer-side participant before resolving:
    </p>
    <ul className="text-xs text-text-secondary mb-3 space-y-1">
      {outstanding.map((o) => (
        <li key={o.group} className="font-mono">
          • {GROUP_LABEL[o.group as keyof typeof GROUP_LABEL] ?? o.group}
        </li>
      ))}
    </ul>
    <p className="text-xs text-text-muted mb-2">
      Type <span className="font-mono text-text-primary">share anyway</span> to proceed.
    </p>
    <input
      type="text"
      value={acknowledgement}
      onChange={(e) => setAcknowledgement(e.target.value)}
      placeholder="share anyway"
      className="w-full bg-surface-sunken border border-border rounded-lg px-3 py-2 text-sm
        text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
    />
  </div>
)}
```

Add the `GROUP_LABEL` constant at module scope:

```tsx
const GROUP_LABEL: Record<string, string> = {
  cap_table: 'Cap Table',
  eighty_three_b: '83(b) Filings',
  customer_coc: 'Customer COC',
  ip_assignment: 'IP Assignments',
  revenue_bridge: 'Revenue Bridge',
};
```

- [ ] **Step 4: Disable submit when ack required and not entered**

Update the submit button to disable when `outstanding && acknowledgement.trim().toLowerCase() !== 'share anyway'`:

```tsx
const ackRequired = outstanding !== null;
const ackOk = acknowledgement.trim().toLowerCase() === 'share anyway';
const canSubmit = !submitting && (!ackRequired || ackOk);

// On the button:
<button disabled={!canSubmit} ...>
  {submitLabel}
</button>
```

- [ ] **Step 5: Reset state on close**

In `handleClose`, also reset:

```tsx
setOutstanding(null);
setAcknowledgement('');
```

- [ ] **Step 6: Manual smoke test**

```bash
cd cis-deal-room && npm run dev
```

In a workspace with an unresolved deal-killer, open the participant invite flow. Choose role = Buyer Rep. Click Send. The modal should switch to ack mode listing the outstanding groups. Type `share anyway`. Submit succeeds.

- [ ] **Step 7: Commit**

```bash
cd cis-deal-room
git add src/components/workspace/ParticipantFormModal.tsx
git commit -m "feat(playbook): buyer-invite friction modal with typed acknowledgement"
```

---

## Phase 7: E2E happy-path + verification

### Task 7.1: E2E — fresh workspace, mark all deal-killers, invite buyer

This is a manual verification checklist (no Playwright suite exists in this repo). Document and run.

- [ ] **Step 1: Pull a clean dev environment**

```bash
cd cis-deal-room && npm run db:migrate && npm run dev
```

- [ ] **Step 2: Create a new workspace**

In the UI, create a new workspace as admin. Open it.

- [ ] **Step 3: Verify the playbook view loads**

Navigate to the Checklist tab. Confirm:
- 6 category sections present in the documented order
- 48 items total
- 7 items marked as deal-killers (red border accent): items 5, 8, 14, 16, 23, 33, 34
- Each item expandable to show rationale

- [ ] **Step 4: Verify the readiness panel on overview**

Navigate to the Overview tab. Confirm:
- Readiness panel appears above the folder grid
- Score reads "0 / 48 (0%)"
- 5 deal-killer chips: 4 gray, 0 red (all `not_started`)
- 6 category bars all empty

- [ ] **Step 5: Mark deal-killers received**

Back in the Checklist tab, mark each of items 5, 8, 14, 16, 23, 33, 34 as `received` via the status chip dropdown. Refresh the Overview. Confirm:
- Readiness score updated
- All 5 deal-killer chips green
- Category bars show partial progress

- [ ] **Step 6: Invite a buyer with no outstanding**

Open Participants → Invite. Role = Buyer Rep, email = test-buyer@example.com. Submit. Confirm the invite goes through with no acknowledgement modal.

- [ ] **Step 7: Reset one deal-killer; invite again**

Reset item 8 to `not_started`. Try inviting another buyer rep. Confirm:
- The acknowledgement modal appears
- Lists "83(b) Filings" as outstanding
- Submit is disabled until `share anyway` is typed
- After typing the phrase, submit succeeds

- [ ] **Step 8: Verify the activity log entry**

```bash
psql "$DATABASE_URL" -c "SELECT action, metadata FROM activity_logs WHERE action='buyer_invite_with_outstanding' ORDER BY created_at DESC LIMIT 1;"
```

Expected: one row with `action='buyer_invite_with_outstanding'` and `metadata` containing `targetEmail` + `outstandingGroups: ["eighty_three_b"]`.

- [ ] **Step 9: Verify seller invite bypasses gate**

Reset item 8 again. Invite a `seller_rep` participant. Confirm: no modal, invite succeeds.

- [ ] **Step 10: Run the full vitest suite**

```bash
cd cis-deal-room && npx vitest run
```

Expected: all tests pass.

- [ ] **Step 11: Final commit**

```bash
cd cis-deal-room
git add docs/superpowers/plans/2026-05-05-the-playbook.md
git commit -m "docs(playbook): mark v1.3 plan as executed and verified"
```

---

## Self-review notes (filled out by plan author)

- **Spec coverage:** Every section of `docs/superpowers/specs/2026-05-05-the-playbook-design.md` is mapped:
  - §3 Architecture → Phase 1 (schema), Phase 2 (DAL)
  - §4 Components → Phase 4 (checklist UI), Phase 5 (DealOverview), Phase 6 (invite modal)
  - §5 Data flow → Phase 2 + 3 (DAL + API)
  - §6 Migration strategy → Phase 1
  - §7 Testing approach → tests live within each task; Phase 7 covers E2E
- **Placeholder scan:** No "TBD" / "TODO" / "fill in" / "similar to". Test sketches have explicit code; mock patterns reference the existing repo style.
- **Type consistency:** `ChecklistStatus` includes `blocked` from Task 2.6 onward; all later code references match. `PlaybookCategory` and `DealKillerGroup` types defined in Task 2.6 and consumed by Task 4 + 5 components.
- **Spec gap caught & added:** The spec's `category` enum constraint on custom items (§3 "Constrain category") is enforced server-side in Task 4.4 step 4.
- **Open questions from spec §8:** All resolved by this plan:
  - DAL shape → single read endpoint returning `{checklist, playbook}` (Task 3.1)
  - Buyer-invite modal shape → reuses `ParticipantFormModal` with second-step render (Task 6.1)
  - Relink-to-canonical for legacy items → out of scope; existing items remain custom

---

**Plan complete.**
