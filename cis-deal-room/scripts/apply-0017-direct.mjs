// scripts/apply-0017-direct.mjs
//
// Q&A schema. Idempotent: re-runnable safely.
import { neon } from '@neondatabase/serverless';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}
const sql = neon(process.env.DATABASE_URL);

// Helper: check if a pg type exists in public schema.
async function typeExists(typeName) {
  const rows = await sql`
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = ${typeName}
  `;
  return rows.length > 0;
}

console.log('=== 1. CREATE TYPE qna_status ===');
if (await typeExists('qna_status')) {
  console.log('already exists');
} else {
  await sql`CREATE TYPE "public"."qna_status" AS ENUM ('new', 'assigned', 'answered', 'approved')`;
  console.log('created');
}

console.log('\n=== 2. CREATE TYPE qna_visibility ===');
if (await typeExists('qna_visibility')) {
  console.log('already exists');
} else {
  await sql`CREATE TYPE "public"."qna_visibility" AS ENUM ('public', 'private')`;
  console.log('created');
}

console.log('\n=== 3. CREATE TYPE qna_message_kind ===');
if (await typeExists('qna_message_kind')) {
  console.log('already exists');
} else {
  await sql`CREATE TYPE "public"."qna_message_kind" AS ENUM ('message', 'proposed_answer')`;
  console.log('created');
}

console.log('\n=== 4. extend activity_action enum ===');
await sql`ALTER TYPE "public"."activity_action" ADD VALUE IF NOT EXISTS 'qna_asked'`;
await sql`ALTER TYPE "public"."activity_action" ADD VALUE IF NOT EXISTS 'qna_assigned'`;
await sql`ALTER TYPE "public"."activity_action" ADD VALUE IF NOT EXISTS 'qna_answered'`;
await sql`ALTER TYPE "public"."activity_action" ADD VALUE IF NOT EXISTS 'qna_approved'`;
await sql`ALTER TYPE "public"."activity_action" ADD VALUE IF NOT EXISTS 'qna_changes_requested'`;
await sql`ALTER TYPE "public"."activity_action" ADD VALUE IF NOT EXISTS 'qna_rerouted'`;
await sql`ALTER TYPE "public"."activity_action" ADD VALUE IF NOT EXISTS 'qna_message_posted'`;
console.log('done');

console.log('\n=== 5. extend activity_target_type enum ===');
await sql`ALTER TYPE "public"."activity_target_type" ADD VALUE IF NOT EXISTS 'qna_question'`;
console.log('done');

console.log('\n=== 6. CREATE TABLE qna_questions ===');
const qnaQuestionsExists = await sql`SELECT to_regclass('public.qna_questions') AS t`;
if (qnaQuestionsExists[0].t !== null) {
  console.log('already exists');
} else {
  await sql`
    CREATE TABLE "public"."qna_questions" (
      "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "workspace_id"   uuid NOT NULL REFERENCES "public"."workspaces"("id") ON DELETE CASCADE,
      "title"          text NOT NULL,
      "status"         "public"."qna_status" NOT NULL DEFAULT 'new',
      "asked_by_id"    uuid NOT NULL REFERENCES "public"."users"("id"),
      "assignee_id"    uuid REFERENCES "public"."users"("id"),
      "asked_at"       timestamp NOT NULL DEFAULT now(),
      "requested_by"   date,
      "visibility"     "public"."qna_visibility" NOT NULL DEFAULT 'public',
      "linked_doc_id"  uuid REFERENCES "public"."files"("id") ON DELETE SET NULL,
      "created_at"     timestamp NOT NULL DEFAULT now(),
      "updated_at"     timestamp NOT NULL DEFAULT now()
    )
  `;
  console.log('created');
}
await sql`CREATE INDEX IF NOT EXISTS "qna_questions_workspace_idx" ON "public"."qna_questions" ("workspace_id")`;

console.log('\n=== 7. CREATE TABLE qna_question_workstreams ===');
const qnaQWSExists = await sql`SELECT to_regclass('public.qna_question_workstreams') AS t`;
if (qnaQWSExists[0].t !== null) {
  console.log('already exists');
} else {
  await sql`
    CREATE TABLE "public"."qna_question_workstreams" (
      "question_id"    uuid NOT NULL REFERENCES "public"."qna_questions"("id") ON DELETE CASCADE,
      "workstream_id"  uuid NOT NULL REFERENCES "public"."workstreams"("id") ON DELETE CASCADE,
      PRIMARY KEY ("question_id", "workstream_id")
    )
  `;
  console.log('created');
}
await sql`CREATE INDEX IF NOT EXISTS "qna_qws_workstream_idx" ON "public"."qna_question_workstreams" ("workstream_id")`;

console.log('\n=== 8. CREATE TABLE qna_messages ===');
const qnaMessagesExists = await sql`SELECT to_regclass('public.qna_messages') AS t`;
if (qnaMessagesExists[0].t !== null) {
  console.log('already exists');
} else {
  await sql`
    CREATE TABLE "public"."qna_messages" (
      "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "question_id"  uuid NOT NULL REFERENCES "public"."qna_questions"("id") ON DELETE CASCADE,
      "author_id"    uuid NOT NULL REFERENCES "public"."users"("id"),
      "kind"         "public"."qna_message_kind" NOT NULL DEFAULT 'message',
      "body"         text NOT NULL,
      "created_at"   timestamp NOT NULL DEFAULT now()
    )
  `;
  console.log('created');
}
await sql`CREATE INDEX IF NOT EXISTS "qna_messages_question_idx" ON "public"."qna_messages" ("question_id", "created_at")`;

