// scripts/apply-0020-direct.mjs
//
// Migration 0020: add 'renamed_workspace' and 'qna_deleted' values to the
// activity_action enum (admin deal-room rename + admin Q&A delete).
// Idempotent: ADD VALUE IF NOT EXISTS is re-runnable safely.
//
// ALTER TYPE ... ADD VALUE cannot run inside a transaction block, so each
// statement is issued separately (neon's sql`` does not wrap in a tx).
import { neon } from '@neondatabase/serverless';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}
const sql = neon(process.env.DATABASE_URL);

console.log('=== add renamed_workspace ===');
await sql`ALTER TYPE "public"."activity_action" ADD VALUE IF NOT EXISTS 'renamed_workspace'`;
console.log('done');

console.log('\n=== add qna_deleted ===');
await sql`ALTER TYPE "public"."activity_action" ADD VALUE IF NOT EXISTS 'qna_deleted'`;
console.log('done');

console.log('\n=== verify ===');
const rows = await sql`
  SELECT enumlabel FROM pg_enum
  WHERE enumtypid = 'activity_action'::regtype
    AND enumlabel IN ('renamed_workspace', 'qna_deleted')
`;
const labels = rows.map((r) => r.enumlabel);
if (!labels.includes('renamed_workspace') || !labels.includes('qna_deleted')) {
  console.error('VERIFY FAILED — present:', labels);
  process.exit(1);
}
console.log('OK — present:', labels);
