-- Add 'blocked' status to existing checklist_status enum.
ALTER TYPE "public"."checklist_status" ADD VALUE IF NOT EXISTS 'blocked' BEFORE 'received';
--> statement-breakpoint

-- Six canonical playbook categories (replaces free-text use over time).
CREATE TYPE "public"."playbook_category" AS ENUM(
  'corporate_legal',
  'financial',
  'commercial',
  'team_hr',
  'ip_technical',
  'operations_risk'
);
--> statement-breakpoint

-- Five deal-killer groups (NULL on non-killer playbook items).
CREATE TYPE "public"."deal_killer_group" AS ENUM(
  'cap_table',
  'eighty_three_b',
  'customer_coc',
  'ip_assignment',
  'revenue_bridge'
);
