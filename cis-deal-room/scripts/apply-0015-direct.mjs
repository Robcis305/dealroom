// scripts/apply-0015-direct.mjs
//
// Buy-side cleanup: removes canonical-overlay checklist_items rows on
// workspaces where cisAdvisorySide = 'buyer_side'. Custom items
// (playbook_item_id IS NULL) are preserved. Idempotent.
import { neon } from '@neondatabase/serverless';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}
const sql = neon(process.env.DATABASE_URL);

console.log('=== 1. count rows to delete ===');
const [{ count: before }] = await sql`
  SELECT count(*)::int AS count FROM checklist_items
  WHERE playbook_item_id IS NOT NULL
    AND checklist_id IN (
      SELECT c.id FROM checklists c
      JOIN workspaces w ON w.id = c.workspace_id
      WHERE w.cis_advisory_side = 'buyer_side'
    )
`;
console.log(`canonical-overlay rows on buy-side workspaces: ${before}`);

console.log('\n=== 2. DELETE canonical-overlay rows on buy-side workspaces ===');
const deleted = await sql`
  DELETE FROM checklist_items
  WHERE playbook_item_id IS NOT NULL
    AND checklist_id IN (
      SELECT c.id FROM checklists c
      JOIN workspaces w ON w.id = c.workspace_id
      WHERE w.cis_advisory_side = 'buyer_side'
    )
  RETURNING id
`;
console.log(`deleted ${deleted.length} rows`);

console.log('\n=== 3. verify ===');
const [{ count: after }] = await sql`
  SELECT count(*)::int AS count FROM checklist_items
  WHERE playbook_item_id IS NOT NULL
    AND checklist_id IN (
      SELECT c.id FROM checklists c
      JOIN workspaces w ON w.id = c.workspace_id
      WHERE w.cis_advisory_side = 'buyer_side'
    )
`;
console.log(`remaining canonical-overlay rows on buy-side workspaces: ${after}`);

if (after !== 0) {
  console.error('ERROR: cleanup did not complete; some rows remain');
  process.exit(1);
}
console.log('\nAll checks passed.');
