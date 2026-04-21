CREATE TYPE "public"."checklist_owner" AS ENUM('seller', 'buyer', 'both', 'cis_team', 'unassigned');--> statement-breakpoint
CREATE TYPE "public"."checklist_priority" AS ENUM('critical', 'high', 'medium', 'low');--> statement-breakpoint
CREATE TYPE "public"."checklist_status" AS ENUM('not_started', 'in_progress', 'received', 'waived', 'n_a');--> statement-breakpoint
CREATE TYPE "public"."view_only_shadow_side" AS ENUM('buyer', 'seller');--> statement-breakpoint
ALTER TYPE "public"."activity_action" ADD VALUE 'checklist_imported';--> statement-breakpoint
ALTER TYPE "public"."activity_action" ADD VALUE 'checklist_item_linked';--> statement-breakpoint
ALTER TYPE "public"."activity_action" ADD VALUE 'checklist_item_received';--> statement-breakpoint
ALTER TYPE "public"."activity_action" ADD VALUE 'checklist_item_waived';--> statement-breakpoint
ALTER TYPE "public"."activity_action" ADD VALUE 'checklist_item_na';--> statement-breakpoint
ALTER TYPE "public"."activity_action" ADD VALUE 'checklist_item_assigned';--> statement-breakpoint
ALTER TYPE "public"."participant_role" ADD VALUE 'seller_counsel';--> statement-breakpoint
ALTER TYPE "public"."participant_role" ADD VALUE 'buyer_counsel';--> statement-breakpoint
CREATE TABLE "checklist_item_files" (
	"item_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"linked_at" timestamp DEFAULT now() NOT NULL,
	"linked_by" uuid NOT NULL,
	CONSTRAINT "checklist_item_files_item_id_file_id_pk" PRIMARY KEY("item_id","file_id")
);
--> statement-breakpoint
CREATE TABLE "checklist_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"checklist_id" uuid NOT NULL,
	"folder_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"category" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"priority" "checklist_priority" DEFAULT 'medium' NOT NULL,
	"owner" "checklist_owner" DEFAULT 'unassigned' NOT NULL,
	"status" "checklist_status" DEFAULT 'not_started' NOT NULL,
	"notes" text,
	"requested_at" timestamp DEFAULT now() NOT NULL,
	"received_at" timestamp,
	"received_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "checklists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text DEFAULT 'Diligence Checklist' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workspace_participants" ADD COLUMN "view_only_shadow_side" "view_only_shadow_side";--> statement-breakpoint
ALTER TABLE "checklist_item_files" ADD CONSTRAINT "checklist_item_files_item_id_checklist_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."checklist_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_item_files" ADD CONSTRAINT "checklist_item_files_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_item_files" ADD CONSTRAINT "checklist_item_files_linked_by_users_id_fk" FOREIGN KEY ("linked_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_items" ADD CONSTRAINT "checklist_items_checklist_id_checklists_id_fk" FOREIGN KEY ("checklist_id") REFERENCES "public"."checklists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_items" ADD CONSTRAINT "checklist_items_folder_id_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."folders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_items" ADD CONSTRAINT "checklist_items_received_by_users_id_fk" FOREIGN KEY ("received_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklists" ADD CONSTRAINT "checklists_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklists" ADD CONSTRAINT "checklists_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;