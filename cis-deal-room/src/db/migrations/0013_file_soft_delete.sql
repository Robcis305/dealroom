-- Files become soft-deleted by setting deleted_at; null = active.
-- Hard-delete (incl. S3) is deferred to a future cleanup script.
ALTER TABLE "public"."files"
  ADD COLUMN IF NOT EXISTS "deleted_at" timestamp;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "files_deleted_at_idx"
  ON "public"."files" ("deleted_at")
  WHERE "deleted_at" IS NOT NULL;
--> statement-breakpoint

-- New activity action for restoring a soft-deleted file.
ALTER TYPE "public"."activity_action" ADD VALUE IF NOT EXISTS 'restored';
