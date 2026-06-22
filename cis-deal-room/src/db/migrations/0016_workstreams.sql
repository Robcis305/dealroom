-- New activity actions for workstreams.
ALTER TYPE "public"."activity_action" ADD VALUE IF NOT EXISTS 'workstream_member_added';
--> statement-breakpoint
ALTER TYPE "public"."activity_action" ADD VALUE IF NOT EXISTS 'workstream_member_removed';
--> statement-breakpoint
ALTER TYPE "public"."activity_action" ADD VALUE IF NOT EXISTS 'workstream_updated';
--> statement-breakpoint
ALTER TYPE "public"."activity_action" ADD VALUE IF NOT EXISTS 'document_tagged';
--> statement-breakpoint
ALTER TYPE "public"."activity_action" ADD VALUE IF NOT EXISTS 'document_untagged';
--> statement-breakpoint

-- New activity target type for workstreams.
ALTER TYPE "public"."activity_target_type" ADD VALUE IF NOT EXISTS 'workstream';
--> statement-breakpoint

-- Per-workspace workstream definitions (seeded lazily from canonical list).
CREATE TABLE "public"."workstreams" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL REFERENCES "public"."workspaces"("id") ON DELETE CASCADE,
  "key"          text NOT NULL,
  "name"         text NOT NULL,
  "color"        text NOT NULL,
  "tile_tint"    text NOT NULL,
  "description"  text,
  "sort_order"   integer NOT NULL DEFAULT 0,
  "created_at"   timestamp NOT NULL DEFAULT now(),
  "updated_at"   timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "workstreams_workspace_key_uq" UNIQUE ("workspace_id", "key")
);
--> statement-breakpoint

CREATE INDEX "workstreams_workspace_idx" ON "public"."workstreams" ("workspace_id");
--> statement-breakpoint

-- Workstream membership: which participants belong to which workstream.
CREATE TABLE "public"."workstream_members" (
  "workstream_id"  uuid NOT NULL REFERENCES "public"."workstreams"("id") ON DELETE CASCADE,
  "participant_id" uuid NOT NULL REFERENCES "public"."workspace_participants"("id") ON DELETE CASCADE,
  "added_at"       timestamp NOT NULL DEFAULT now(),
  "added_by"       uuid NOT NULL REFERENCES "public"."users"("id"),
  PRIMARY KEY ("workstream_id", "participant_id")
);
--> statement-breakpoint

CREATE INDEX "workstream_members_workstream_idx" ON "public"."workstream_members" ("workstream_id");
--> statement-breakpoint

-- File-to-workstream tagging.
CREATE TABLE "public"."file_workstreams" (
  "file_id"       uuid NOT NULL REFERENCES "public"."files"("id") ON DELETE CASCADE,
  "workstream_id" uuid NOT NULL REFERENCES "public"."workstreams"("id") ON DELETE CASCADE,
  "tagged_at"     timestamp NOT NULL DEFAULT now(),
  "tagged_by"     uuid NOT NULL REFERENCES "public"."users"("id"),
  PRIMARY KEY ("file_id", "workstream_id")
);
--> statement-breakpoint

CREATE INDEX "file_workstreams_workstream_idx" ON "public"."file_workstreams" ("workstream_id");
