// Apply migration 0009_playbook_items directly via the working driver,
// because `npx drizzle-kit migrate` silently skips hand-written SQL migrations.
// Idempotent: ALTER TYPE uses IF NOT EXISTS; CREATE TABLE/INDEX use existence guards.
import { neon } from '@neondatabase/serverless';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}
const sql = neon(process.env.DATABASE_URL);

// 1. Add 'playbook_item_blocked' to activity_action enum
console.log("=== 1. ALTER TYPE activity_action ADD VALUE 'playbook_item_blocked' ===");
await sql`ALTER TYPE "public"."activity_action" ADD VALUE IF NOT EXISTS 'playbook_item_blocked'`;
console.log('done');

// 2. Add 'buyer_invite_with_outstanding' to activity_action enum
console.log("\n=== 2. ALTER TYPE activity_action ADD VALUE 'buyer_invite_with_outstanding' ===");
await sql`ALTER TYPE "public"."activity_action" ADD VALUE IF NOT EXISTS 'buyer_invite_with_outstanding'`;
console.log('done');

// 3. CREATE TABLE playbook_items (idempotent via to_regclass check)
console.log('\n=== 3. CREATE TABLE playbook_items ===');
const [{ exists: tableExists }] = await sql`
  SELECT to_regclass('public.playbook_items') IS NOT NULL AS exists
`;
if (tableExists) {
  console.log('playbook_items already exists — skipping');
} else {
  await sql`
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
    )
  `;
  console.log('created');
}

// 4. CREATE INDEX playbook_items_category_sort_idx (IF NOT EXISTS is supported for indexes)
console.log('\n=== 4. CREATE INDEX playbook_items_category_sort_idx ===');
await sql`
  CREATE INDEX IF NOT EXISTS "playbook_items_category_sort_idx"
    ON "public"."playbook_items" ("category", "sort_order")
`;
console.log('done');

// 5. CREATE INDEX playbook_items_deal_killer_idx
console.log('\n=== 5. CREATE INDEX playbook_items_deal_killer_idx ===');
await sql`
  CREATE INDEX IF NOT EXISTS "playbook_items_deal_killer_idx"
    ON "public"."playbook_items" ("deal_killer_group")
    WHERE "deal_killer_group" IS NOT NULL
`;
console.log('done');

// 6. Verify
console.log('\n=== 6. verify ===');

const cols = await sql`
  SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'playbook_items'
  ORDER BY ordinal_position
`;
console.log('playbook_items columns:', cols.map(r => `${r.column_name} (${r.data_type}, nullable=${r.is_nullable})`));

const actions = await sql`SELECT unnest(enum_range(NULL::"public"."activity_action")) AS val`;
const actionVals = actions.map(r => r.val);
console.log('activity_action values:', actionVals);
const hasBlocked = actionVals.includes('playbook_item_blocked');
const hasOutstanding = actionVals.includes('buyer_invite_with_outstanding');
console.log(`  playbook_item_blocked present: ${hasBlocked}`);
console.log(`  buyer_invite_with_outstanding present: ${hasOutstanding}`);

const indexes = await sql`
  SELECT indexname FROM pg_indexes
  WHERE schemaname = 'public' AND tablename = 'playbook_items'
`;
console.log('playbook_items indexes:', indexes.map(r => r.indexname));

if (cols.length !== 9) {
  console.error(`ERROR: expected 9 columns, got ${cols.length}`);
  process.exit(1);
}
if (!hasBlocked || !hasOutstanding) {
  console.error('ERROR: one or both new enum values missing from activity_action');
  process.exit(1);
}
console.log('\nAll checks passed.');
