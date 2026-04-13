import {
  pgTable,
  pgEnum,
  uuid,
  text,
  boolean,
  timestamp,
  integer,
  jsonb,
} from 'drizzle-orm/pg-core';

// ─── Enums ────────────────────────────────────────────────────────────────────

export const workspaceStatusEnum = pgEnum('workspace_status', [
  'engagement',
  'active_dd',
  'ioi_stage',
  'closing',
  'closed',
  'archived',
]);

export const cisAdvisorySideEnum = pgEnum('cis_advisory_side', [
  'buyer_side',
  'seller_side',
]);

export const participantRoleEnum = pgEnum('participant_role', [
  'admin',
  'cis_team',
  'client',
  'counsel',
  'buyer_rep',
  'seller_rep',
  'view_only',
]);

export const activityActionEnum = pgEnum('activity_action', [
  'uploaded',
  'downloaded',
  'viewed',
  'deleted',
  'invited',
  'removed',
  'created_folder',
  'renamed_folder',
  'created_workspace',
  'revoked_access',
  'status_changed',
]);

export const activityTargetTypeEnum = pgEnum('activity_target_type', [
  'workspace',
  'folder',
  'file',
  'participant',
]);

// ─── Tables ───────────────────────────────────────────────────────────────────

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  isAdmin: boolean('is_admin').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  lastActiveAt: timestamp('last_active_at').notNull().defaultNow(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const magicLinkTokens = pgTable('magic_link_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const workspaces = pgTable('workspaces', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  clientName: text('client_name').notNull(),
  status: workspaceStatusEnum('status').notNull().default('engagement'),
  cisAdvisorySide: cisAdvisorySideEnum('cis_advisory_side').notNull(),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const workspaceParticipants = pgTable('workspace_participants', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  role: participantRoleEnum('role').notNull().default('view_only'),
  status: text('status').notNull().default('invited'),
  invitedAt: timestamp('invited_at').notNull().defaultNow(),
  activatedAt: timestamp('activated_at'),
});

export const folders = pgTable('folders', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const folderAccess = pgTable('folder_access', {
  id: uuid('id').primaryKey().defaultRandom(),
  folderId: uuid('folder_id')
    .notNull()
    .references(() => folders.id, { onDelete: 'cascade' }),
  participantId: uuid('participant_id')
    .notNull()
    .references(() => workspaceParticipants.id, { onDelete: 'cascade' }),
  grantedAt: timestamp('granted_at').notNull().defaultNow(),
});

export const files = pgTable('files', {
  id: uuid('id').primaryKey().defaultRandom(),
  folderId: uuid('folder_id')
    .notNull()
    .references(() => folders.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  s3Key: text('s3_key').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  mimeType: text('mime_type').notNull(),
  version: integer('version').notNull().default(1),
  uploadedBy: uuid('uploaded_by')
    .notNull()
    .references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  // No updatedAt — file rows are immutable once confirmed. Versioning creates new rows.
});

// append-only — intentionally no updatedAt
export const activityLogs = pgTable('activity_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  action: activityActionEnum('action').notNull(),
  targetType: activityTargetTypeEnum('target_type').notNull(),
  targetId: uuid('target_id'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
