// Post-deploy health check for the invite-acceptance fix shipped in PR #11.
// Read-only. Safe to run anytime.
import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL);

const fail = [];
const pass = [];

const [cahyo] = await sql`
  SELECT status FROM workspace_participants WHERE id='a8b56dcd-d032-4ca7-bfa7-079aa9d5468e'
`;
(cahyo?.status === 'active' ? pass : fail).push(`cahyo participant: ${cahyo?.status ?? 'missing'}`);

const [{ n: mixed }] = await sql`SELECT count(*)::int AS n FROM users WHERE email <> lower(email)`;
(mixed === 0 ? pass : fail).push(`mixed-case emails: ${mixed}`);

const stuck = await sql`
  SELECT u.email, wp.id, wp.invited_at, max(s.last_active_at) AS last_session
  FROM workspace_participants wp
  JOIN users u ON u.id = wp.user_id
  LEFT JOIN sessions s ON s.user_id = wp.user_id
  WHERE wp.status = 'invited'
  GROUP BY u.email, wp.id, wp.invited_at
  HAVING max(s.last_active_at) IS NOT NULL
     AND max(s.last_active_at) < now() - interval '1 hour'
`;
(stuck.length === 0 ? pass : fail).push(`stuck invited (auth'd >1h ago): ${stuck.length}${stuck.length ? ' ' + JSON.stringify(stuck) : ''}`);

const [{ n: migs }] = await sql`SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations`;
([7, 8].includes(migs) ? pass : fail).push(`drizzle migrations: ${migs}`);

console.log(`\nPASS (${pass.length})`);
for (const p of pass) console.log('  ✓', p);
if (fail.length) {
  console.log(`\nFAIL (${fail.length})`);
  for (const f of fail) console.log('  ✗', f);
  process.exit(1);
}
console.log('\nAll checks green.');
