// scripts/apply-0014-direct.mjs
//
// Cap table feature schema. Idempotent: re-runnable safely.
import { neon } from '@neondatabase/serverless';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}
const sql = neon(process.env.DATABASE_URL);

async function typeExists(typname) {
  const [{ exists }] = await sql`
    SELECT EXISTS (
      SELECT 1 FROM pg_type
      WHERE typname = ${typname} AND typnamespace = 'public'::regnamespace
    ) AS exists
  `;
  return exists;
}

console.log('=== 1. CREATE TYPE cap_table_status ===');
if (await typeExists('cap_table_status')) {
  console.log('already exists');
} else {
  await sql`CREATE TYPE "public"."cap_table_status" AS ENUM('draft', 'published')`;
  console.log('created');
}

console.log('\n=== 2. CREATE TYPE cap_table_instrument ===');
if (await typeExists('cap_table_instrument')) {
  console.log('already exists');
} else {
  await sql`
    CREATE TYPE "public"."cap_table_instrument" AS ENUM(
      'common', 'preferred', 'option', 'rsu', 'safe', 'convertible_note', 'warrant'
    )
  `;
  console.log('created');
}

console.log('\n=== 3. extend activity_action enum ===');
await sql`ALTER TYPE "public"."activity_action" ADD VALUE IF NOT EXISTS 'cap_table_uploaded'`;
await sql`ALTER TYPE "public"."activity_action" ADD VALUE IF NOT EXISTS 'cap_table_published'`;
await sql`ALTER TYPE "public"."activity_action" ADD VALUE IF NOT EXISTS 'cap_table_unpublished'`;
console.log('done');

console.log('\n=== 4. CREATE TABLE cap_tables ===');
const capTablesExists = await sql`SELECT to_regclass('public.cap_tables') AS t`;
if (capTablesExists[0].t !== null) {
  console.log('already exists');
} else {
  await sql`
    CREATE TABLE "public"."cap_tables" (
      "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "workspace_id"    uuid NOT NULL UNIQUE REFERENCES "public"."workspaces"("id") ON DELETE CASCADE,
      "file_id"         uuid NOT NULL REFERENCES "public"."files"("id") ON DELETE RESTRICT,
      "status"          "public"."cap_table_status" NOT NULL DEFAULT 'draft',
      "uploaded_by"     uuid NOT NULL REFERENCES "public"."users"("id"),
      "uploaded_at"     timestamp NOT NULL DEFAULT now(),
      "published_at"    timestamp,
      "published_by"    uuid REFERENCES "public"."users"("id"),
      "parse_warnings"  jsonb NOT NULL DEFAULT '[]'::jsonb,
      "created_at"      timestamp NOT NULL DEFAULT now(),
      "updated_at"      timestamp NOT NULL DEFAULT now()
    )
  `;
  console.log('created');
}
await sql`CREATE INDEX IF NOT EXISTS "cap_tables_workspace_idx" ON "public"."cap_tables" ("workspace_id")`;

console.log('\n=== 5. CREATE TABLE cap_table_rows ===');
const capTableRowsExists = await sql`SELECT to_regclass('public.cap_table_rows') AS t`;
if (capTableRowsExists[0].t !== null) {
  console.log('already exists');
} else {
  await sql`
    CREATE TABLE "public"."cap_table_rows" (
      "id"                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "cap_table_id"       uuid NOT NULL REFERENCES "public"."cap_tables"("id") ON DELETE CASCADE,
      "row_number"         integer NOT NULL,
      "holder"             text NOT NULL,
      "class"              text NOT NULL,
      "instrument"         "public"."cap_table_instrument" NOT NULL,
      "shares"             bigint NOT NULL,
      "ownership_percent"  numeric(7,4) NOT NULL,
      "price_per_share"    numeric(20,8) NOT NULL,
      "amount_invested"    numeric(20,2) NOT NULL,
      "round"              text,
      "round_valuation"    numeric(20,2),
      "vesting_start"      date,
      "vesting_schedule"   text,
      "certificate_number" text,
      "notes"              text,
      "created_at"         timestamp NOT NULL DEFAULT now()
    )
  `;
  console.log('created');
}
await sql`CREATE INDEX IF NOT EXISTS "cap_table_rows_cap_table_idx" ON "public"."cap_table_rows" ("cap_table_id", "row_number")`;
await sql`CREATE INDEX IF NOT EXISTS "cap_table_rows_instrument_idx" ON "public"."cap_table_rows" ("cap_table_id", "instrument")`;

console.log('\n=== 6. verify ===');
const capStatus = await sql`SELECT unnest(enum_range(NULL::cap_table_status)) AS v`;
const capInst = await sql`SELECT unnest(enum_range(NULL::cap_table_instrument)) AS v`;
const acts = await sql`SELECT unnest(enum_range(NULL::activity_action)) AS v`;
const actSet = new Set(acts.map((r) => r.v));
console.log('cap_table_status:', capStatus.map((r) => r.v));
console.log('cap_table_instrument:', capInst.map((r) => r.v));
console.log('cap_table_uploaded present:', actSet.has('cap_table_uploaded'));
console.log('cap_table_published present:', actSet.has('cap_table_published'));
console.log('cap_table_unpublished present:', actSet.has('cap_table_unpublished'));

const colsCT = await sql`
  SELECT column_name FROM information_schema.columns
  WHERE table_schema='public' AND table_name='cap_tables' ORDER BY ordinal_position
`;
const colsCTR = await sql`
  SELECT column_name FROM information_schema.columns
  WHERE table_schema='public' AND table_name='cap_table_rows' ORDER BY ordinal_position
`;
console.log('cap_tables columns:', colsCT.map((r) => r.column_name));
console.log('cap_table_rows columns:', colsCTR.map((r) => r.column_name));

if (
  capStatus.length !== 2 ||
  capInst.length !== 7 ||
  !actSet.has('cap_table_uploaded') ||
  !actSet.has('cap_table_published') ||
  !actSet.has('cap_table_unpublished') ||
  colsCT.length < 11 ||
  colsCTR.length < 16
) {
  console.error('ERROR: post-apply checks failed');
  process.exit(1);
}
console.log('\nAll checks passed.');
