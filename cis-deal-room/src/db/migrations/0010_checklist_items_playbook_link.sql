-- Canonical items reference playbook_items.id. Custom items keep this NULL.
ALTER TABLE "public"."checklist_items"
  ADD COLUMN "playbook_item_id" uuid REFERENCES "public"."playbook_items"("id") ON DELETE RESTRICT;
--> statement-breakpoint

-- Canonical items don't need a folder. Files attach via checklist_item_files.
ALTER TABLE "public"."checklist_items"
  ALTER COLUMN "folder_id" DROP NOT NULL;
--> statement-breakpoint

-- One canonical row per (checklist, playbook_item). Custom items are unconstrained.
CREATE UNIQUE INDEX "checklist_items_unique_playbook_idx"
  ON "public"."checklist_items" ("checklist_id", "playbook_item_id")
  WHERE "playbook_item_id" IS NOT NULL;
--> statement-breakpoint

CREATE INDEX "checklist_items_playbook_idx"
  ON "public"."checklist_items" ("playbook_item_id")
  WHERE "playbook_item_id" IS NOT NULL;
