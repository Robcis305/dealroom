import { neon } from '@neondatabase/serverless';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}
const sql = neon(process.env.DATABASE_URL);

console.log('=== 1. ADD COLUMN files.deleted_at ===');
await sql`ALTER TABLE "public"."files" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp`;
console.log('done');

console.log('\n=== 2. CREATE INDEX files_deleted_at_idx ===');
await sql`
  CREATE INDEX IF NOT EXISTS "files_deleted_at_idx"
    ON "public"."files" ("deleted_at")
    WHERE "deleted_at" IS NOT NULL
`;
console.log('done');

console.log('\n=== 3. ALTER TYPE activity_action ADD VALUE restored ===');
await sql`ALTER TYPE "public"."activity_action" ADD VALUE IF NOT EXISTS 'restored'`;
console.log('done');

console.log('\n=== 4. verify ===');
const cols = await sql`
  SELECT column_name, is_nullable
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='files' AND column_name='deleted_at'
`;
console.log('deleted_at column:', cols);
const enums = await sql`SELECT unnest(enum_range(NULL::activity_action)) AS v`;
const hasRestored = enums.map((r) => r.v).includes('restored');
console.log('restored enum present:', hasRestored);
if (cols.length !== 1 || cols[0].is_nullable !== 'YES' || !hasRestored) {
  console.error('ERROR: post-apply checks failed');
  process.exit(1);
}
console.log('All checks passed.');
