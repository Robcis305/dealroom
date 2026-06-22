CREATE TYPE "public"."ai_analysis_status" AS ENUM('queued', 'running', 'complete', 'failed');--> statement-breakpoint
CREATE TYPE "public"."ai_analysis_trigger" AS ENUM('checklist_link', 'manual');--> statement-breakpoint
CREATE TYPE "public"."ai_risk_level" AS ENUM('HIGH', 'MEDIUM', 'LOW', 'FAVORABLE');--> statement-breakpoint
ALTER TYPE "public"."activity_action" ADD VALUE 'ai_analyzed';--> statement-breakpoint
ALTER TYPE "public"."activity_action" ADD VALUE 'ai_published';--> statement-breakpoint
ALTER TYPE "public"."activity_action" ADD VALUE 'ai_unpublished';--> statement-breakpoint
CREATE TABLE "ai_analyses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"file_version" integer NOT NULL,
	"triggered_by" uuid NOT NULL,
	"trigger" "ai_analysis_trigger" NOT NULL,
	"checklist_item_id" uuid,
	"status" "ai_analysis_status" DEFAULT 'queued' NOT NULL,
	"error_message" text,
	"risk_score" integer,
	"summary" text,
	"priority_actions" jsonb,
	"model_used" text,
	"prompt_version" text,
	"tokens_input" integer,
	"tokens_output" integer,
	"duration_ms" integer,
	"published_at" timestamp,
	"published_by" uuid,
	"superseded_at" timestamp,
	"superseded_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_findings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"analysis_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"clause_text" text NOT NULL,
	"category" text NOT NULL,
	"risk_level" "ai_risk_level" NOT NULL,
	"impact_summary" text NOT NULL,
	"benchmark_comparison" text NOT NULL,
	"recommendation" text NOT NULL,
	"flag_for_review" boolean NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "checklist_item_ai_analyses" (
	"item_id" uuid NOT NULL,
	"analysis_id" uuid NOT NULL,
	"linked_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "checklist_item_ai_analyses_item_id_analysis_id_pk" PRIMARY KEY("item_id","analysis_id")
);
--> statement-breakpoint
ALTER TABLE "ai_analyses" ADD CONSTRAINT "ai_analyses_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_analyses" ADD CONSTRAINT "ai_analyses_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_analyses" ADD CONSTRAINT "ai_analyses_triggered_by_users_id_fk" FOREIGN KEY ("triggered_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_analyses" ADD CONSTRAINT "ai_analyses_checklist_item_id_checklist_items_id_fk" FOREIGN KEY ("checklist_item_id") REFERENCES "public"."checklist_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_analyses" ADD CONSTRAINT "ai_analyses_published_by_users_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_findings" ADD CONSTRAINT "ai_findings_analysis_id_ai_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."ai_analyses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_item_ai_analyses" ADD CONSTRAINT "checklist_item_ai_analyses_item_id_checklist_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."checklist_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_item_ai_analyses" ADD CONSTRAINT "checklist_item_ai_analyses_analysis_id_ai_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."ai_analyses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

-- Self-reference for ai_analyses.superseded_by → ai_analyses.id (history pointer).
ALTER TABLE "public"."ai_analyses"
  ADD CONSTRAINT "ai_analyses_superseded_by_fkey"
  FOREIGN KEY ("superseded_by") REFERENCES "public"."ai_analyses"("id")
  ON DELETE SET NULL;
--> statement-breakpoint

-- Partial unique: at most one *current* analysis per (file, version).
-- Re-analysis marks the prior row superseded before inserting the new one.
CREATE UNIQUE INDEX "ai_analyses_file_version_current_unique"
  ON "public"."ai_analyses" ("file_id", "file_version")
  WHERE "superseded_at" IS NULL;
--> statement-breakpoint

-- Read paths.
CREATE INDEX "ai_analyses_workspace_idx"
  ON "public"."ai_analyses" ("workspace_id");
--> statement-breakpoint

CREATE INDEX "ai_analyses_item_idx"
  ON "public"."ai_analyses" ("checklist_item_id")
  WHERE "checklist_item_id" IS NOT NULL;
--> statement-breakpoint

CREATE INDEX "ai_findings_analysis_idx"
  ON "public"."ai_findings" ("analysis_id");
