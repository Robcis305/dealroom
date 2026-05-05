-- Two new activity actions:
--   * playbook_item_blocked      — when an item transitions to status='blocked'
--   * buyer_invite_with_outstanding — when a buyer-side participant is invited
--                                     while deal-killer items are outstanding
ALTER TYPE "public"."activity_action" ADD VALUE IF NOT EXISTS 'playbook_item_blocked';
--> statement-breakpoint
ALTER TYPE "public"."activity_action" ADD VALUE IF NOT EXISTS 'buyer_invite_with_outstanding';
--> statement-breakpoint

-- Canonical 48-item playbook. One row per playbook item, shared across all
-- workspaces. Per-deal state lives in checklist_items via playbook_item_id FK.
CREATE TABLE "public"."playbook_items" (
  "id"                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "number"            integer NOT NULL UNIQUE,
  "category"          "public"."playbook_category" NOT NULL,
  "name"              text NOT NULL,
  "rationale"         text NOT NULL,
  "deal_killer_group" "public"."deal_killer_group",
  "default_priority"  "public"."checklist_priority" NOT NULL DEFAULT 'medium',
  "sort_order"        integer NOT NULL,
  "created_at"        timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "playbook_items_category_sort_idx"
  ON "public"."playbook_items" ("category", "sort_order");
--> statement-breakpoint
CREATE INDEX "playbook_items_deal_killer_idx"
  ON "public"."playbook_items" ("deal_killer_group")
  WHERE "deal_killer_group" IS NOT NULL;
