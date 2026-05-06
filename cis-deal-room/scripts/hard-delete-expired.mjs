// scripts/hard-delete-expired.mjs
//
// SKELETON / TODO. Not wired to a cron yet.
//
// When wired up, this script:
//   1. Finds files where deleted_at < now() - INTERVAL '30 days'
//   2. Deletes the S3 object for each (DeleteObjectCommand)
//   3. Hard-deletes the row from `files`
//   4. Logs an admin-side note (no per-file activity log — those rows
//      reference the file id which won't exist anymore)
//
// Run: DATABASE_URL=... AWS_*=... node scripts/hard-delete-expired.mjs [--dry-run]

import { neon } from '@neondatabase/serverless';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);
const dryRun = process.argv.includes('--dry-run');

const expired = await sql`
  SELECT id, name, s3_key
  FROM files
  WHERE deleted_at IS NOT NULL
    AND deleted_at < now() - INTERVAL '30 days'
`;

console.log(`Found ${expired.length} expired soft-deleted files`);
if (dryRun || expired.length === 0) {
  console.log(dryRun ? '[dry-run] no changes' : 'nothing to do');
  process.exit(0);
}

console.log('TODO: wire S3 DeleteObjectCommand + DB DELETE here');
console.log('Expired ids:', expired.map((r) => r.id));
process.exit(0);
