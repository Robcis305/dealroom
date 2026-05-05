import { neon } from '@neondatabase/serverless';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}
const sql = neon(process.env.DATABASE_URL);

console.log('=== ALTER TYPE activity_action ADD VALUE file_moved ===');
await sql`ALTER TYPE "public"."activity_action" ADD VALUE IF NOT EXISTS 'file_moved'`;
console.log('done');

console.log('\n=== verify ===');
const values = await sql`SELECT unnest(enum_range(NULL::activity_action)) AS v`;
const present = values.map((r) => r.v).includes('file_moved');
console.log('file_moved present:', present);
if (!present) {
  console.error('ERROR: file_moved missing after apply');
  process.exit(1);
}
console.log('All checks passed.');
