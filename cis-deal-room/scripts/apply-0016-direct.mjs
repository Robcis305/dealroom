// scripts/apply-0016-direct.mjs
//
// Workstreams schema. Idempotent: re-runnable safely.
import { neon } from '@neondatabase/serverless';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}
const sql = neon(process.env.DATABASE_URL);

console.log('=== 1. extend activity_action enum ===');
await sql`ALTER TYPE "public"."activity_action" ADD VALUE IF NOT EXISTS 'workstream_member_added'`;
await sql`ALTER TYPE "public"."activity_action" ADD VALUE IF NOT EXISTS 'workstream_member_removed'`;
await sql`ALTER TYPE "public"."activity_action" ADD VALUE IF NOT EXISTS 'workstream_updated'`;
await sql`ALTER TYPE "public"."activity_action" ADD VALUE IF NOT EXISTS 'document_tagged'`;
await sql`ALTER TYPE "public"."activity_action" ADD VALUE IF NOT EXISTS 'document_untagged'`;
console.log('done');

console.log('\n=== 2. extend activity_target_type enum ===');
await sql`ALTER TYPE "public"."activity_target_type" ADD VALUE IF NOT EXISTS 'workstream'`;
console.log('done');

console.log('\n=== 3. CREATE TABLE workstreams ===');
const workstreamsExists = await sql`SELECT to_regclass('public.workstreams') AS t`;
if (workstreamsExists[0].t !== null) {
  console.log('already exists');
} else {
  await sql`
    CREATE TABLE "public"."workstreams" (
      "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "workspace_id" uuid NOT NULL REFERENCES "public"."workspaces"("id") ON DELETE CASCADE,
      "key"          text NOT NULL,
      "name"         text NOT NULL,
      "color"        text NOT NULL,
      "tile_tint"    text NOT NULL,
      "description"  text,
      "sort_order"   integer NOT NULL DEFAULT 0,
      "created_at"   timestamp NOT NULL DEFAULT now(),
      "updated_at"   timestamp NOT NULL DEFAULT now(),
      CONSTRAINT "workstreams_workspace_key_uq" UNIQUE ("workspace_id", "key")
    )
  `;
  console.log('created');
}
await sql`CREATE INDEX IF NOT EXISTS "workstreams_workspace_idx" ON "public"."workstreams" ("workspace_id")`;

console.log('\n=== 4. CREATE TABLE workstream_members ===');
const workstreamMembersExists = await sql`SELECT to_regclass('public.workstream_members') AS t`;
if (workstreamMembersExists[0].t !== null) {
  console.log('already exists');
} else {
  await sql`
    CREATE TABLE "public"."workstream_members" (
      "workstream_id"  uuid NOT NULL REFERENCES "public"."workstreams"("id") ON DELETE CASCADE,
      "participant_id" uuid NOT NULL REFERENCES "public"."workspace_participants"("id") ON DELETE CASCADE,
      "added_at"       timestamp NOT NULL DEFAULT now(),
      "added_by"       uuid NOT NULL REFERENCES "public"."users"("id"),
      PRIMARY KEY ("workstream_id", "participant_id")
    )
  `;
  console.log('created');
}
await sql`CREATE INDEX IF NOT EXISTS "workstream_members_workstream_idx" ON "public"."workstream_members" ("workstream_id")`;

console.log('\n=== 5. CREATE TABLE file_workstreams ===');
const fileWorkstreamsExists = await sql`SELECT to_regclass('public.file_workstreams') AS t`;
if (fileWorkstreamsExists[0].t !== null) {
  console.log('already exists');
} else {
  await sql`
    CREATE TABLE "public"."file_workstreams" (
      "file_id"       uuid NOT NULL REFERENCES "public"."files"("id") ON DELETE CASCADE,
      "workstream_id" uuid NOT NULL REFERENCES "public"."workstreams"("id") ON DELETE CASCADE,
      "tagged_at"     timestamp NOT NULL DEFAULT now(),
      "tagged_by"     uuid NOT NULL REFERENCES "public"."users"("id"),
      PRIMARY KEY ("file_id", "workstream_id")
    )
  `;
  console.log('created');
}
await sql`CREATE INDEX IF NOT EXISTS "file_workstreams_workstream_idx" ON "public"."file_workstreams" ("workstream_id")`;

console.log('\n=== verify ===');
const acts = await sql`SELECT unnest(enum_range(NULL::activity_action)) AS v`;
const actSet = new Set(acts.map((r) => r.v));
console.log('workstream_member_added present:', actSet.has('workstream_member_added'));
console.log('workstream_member_removed present:', actSet.has('workstream_member_removed'));
console.log('workstream_updated present:', actSet.has('workstream_updated'));
console.log('document_tagged present:', actSet.has('document_tagged'));
console.log('document_untagged present:', actSet.has('document_untagged'));

const targetTypes = await sql`SELECT unnest(enum_range(NULL::activity_target_type)) AS v`;
const targetSet = new Set(targetTypes.map((r) => r.v));
console.log('workstream target_type present:', targetSet.has('workstream'));

const colsWS = await sql`
  SELECT column_name FROM information_schema.columns
  WHERE table_schema='public' AND table_name='workstreams' ORDER BY ordinal_position
`;
const colsWSM = await sql`
  SELECT column_name FROM information_schema.columns
  WHERE table_schema='public' AND table_name='workstream_members' ORDER BY ordinal_position
`;
const colsFW = await sql`
  SELECT column_name FROM information_schema.columns
  WHERE table_schema='public' AND table_name='file_workstreams' ORDER BY ordinal_position
`;
console.log('workstreams columns:', colsWS.map((r) => r.column_name));
console.log('workstream_members columns:', colsWSM.map((r) => r.column_name));
console.log('file_workstreams columns:', colsFW.map((r) => r.column_name));

if (
  !actSet.has('workstream_member_added') ||
  !actSet.has('workstream_member_removed') ||
  !actSet.has('workstream_updated') ||
  !actSet.has('document_tagged') ||
  !actSet.has('document_untagged') ||
  !targetSet.has('workstream') ||
  colsWS.length < 10 ||
  colsWSM.length < 4 ||
  colsFW.length < 4
) {
  console.error('ERROR: post-apply checks failed');
  process.exit(1);
}
console.log('\nAll checks passed.');
