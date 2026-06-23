// scripts/apply-0018-direct.mjs
//
// Migration 0018: side-aware role backfill + retire view_only_shadow_side column.
// Idempotent: re-runnable safely.
import { neon } from '@neondatabase/serverless';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}
const sql = neon(process.env.DATABASE_URL);

// NOTE: ALTER TYPE ... ADD VALUE cannot run in the same transaction that uses the new value.
// Neon HTTP driver is autocommit per statement, so we run ADD VALUE statements first,
// then the UPDATEs that use the new enum values.

console.log('=== 1. extend participant_role enum ===');
await sql`ALTER TYPE "public"."participant_role" ADD VALUE IF NOT EXISTS 'client_counsel'`;
await sql`ALTER TYPE "public"."participant_role" ADD VALUE IF NOT EXISTS 'counterparty'`;
console.log('done');

console.log('\n=== 2. backfill seller_rep ===');
const sellerRepResult = await sql`
  UPDATE workspace_participants p
    SET role = (CASE WHEN w.cis_advisory_side = 'seller_side' THEN 'client' ELSE 'counterparty' END)::participant_role
    FROM workspaces w
    WHERE w.id = p.workspace_id AND p.role = 'seller_rep'
`;
console.log('seller_rep rows updated:', sellerRepResult.length ?? 0);

console.log('\n=== 3. backfill buyer_rep ===');
const buyerRepResult = await sql`
  UPDATE workspace_participants p
    SET role = (CASE WHEN w.cis_advisory_side = 'buyer_side' THEN 'client' ELSE 'counterparty' END)::participant_role
    FROM workspaces w
    WHERE w.id = p.workspace_id AND p.role = 'buyer_rep'
`;
console.log('buyer_rep rows updated:', buyerRepResult.length ?? 0);

console.log('\n=== 4. backfill seller_counsel ===');
const sellerCounselResult = await sql`
  UPDATE workspace_participants p
    SET role = (CASE WHEN w.cis_advisory_side = 'seller_side' THEN 'client_counsel' ELSE 'counterparty' END)::participant_role
    FROM workspaces w
    WHERE w.id = p.workspace_id AND p.role = 'seller_counsel'
`;
console.log('seller_counsel rows updated:', sellerCounselResult.length ?? 0);

console.log('\n=== 5. backfill buyer_counsel ===');
const buyerCounselResult = await sql`
  UPDATE workspace_participants p
    SET role = (CASE WHEN w.cis_advisory_side = 'buyer_side' THEN 'client_counsel' ELSE 'counterparty' END)::participant_role
    FROM workspaces w
    WHERE w.id = p.workspace_id AND p.role = 'buyer_counsel'
`;
console.log('buyer_counsel rows updated:', buyerCounselResult.length ?? 0);

console.log('\n=== 6. backfill deprecated counsel → view_only ===');
const counselResult = await sql`
  UPDATE workspace_participants SET role = 'view_only' WHERE role = 'counsel'
`;
console.log('counsel rows updated:', counselResult.length ?? 0);

console.log('\n=== 7. drop view_only_shadow_side column ===');
await sql`ALTER TABLE "public"."workspace_participants" DROP COLUMN IF EXISTS "view_only_shadow_side"`;
console.log('done');

console.log('\n=== verify ===');

// (a) Assert ZERO rows remain on deprecated roles.
const deprecated = await sql`
  SELECT count(*)::int AS cnt
  FROM workspace_participants
  WHERE role IN ('seller_rep', 'buyer_rep', 'seller_counsel', 'buyer_counsel', 'counsel')
`;
const deprecatedCount = deprecated[0].cnt;
console.log('deprecated-role row count (must be 0):', deprecatedCount);

// (b) Assert view_only_shadow_side column no longer exists.
const colCheck = await sql`
  SELECT column_name
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'workspace_participants'
    AND column_name = 'view_only_shadow_side'
`;
const columnExists = colCheck.length > 0;
console.log('view_only_shadow_side column still present (must be false):', columnExists);

// Per-new-role counts for visibility.
const roleCounts = await sql`
  SELECT role, count(*)::int AS cnt
  FROM workspace_participants
  WHERE role IN ('admin', 'cis_team', 'client', 'client_counsel', 'counterparty', 'view_only')
  GROUP BY role
  ORDER BY role
`;
console.log('\nPer-new-role participant counts:');
for (const row of roleCounts) {
  console.log(' ', row.role, ':', row.cnt);
}

// Check that enum values were actually added.
const roles = await sql`SELECT unnest(enum_range(NULL::participant_role)) AS v`;
const roleSet = new Set(roles.map((r) => r.v));
const clientCounselPresent = roleSet.has('client_counsel');
const counterpartyPresent = roleSet.has('counterparty');
console.log('\nclient_counsel in enum:', clientCounselPresent);
console.log('counterparty in enum:', counterpartyPresent);

if (
  deprecatedCount !== 0 ||
  columnExists ||
  !clientCounselPresent ||
  !counterpartyPresent
) {
  console.error('\nERROR: post-apply checks failed');
  process.exit(1);
}

console.log('\nAll checks passed.');
