// Apply migration 0007_lowercase_user_emails directly via the working driver,
// because `npx drizzle-kit migrate` silently failed (websocket issue).
// Idempotent: collision check first, then narrow UPDATE.
import { neon } from '@neondatabase/serverless';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}
const sql = neon(process.env.DATABASE_URL);

console.log('=== 1. collision check ===');
const [{ collisions }] = await sql`
  SELECT count(*) - count(DISTINCT lower(email)) AS collisions FROM users
`;
console.log('case-collisions:', collisions);
if (Number(collisions) > 0) {
  console.error('ABORT: lowering would violate users.email unique constraint');
  process.exit(2);
}

console.log('\n=== 2. lowercase ===');
const updated = await sql`
  UPDATE users SET email = lower(email)
  WHERE email <> lower(email)
  RETURNING id, email
`;
console.log('rows updated:', updated.length, updated);

console.log('\n=== 3. verify ===');
console.log(
  'mixed-case remaining (expect []):',
  await sql`SELECT id, email FROM users WHERE email <> lower(email)`,
);

// Note: this bypasses drizzle's __drizzle_migrations bookkeeping. Next
// `drizzle-kit migrate` will retry 0007 — that's fine, the migration is
// idempotent (this same script logic) and will succeed as a no-op then
// drizzle will record it.
