// Read-only diagnostics for the Project Chronos / Cahyo invite-acceptance bug.
// Loads DATABASE_URL from .env.local and runs four SELECT queries.
import { readFileSync } from 'node:fs';
import { neon } from '@neondatabase/serverless';

const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
}

const sql = neon(process.env.DATABASE_URL);
const target = 'cahyo@mrscraper.com';

console.log('\n=== 1. users matching email (case-insensitive) ===');
console.log(
  await sql`SELECT id, email, first_name, last_name, created_at, updated_at
           FROM users WHERE lower(email) = ${target}`,
);

console.log('\n=== 2. participant rows for Project Chronos for this email ===');
console.log(
  await sql`SELECT wp.id AS participant_id, wp.user_id, wp.status,
                  wp.invited_at, wp.activated_at, wp.role,
                  u.email AS participant_user_email,
                  w.id   AS workspace_id,
                  w.name AS workspace_name
           FROM workspace_participants wp
           JOIN users      u ON u.id = wp.user_id
           JOIN workspaces w ON w.id = wp.workspace_id
           WHERE w.name = 'Project Chronos'
             AND lower(u.email) = ${target}`,
);

console.log('\n=== 3. sessions for this email ===');
console.log(
  await sql`SELECT s.id, s.user_id, s.last_active_at, s.created_at,
                  u.email AS session_user_email
           FROM sessions s
           JOIN users u ON u.id = s.user_id
           WHERE lower(u.email) = ${target}
           ORDER BY s.last_active_at DESC`,
);

console.log('\n=== 4. magic_link_tokens for this email ===');
console.log(
  await sql`SELECT email, purpose, expires_at, created_at, redirect_to
           FROM magic_link_tokens
           WHERE lower(email) = ${target}`,
);

console.log('\n=== 5. ALL participant rows for this email (any workspace) ===');
console.log(
  await sql`SELECT wp.id AS participant_id, wp.user_id, wp.status,
                  wp.invited_at, wp.activated_at, wp.role,
                  u.email AS participant_user_email,
                  w.name  AS workspace_name
           FROM workspace_participants wp
           JOIN users      u ON u.id = wp.user_id
           JOIN workspaces w ON w.id = wp.workspace_id
           WHERE lower(u.email) = ${target}`,
);
