// Find users where lower(email) collides with another row, and show
// everything attached to each so we can pick a keeper.
import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL);

console.log('=== Colliding user rows (same email when lowercased) ===');
const colliding = await sql`
  SELECT id, email, first_name, last_name, is_admin, created_at, updated_at
  FROM users
  WHERE lower(email) IN (
    SELECT lower(email) FROM users GROUP BY lower(email) HAVING count(*) > 1
  )
  ORDER BY lower(email), created_at
`;
console.log(colliding);

for (const u of colliding) {
  console.log(`\n--- user ${u.id} (${u.email}) ---`);
  console.log(
    'sessions:',
    await sql`SELECT id, last_active_at, created_at FROM sessions WHERE user_id = ${u.id} ORDER BY last_active_at DESC`,
  );
  console.log(
    'participant rows:',
    await sql`
      SELECT wp.id, wp.workspace_id, w.name AS workspace, wp.role, wp.status, wp.activated_at
      FROM workspace_participants wp
      JOIN workspaces w ON w.id = wp.workspace_id
      WHERE wp.user_id = ${u.id}
    `,
  );
  console.log(
    'workspaces created by:',
    await sql`SELECT id, name FROM workspaces WHERE created_by = ${u.id}`,
  );
  console.log(
    'activity rows authored:',
    await sql`SELECT count(*)::int AS n FROM activity_logs WHERE user_id = ${u.id}`,
  );
}
