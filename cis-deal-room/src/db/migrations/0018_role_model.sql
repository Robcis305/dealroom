-- Migration 0018: side-aware role backfill + retire view_only_shadow_side column.
-- Adds new participant_role enum values if not already present,
-- backfills deprecated roles using each workspace's cis_advisory_side,
-- then drops the now-unused view_only_shadow_side column.

ALTER TYPE "public"."participant_role" ADD VALUE IF NOT EXISTS 'client_counsel';
--> statement-breakpoint
ALTER TYPE "public"."participant_role" ADD VALUE IF NOT EXISTS 'counterparty';
--> statement-breakpoint

-- seller_rep: client when CIS advises seller, otherwise counterparty.
UPDATE workspace_participants p
  SET role = (CASE WHEN w.cis_advisory_side = 'seller_side' THEN 'client' ELSE 'counterparty' END)::participant_role
  FROM workspaces w
  WHERE w.id = p.workspace_id AND p.role = 'seller_rep';
--> statement-breakpoint

-- buyer_rep: client when CIS advises buyer, otherwise counterparty.
UPDATE workspace_participants p
  SET role = (CASE WHEN w.cis_advisory_side = 'buyer_side' THEN 'client' ELSE 'counterparty' END)::participant_role
  FROM workspaces w
  WHERE w.id = p.workspace_id AND p.role = 'buyer_rep';
--> statement-breakpoint

-- seller_counsel: client_counsel when CIS advises seller, otherwise counterparty.
UPDATE workspace_participants p
  SET role = (CASE WHEN w.cis_advisory_side = 'seller_side' THEN 'client_counsel' ELSE 'counterparty' END)::participant_role
  FROM workspaces w
  WHERE w.id = p.workspace_id AND p.role = 'seller_counsel';
--> statement-breakpoint

-- buyer_counsel: client_counsel when CIS advises buyer, otherwise counterparty.
UPDATE workspace_participants p
  SET role = (CASE WHEN w.cis_advisory_side = 'buyer_side' THEN 'client_counsel' ELSE 'counterparty' END)::participant_role
  FROM workspaces w
  WHERE w.id = p.workspace_id AND p.role = 'buyer_counsel';
--> statement-breakpoint

-- Deprecated generic counsel → view_only (least privilege).
UPDATE workspace_participants SET role = 'view_only' WHERE role = 'counsel';
--> statement-breakpoint

-- Retire the shadow-side column — no longer needed after role backfill.
ALTER TABLE "public"."workspace_participants" DROP COLUMN IF EXISTS "view_only_shadow_side";
