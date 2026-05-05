// Apply migration 0008_playbook_enums directly via the working driver,
// because `npx drizzle-kit migrate` silently skips hand-written SQL migrations.
// Idempotent: ALTER TYPE uses IF NOT EXISTS; CREATE TYPE uses pg_type lookup.
import { neon } from '@neondatabase/serverless';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}
const sql = neon(process.env.DATABASE_URL);

// 1. Add 'blocked' to checklist_status enum
console.log('=== 1. ALTER TYPE checklist_status ADD VALUE blocked ===');
await sql`ALTER TYPE "public"."checklist_status" ADD VALUE IF NOT EXISTS 'blocked' BEFORE 'received'`;
console.log('done');

// 2. CREATE TYPE playbook_category (idempotent via pg_type check)
console.log('\n=== 2. CREATE TYPE playbook_category ===');
const [{ exists: pcExists }] = await sql`
  SELECT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'playbook_category' AND typnamespace = 'public'::regnamespace
  ) AS exists
`;
if (pcExists) {
  console.log('playbook_category already exists — skipping');
} else {
  await sql`
    CREATE TYPE "public"."playbook_category" AS ENUM(
      'corporate_legal',
      'financial',
      'commercial',
      'team_hr',
      'ip_technical',
      'operations_risk'
    )
  `;
  console.log('created');
}

// 3. CREATE TYPE deal_killer_group (idempotent via pg_type check)
console.log('\n=== 3. CREATE TYPE deal_killer_group ===');
const [{ exists: dkExists }] = await sql`
  SELECT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'deal_killer_group' AND typnamespace = 'public'::regnamespace
  ) AS exists
`;
if (dkExists) {
  console.log('deal_killer_group already exists — skipping');
} else {
  await sql`
    CREATE TYPE "public"."deal_killer_group" AS ENUM(
      'cap_table',
      'eighty_three_b',
      'customer_coc',
      'ip_assignment',
      'revenue_bridge'
    )
  `;
  console.log('created');
}

// 4. Verify
console.log('\n=== 4. verify ===');
const csValues = await sql`SELECT unnest(enum_range(NULL::"public"."checklist_status")) AS val`;
console.log('checklist_status:', csValues.map(r => r.val));

const pcValues = await sql`SELECT unnest(enum_range(NULL::"public"."playbook_category")) AS val`;
console.log('playbook_category:', pcValues.map(r => r.val));

const dkValues = await sql`SELECT unnest(enum_range(NULL::"public"."deal_killer_group")) AS val`;
console.log('deal_killer_group:', dkValues.map(r => r.val));