console.log('\n=== 9. CREATE TABLE qna_message_files ===');
const qnaMFExists = await sql`SELECT to_regclass('public.qna_message_files') AS t`;
if (qnaMFExists[0].t !== null) {
  console.log('already exists');
} else {
  await sql`
    CREATE TABLE "public"."qna_message_files" (
      "message_id"  uuid NOT NULL REFERENCES "public"."qna_messages"("id") ON DELETE CASCADE,
      "file_id"     uuid NOT NULL REFERENCES "public"."files"("id") ON DELETE CASCADE,
      PRIMARY KEY ("message_id", "file_id")
    )
  `;
  console.log('created');
}

console.log('\n=== 10. CREATE TABLE qna_recipients ===');
const qnaRecipientsExists = await sql`SELECT to_regclass('public.qna_recipients') AS t`;
if (qnaRecipientsExists[0].t !== null) {
  console.log('already exists');
} else {
  await sql`
    CREATE TABLE "public"."qna_recipients" (
      "question_id"    uuid NOT NULL REFERENCES "public"."qna_questions"("id") ON DELETE CASCADE,
      "participant_id" uuid NOT NULL REFERENCES "public"."workspace_participants"("id") ON DELETE CASCADE,
      PRIMARY KEY ("question_id", "participant_id")
    )
  `;
  console.log('created');
}

console.log('\n=== verify ===');
const acts = await sql`SELECT unnest(enum_range(NULL::activity_action)) AS v`;
const actSet = new Set(acts.map((r) => r.v));
console.log('qna_asked present:', actSet.has('qna_asked'));
console.log('qna_assigned present:', actSet.has('qna_assigned'));
console.log('qna_answered present:', actSet.has('qna_answered'));
console.log('qna_approved present:', actSet.has('qna_approved'));
console.log('qna_changes_requested present:', actSet.has('qna_changes_requested'));
console.log('qna_rerouted present:', actSet.has('qna_rerouted'));
console.log('qna_message_posted present:', actSet.has('qna_message_posted'));

const targetTypes = await sql`SELECT unnest(enum_range(NULL::activity_target_type)) AS v`;
const targetSet = new Set(targetTypes.map((r) => r.v));
console.log('qna_question target_type present:', targetSet.has('qna_question'));

const enumTypes = await sql`
  SELECT t.typname FROM pg_type t
  JOIN pg_namespace n ON n.oid = t.typnamespace
  WHERE n.nspname = 'public' AND t.typname IN ('qna_status', 'qna_visibility', 'qna_message_kind')
`;
const enumSet = new Set(enumTypes.map((r) => r.typname));
console.log('qna_status enum present:', enumSet.has('qna_status'));
console.log('qna_visibility enum present:', enumSet.has('qna_visibility'));
console.log('qna_message_kind enum present:', enumSet.has('qna_message_kind'));

const colsQ = await sql`
  SELECT column_name FROM information_schema.columns
  WHERE table_schema='public' AND table_name='qna_questions' ORDER BY ordinal_position
`;
const colsQWS = await sql`
  SELECT column_name FROM information_schema.columns
  WHERE table_schema='public' AND table_name='qna_question_workstreams' ORDER BY ordinal_position
`;
const colsM = await sql`
  SELECT column_name FROM information_schema.columns
  WHERE table_schema='public' AND table_name='qna_messages' ORDER BY ordinal_position
`;
const colsMF = await sql`
  SELECT column_name FROM information_schema.columns
  WHERE table_schema='public' AND table_name='qna_message_files' ORDER BY ordinal_position
`;
const colsR = await sql`
  SELECT column_name FROM information_schema.columns
  WHERE table_schema='public' AND table_name='qna_recipients' ORDER BY ordinal_position
`;
console.log('qna_questions columns:', colsQ.map((r) => r.column_name));
console.log('qna_question_workstreams columns:', colsQWS.map((r) => r.column_name));
console.log('qna_messages columns:', colsM.map((r) => r.column_name));
console.log('qna_message_files columns:', colsMF.map((r) => r.column_name));
console.log('qna_recipients columns:', colsR.map((r) => r.column_name));

if (
  !actSet.has('qna_asked') ||
  !actSet.has('qna_assigned') ||
  !actSet.has('qna_answered') ||
  !actSet.has('qna_approved') ||
  !actSet.has('qna_changes_requested') ||
  !actSet.has('qna_rerouted') ||
  !actSet.has('qna_message_posted') ||
  !targetSet.has('qna_question') ||
  !enumSet.has('qna_status') ||
  !enumSet.has('qna_visibility') ||
  !enumSet.has('qna_message_kind') ||
  colsQ.length < 12 ||
  colsQWS.length < 2 ||
  colsM.length < 6 ||
  colsMF.length < 2 ||
  colsR.length < 2
) {
  console.error('ERROR: post-apply checks failed');
  process.exit(1);
}
console.log('\nAll checks passed.');
