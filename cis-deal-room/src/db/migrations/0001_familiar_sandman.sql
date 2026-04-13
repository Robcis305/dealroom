CREATE TYPE "public"."magic_link_purpose" AS ENUM('login', 'invitation');--> statement-breakpoint
ALTER TYPE "public"."activity_action" ADD VALUE 'participant_updated';--> statement-breakpoint
ALTER TYPE "public"."activity_action" ADD VALUE 'notified_batch';--> statement-breakpoint
ALTER TABLE "magic_link_tokens" ADD COLUMN "purpose" "magic_link_purpose" DEFAULT 'login' NOT NULL;--> statement-breakpoint
ALTER TABLE "magic_link_tokens" ADD COLUMN "redirect_to" text;