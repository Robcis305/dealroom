-- New activity actions: admin deal-room rename + admin Q&A question delete.
ALTER TYPE "public"."activity_action" ADD VALUE IF NOT EXISTS 'renamed_workspace';
ALTER TYPE "public"."activity_action" ADD VALUE IF NOT EXISTS 'qna_deleted';
