ALTER TABLE "notification_queue" ADD COLUMN "attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_queue" ADD COLUMN "last_error" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "notify_uploads" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "notify_digest" boolean DEFAULT false NOT NULL;