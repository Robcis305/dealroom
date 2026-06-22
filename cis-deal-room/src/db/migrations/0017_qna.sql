-- New Q&A enums.
CREATE TYPE "public"."qna_status" AS ENUM ('new', 'assigned', 'answered', 'approved');
--> statement-breakpoint
CREATE TYPE "public"."qna_visibility" AS ENUM ('public', 'private');
--> statement-breakpoint
CREATE TYPE "public"."qna_message_kind" AS ENUM ('message', 'proposed_answer');
--> statement-breakpoint

-- New activity actions for Q&A.
ALTER TYPE "public"."activity_action" ADD VALUE IF NOT EXISTS 'qna_asked';
--> statement-breakpoint
ALTER TYPE "public"."activity_action" ADD VALUE IF NOT EXISTS 'qna_assigned';
--> statement-breakpoint
ALTER TYPE "public"."activity_action" ADD VALUE IF NOT EXISTS 'qna_answered';
--> statement-breakpoint
ALTER TYPE "public"."activity_action" ADD VALUE IF NOT EXISTS 'qna_approved';
--> statement-breakpoint
ALTER TYPE "public"."activity_action" ADD VALUE IF NOT EXISTS 'qna_changes_requested';
--> statement-breakpoint
ALTER TYPE "public"."activity_action" ADD VALUE IF NOT EXISTS 'qna_rerouted';
--> statement-breakpoint
ALTER TYPE "public"."activity_action" ADD VALUE IF NOT EXISTS 'qna_message_posted';
--> statement-breakpoint

-- New activity target type for Q&A.
ALTER TYPE "public"."activity_target_type" ADD VALUE IF NOT EXISTS 'qna_question';
--> statement-breakpoint

-- Q&A questions.
CREATE TABLE IF NOT EXISTS "public"."qna_questions" (
  "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id"   uuid NOT NULL REFERENCES "public"."workspaces"("id") ON DELETE CASCADE,
  "title"          text NOT NULL,
  "status"         "public"."qna_status" NOT NULL DEFAULT 'new',
  "asked_by_id"    uuid NOT NULL REFERENCES "public"."users"("id"),
  "assignee_id"    uuid REFERENCES "public"."users"("id"),
  "asked_at"       timestamp NOT NULL DEFAULT now(),
  "requested_by"   date,
  "visibility"     "public"."qna_visibility" NOT NULL DEFAULT 'public',
  "linked_doc_id"  uuid REFERENCES "public"."files"("id") ON DELETE SET NULL,
  "created_at"     timestamp NOT NULL DEFAULT now(),
  "updated_at"     timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "qna_questions_workspace_idx" ON "public"."qna_questions" ("workspace_id");
--> statement-breakpoint

-- Q&A question-to-workstream join table.
CREATE TABLE IF NOT EXISTS "public"."qna_question_workstreams" (
  "question_id"    uuid NOT NULL REFERENCES "public"."qna_questions"("id") ON DELETE CASCADE,
  "workstream_id"  uuid NOT NULL REFERENCES "public"."workstreams"("id") ON DELETE CASCADE,
  PRIMARY KEY ("question_id", "workstream_id")
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "qna_qws_workstream_idx" ON "public"."qna_question_workstreams" ("workstream_id");
--> statement-breakpoint

-- Q&A messages.
CREATE TABLE IF NOT EXISTS "public"."qna_messages" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "question_id"  uuid NOT NULL REFERENCES "public"."qna_questions"("id") ON DELETE CASCADE,
  "author_id"    uuid NOT NULL REFERENCES "public"."users"("id"),
  "kind"         "public"."qna_message_kind" NOT NULL DEFAULT 'message',
  "body"         text NOT NULL,
  "created_at"   timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "qna_messages_question_idx" ON "public"."qna_messages" ("question_id", "created_at");
--> statement-breakpoint

-- Q&A message file attachments.
CREATE TABLE IF NOT EXISTS "public"."qna_message_files" (
  "message_id"  uuid NOT NULL REFERENCES "public"."qna_messages"("id") ON DELETE CASCADE,
  "file_id"     uuid NOT NULL REFERENCES "public"."files"("id") ON DELETE CASCADE,
  PRIMARY KEY ("message_id", "file_id")
);
--> statement-breakpoint

-- Q&A recipients (workspace participants who can see the question).
CREATE TABLE IF NOT EXISTS "public"."qna_recipients" (
  "question_id"    uuid NOT NULL REFERENCES "public"."qna_questions"("id") ON DELETE CASCADE,
  "participant_id" uuid NOT NULL REFERENCES "public"."workspace_participants"("id") ON DELETE CASCADE,
  PRIMARY KEY ("question_id", "participant_id")
);
