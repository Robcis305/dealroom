// 1) Verify migration 0007 actually applied.
// 2) Show any users.email rows still mixed-case.
// 3) Idempotently flip Cahyo's stuck participant row to active.
// 4) Confirm final state.
import { neon } from '@neondatabase/serverless';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}
const sql = neon(process.env.DATABASE_URL);
const cahyoParticipantId = 'a8b56dcd-d032-4ca7-bfa7-079aa9d5468e';

console.log('=== drizzle journal entry for 0007 ===');
const journal = await sql`
  SELECT hash, created_at FROM drizzle.__drizzle_migrations
  WHERE hash LIKE '%lowercase_user_emails%' OR hash LIKE '%0007%'
`;
if (journal.length === 0) {
  // The hash column stores a content hash, not the tag. Fall back to count + recency.
  const recent = await sql`
    SELECT count(*)::int AS n,
           max(created_at)  AS most_recent
    FROM drizzle.__drizzle_migrations
  `;
  console.log('No tag match. Total migrations applied:', recent);
} else {
  console.log(journal);
}

console.log('\n=== users.email rows still mixed-case (expect []) ===');
console.log(await sql`SELECT id, email FROM users WHERE email <> lower(email)`);

console.log('\n=== before: Cahyo participant ===');
console.log(
  await sql`SELECT id, status, activated_at FROM workspace_participants WHERE id = ${cahyoParticipantId}`,
);

console.log('\n=== running idempotent unblock ===');
const updated = await sql`
  UPDATE workspace_participants
  SET status = 'active', activated_at = now()
  WHERE id = ${cahyoParticipantId} AND status = 'invited'
  RETURNING id, status, activated_at
`;
console.log('Rows updated:', updated.length, updated);

console.log('\n=== after: Cahyo participant ===');
console.log(
  await sql`SELECT id, status, activated_at FROM workspace_participants WHERE id = ${cahyoParticipantId}`,
);
