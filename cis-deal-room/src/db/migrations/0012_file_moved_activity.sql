-- New activity action for the bulk file-move endpoint.
ALTER TYPE "public"."activity_action" ADD VALUE IF NOT EXISTS 'file_moved';
