// scripts/apply-0019-direct.mjs
//
// Migration 0019: add onboarded_at column to workspace_participants + backfill existing rows.
// Idempotent: re-runnable safely.
import { neon } from '@neondatabase/serverless';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}
const sql = neon(process.env.DATABASE_URL);

console.log('=== 1. add onboarded_at column ===');
await sql`ALTER TABLE workspace_participants ADD COLUMN IF NOT EXISTS onboarded_at timestamp`;
console.log('done');

console.log('\n=== 2. backfill existing rows ===');
const res = await sql`UPDATE workspace_participants SET onboarded_at = coalesce(activated_at, now()) WHERE onboarded_at IS NULL`;
console.log('backfilled rows:', res.length ?? 'ok');

console.log('\n=== verify ===');
const [{ remaining }] = await sql`SELECT count(*)::int AS remaining FROM workspace_participants WHERE onboarded_at IS NULL`;
console.log('rows still null (must be 0):', remaining);
const [{ present }] = await sql`SELECT (to_regclass('workspace_participants') IS NOT NULL) AS present`;
if (remaining !== 0 || !present) { console.error('VERIFY FAILED'); process.exit(1); }
console.log('OK');
