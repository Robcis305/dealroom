// Apply migration 0010_checklist_items_playbook_link directly via the working driver,
// because `npx drizzle-kit migrate` silently skips hand-written SQL migrations.
// Idempotent: ADD COLUMN IF NOT EXISTS; ALTER COLUMN DROP NOT NULL is a no-op if already nullable;
// CREATE INDEX IF NOT EXISTS.
import { neon } from '@neondatabase/serverless';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}
const sql = neon(process.env.DATABASE_URL);

// 1. ADD COLUMN playbook_item_id (nullable FK to playbook_items)
console.log('=== 1. ADD COLUMN checklist_items.playbook_item_id ===');
await sql`
  ALTER TABLE "public"."checklist_items"
    ADD COLUMN IF NOT EXISTS "playbook_item_id" uuid
      REFERENCES "public"."playbook_items"("id") ON DELETE RESTRICT
`;
console.log('done');

// 2. ALTER COLUMN folder_id DROP NOT NULL (idempotent — no-op if already nullable)
console.log('\n=== 2. ALTER COLUMN checklist_items.folder_id DROP NOT NULL ===');
await sql`
  ALTER TABLE "public"."checklist_items"
    ALTER COLUMN "folder_id" DROP NOT NULL
`;
console.log('done');

// 3. CREATE UNIQUE INDEX checklist_items_unique_playbook_idx
console.log('\n=== 3. CREATE UNIQUE INDEX checklist_items_unique_playbook_idx ===');
await sql`
  CREATE UNIQUE INDEX IF NOT EXISTS "checklist_items_unique_playbook_idx"
    ON "public"."checklist_items" ("checklist_id", "playbook_item_id")
    WHERE "playbook_item_id" IS NOT NULL
`;
console.log('done');

// 4. CREATE INDEX checklist_items_playbook_idx
console.log('\n=== 4. CREATE INDEX checklist_items_playbook_idx ===');
await sql`
  CREATE INDEX IF NOT EXISTS "checklist_items_playbook_idx"
    ON "public"."checklist_items" ("playbook_item_id")
    WHERE "playbook_item_id" IS NOT NULL
`;
console.log('done');

// 5. Verify
console.log('\n=== 5. verify ===');

// 5a. Check playbook_item_id column exists and is nullable
const cols = await sql`
  SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'checklist_items'
  ORDER BY ordinal_position
`;
console.log('checklist_items columns:');
for (const c of cols) {
  console.log(`  ${c.column_name} (${c.data_type}, nullable=${c.is_nullable})`);
}

const playbookItemIdCol = cols.find(c => c.column_name === 'playbook_item_id');
const folderIdCol = cols.find(c => c.column_name === 'folder_id');

if (!playbookItemIdCol) {
  console.error('ERROR: playbook_item_id column not found');
  process.exit(1);
}
if (playbookItemIdCol.is_nullable !== 'YES') {
  console.error(`ERROR: playbook_item_id should be nullable, got is_nullable=${playbookItemIdCol.is_nullable}`);
  process.exit(1);
}
console.log('  playbook_item_id: exists, nullable=YES ✓');

if (!folderIdCol) {
  console.error('ERROR: folder_id column not found');
  process.exit(1);
}
if (folderIdCol.is_nullable !== 'YES') {
  console.error(`ERROR: folder_id should be nullable, got is_nullable=${folderIdCol.is_nullable}`);
  process.exit(1);
}
console.log('  folder_id: exists, nullable=YES ✓');

// 5b. Check indexes
const indexes = await sql`
  SELECT indexname FROM pg_indexes
  WHERE schemaname = 'public' AND tablename = 'checklist_items'
  ORDER BY indexname
`;
console.log('\nchecklist_items indexes:', indexes.map(r => r.indexname));

const hasUniquePlaybookIdx = indexes.some(r => r.indexname === 'checklist_items_unique_playbook_idx');
const hasPlaybookIdx = indexes.some(r => r.indexname === 'checklist_items_playbook_idx');

if (!hasUniquePlaybookIdx) {
  console.error('ERROR: checklist_items_unique_playbook_idx not found');
  process.exit(1);
}
console.log('  checklist_items_unique_playbook_idx: exists ✓');

if (!hasPlaybookIdx) {
  console.error('ERROR: checklist_items_playbook_idx not found');
  process.exit(1);
}
console.log('  checklist_items_playbook_idx: exists ✓');

// 5c. Check FK constraint on playbook_item_id references playbook_items.id with ON DELETE RESTRICT
const fkCheck = await sql`
  SELECT
    tc.constraint_name,
    ccu.table_name AS foreign_table,
    ccu.column_name AS foreign_column,
    rc.delete_rule
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
  JOIN information_schema.constraint_column_usage ccu
    ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
  JOIN information_schema.referential_constraints rc
    ON tc.constraint_name = rc.constraint_name AND tc.table_schema = rc.constraint_schema
  WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_schema = 'public'
    AND tc.table_name = 'checklist_items'
    AND kcu.column_name = 'playbook_item_id'
`;

if (fkCheck.length === 0) {
  console.error('ERROR: FK constraint on playbook_item_id not found');
  process.exit(1);
}
const fk = fkCheck[0];
if (fk.foreign_table !== 'playbook_items' || fk.foreign_column !== 'id' || fk.delete_rule !== 'RESTRICT') {
  console.error(`ERROR: FK mismatch: foreign_table=${fk.foreign_table}, foreign_column=${fk.foreign_column}, delete_rule=${fk.delete_rule}`);
  process.exit(1);
}
console.log(`\n  FK on playbook_item_id -> playbook_items.id ON DELETE RESTRICT ✓`);

console.log('\nAll checks passed.');
