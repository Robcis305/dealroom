// Resolve the levin.rob@gmail.com case-collision:
//   keeper  = f6817187-a757-4241-a1f1-3e2ba3cd34f1 (lowercase, has activity)
//   ghost   = 5811ec9b-c22a-4d4e-b529-6baa486e4f80 (mixed-case, has the real name)
// 1. FK pre-check: enumerate every column in the schema that references
//    users.id and fail loudly if anything points to ghost.
// 2. Copy first_name/last_name from ghost to keeper (real name override).
// 3. Delete ghost.
// 4. Apply the 0007 lowercase UPDATE (idempotent).
// All inside one transaction.
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);
const KEEPER = 'f6817187-a757-4241-a1f1-3e2ba3cd34f1';
const GHOST = '5811ec9b-c22a-4d4e-b529-6baa486e4f80';

console.log('=== 1. Discover all columns FK-referencing users.id ===');
const refs = await sql`
  SELECT
    tc.table_schema,
    tc.table_name,
    kcu.column_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
   AND tc.table_schema    = kcu.table_schema
  JOIN information_schema.constraint_column_usage ccu
    ON tc.constraint_name = ccu.constraint_name
   AND tc.table_schema    = ccu.table_schema
  WHERE tc.constraint_type = 'FOREIGN KEY'
    AND ccu.table_schema   = 'public'
    AND ccu.table_name     = 'users'
    AND ccu.column_name    = 'id'
  ORDER BY tc.table_name, kcu.column_name
`;
console.log('FK columns referencing users.id:', refs);

console.log('\n=== 2. Count rows pointing to ghost across every reference ===');
let totalGhostRefs = 0;
for (const r of refs) {
  const q = `SELECT count(*)::int AS n FROM "${r.table_schema}"."${r.table_name}" WHERE "${r.column_name}" = $1`;
  const [{ n }] = await sql.query(q, [GHOST]);
  console.log(`  ${r.table_name}.${r.column_name}: ${n}`);
  totalGhostRefs += Number(n);
}
console.log('TOTAL ghost references:', totalGhostRefs);
if (totalGhostRefs > 0) {
  console.error('ABORT: ghost still has data attached — manual review needed.');
  process.exit(2);
}

console.log('\n=== 3. Pre-state ===');
console.log(
  'keeper before:',
  await sql`SELECT id, email, first_name, last_name FROM users WHERE id = ${KEEPER}`,
);
console.log(
  'ghost before:',
  await sql`SELECT id, email, first_name, last_name FROM users WHERE id = ${GHOST}`,
);

console.log('\n=== 4. Apply: copy name from ghost → keeper, delete ghost, lowercase remaining ===');
// Postgres doesn't support multi-statement transactions over neon-http directly
// in @neondatabase/serverless, so we use the transaction() helper.
const txResult = await sql.transaction([
  sql`UPDATE users SET first_name = (SELECT first_name FROM users WHERE id = ${GHOST}),
                       last_name  = (SELECT last_name  FROM users WHERE id = ${GHOST}),
                       updated_at = now()
       WHERE id = ${KEEPER}`,
  sql`DELETE FROM users WHERE id = ${GHOST}`,
  sql`UPDATE users SET email = lower(email) WHERE email <> lower(email)`,
]);
console.log('tx result rowcounts:', txResult.map((r) => r.length ?? r));

console.log('\n=== 5. Post-state ===');
console.log(
  'keeper after:',
  await sql`SELECT id, email, first_name, last_name FROM users WHERE id = ${KEEPER}`,
);
console.log(
  'ghost after (expect []):',
  await sql`SELECT id, email FROM users WHERE id = ${GHOST}`,
);
console.log(
  'mixed-case remaining (expect []):',
  await sql`SELECT id, email FROM users WHERE email <> lower(email)`,
);
