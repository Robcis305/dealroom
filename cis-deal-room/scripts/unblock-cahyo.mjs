// One-shot fix: flip Cahyo's pending participant row on Project Chronos to active.
// Idempotent (status='invited' guard). Logs before+after.
import { neon } from '@neondatabase/serverless';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}
const sql = neon(process.env.DATABASE_URL);
const participantId = 'a8b56dcd-d032-4ca7-bfa7-079aa9d5468e';

const before = await sql`SELECT id, status, activated_at FROM workspace_participants WHERE id = ${participantId}`;
console.log('Before:', before);

const updated = await sql`
  UPDATE workspace_participants
  SET status = 'active', activated_at = now()
  WHERE id = ${participantId} AND status = 'invited'
  RETURNING id, status, activated_at
`;
console.log('Updated rows:', updated);

const after = await sql`SELECT id, status, activated_at FROM workspace_participants WHERE id = ${participantId}`;
console.log('After:', after);
