-- Cap table state machine.
CREATE TYPE "public"."cap_table_status" AS ENUM('draft', 'published');
--> statement-breakpoint

-- Per-row classification of the equity instrument.
CREATE TYPE "public"."cap_table_instrument" AS ENUM(
  'common',
  'preferred',
  'option',
  'rsu',
  'safe',
  'convertible_note',
  'warrant'
);
--> statement-breakpoint

-- New activity actions for the cap table feature.
ALTER TYPE "public"."activity_action" ADD VALUE IF NOT EXISTS 'cap_table_uploaded';
--> statement-breakpoint
ALTER TYPE "public"."activity_action" ADD VALUE IF NOT EXISTS 'cap_table_published';
--> statement-breakpoint
ALTER TYPE "public"."activity_action" ADD VALUE IF NOT EXISTS 'cap_table_unpublished';
--> statement-breakpoint

-- One cap table per workspace at a time. Replaced on each new upload.
CREATE TABLE "public"."cap_tables" (
  "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id"    uuid NOT NULL UNIQUE REFERENCES "public"."workspaces"("id") ON DELETE CASCADE,
  "file_id"         uuid NOT NULL REFERENCES "public"."files"("id") ON DELETE RESTRICT,
  "status"          "public"."cap_table_status" NOT NULL DEFAULT 'draft',
  "uploaded_by"     uuid NOT NULL REFERENCES "public"."users"("id"),
  "uploaded_at"     timestamp NOT NULL DEFAULT now(),
  "published_at"    timestamp,
  "published_by"    uuid REFERENCES "public"."users"("id"),
  "parse_warnings"  jsonb NOT NULL DEFAULT '[]'::jsonb,
  "created_at"      timestamp NOT NULL DEFAULT now(),
  "updated_at"      timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX "cap_tables_workspace_idx" ON "public"."cap_tables" ("workspace_id");
--> statement-breakpoint

CREATE TABLE "public"."cap_table_rows" (
  "id"                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "cap_table_id"       uuid NOT NULL REFERENCES "public"."cap_tables"("id") ON DELETE CASCADE,
  "row_number"         integer NOT NULL,
  "holder"             text NOT NULL,
  "class"              text NOT NULL,
  "instrument"         "public"."cap_table_instrument" NOT NULL,
  "shares"             bigint NOT NULL,
  "ownership_percent"  numeric(7,4) NOT NULL,
  "price_per_share"    numeric(20,8) NOT NULL,
  "amount_invested"    numeric(20,2) NOT NULL,
  "round"              text,
  "round_valuation"    numeric(20,2),
  "vesting_start"      date,
  "vesting_schedule"   text,
  "certificate_number" text,
  "notes"              text,
  "created_at"         timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX "cap_table_rows_cap_table_idx" ON "public"."cap_table_rows" ("cap_table_id", "row_number");
--> statement-breakpoint

CREATE INDEX "cap_table_rows_instrument_idx" ON "public"."cap_table_rows" ("cap_table_id", "instrument");
