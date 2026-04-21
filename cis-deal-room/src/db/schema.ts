import { sql } from 'drizzle-orm';
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  boolean,
  timestamp,
  integer,
  jsonb,
  primaryKey,
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
  'counsel',          // deprecated — kept for existing rows; not offered in new-invite UI
  'buyer_rep',
  'seller_rep',
  'view_only',
  'seller_counsel',
  'buyer_counsel',
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
  'participant_updated',
  'notified_batch',
  'previewed',
  'checklist_imported',
  'checklist_item_linked',
  'checklist_item_received',
  'checklist_item_waived',
  'checklist_item_na',
  'checklist_item_assigned',
]);

export const magicLinkPurposeEnum = pgEnum('magic_link_purpose', ['login', 'invitation']);

export const activityTargetTypeEnum = pgEnum('activity_target_type', [
  'workspace',
  'folder',
  'file',
  'participant',
]);

export const checklistPriorityEnum = pgEnum('checklist_priority', [
  'critical',
  'high',
  'medium',
  'low',
]);

export const checklistOwnerEnum = pgEnum('checklist_owner', [
  'seller',
  'buyer',
  'both',
  'cis_team',
  'unassigned',
]);

export const checklistStatusEnum = pgEnum('checklist_status', [
  'not_started',
  'in_progress',
  'received',
  'waived',
  'n_a',
]);

export const viewOnlyShadowSideEnum = pgEnum('view_only_shadow_side', [
  'buyer',
  'seller',
]);

// ─── Tables ───────────────────────────────────────────────────────────────────

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  firstName: text('first_name'),
  lastName: text('last_name'),
  isAdmin: boolean('is_admin').notNull().default(false),
  notifyUploads: boolean('notify_uploads').notNull().default(true),
  notifyDigest: boolean('notify_digest').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  lastActiveAt: timestamp('last_active_at').notNull().defaultNow(),
  absoluteExpiresAt: timestamp('absolute_expires_at').notNull().default(sql`now() + interval '4 hours'`),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const magicLinkTokens = pgTable('magic_link_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  purpose: magicLinkPurposeEnum('purpose').notNull().default('login'),
  redirectTo: text('redirect_to'),
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
  viewOnlyShadowSide: viewOnlyShadowSideEnum('view_only_shadow_side'),
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

export const notificationQueue = pgTable('notification_queue', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  action: activityActionEnum('action').notNull(),
  targetType: activityTargetTypeEnum('target_type').notNull(),
  targetId: uuid('target_id'),
  metadata: jsonb('metadata'),
  attempts: integer('attempts').notNull().default(0),
  lastError: text('last_error'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  processedAt: timestamp('processed_at'),
});

export const checklists = pgTable('checklists', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  name: text('name').notNull().default('Diligence Checklist'),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const checklistItems = pgTable('checklist_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  checklistId: uuid('checklist_id')
    .notNull()
    .references(() => checklists.id, { onDelete: 'cascade' }),
  folderId: uuid('folder_id')
    .notNull()
    .references(() => folders.id, { onDelete: 'restrict' }),
  sortOrder: integer('sort_order').notNull().default(0),
  category: text('category').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  priority: checklistPriorityEnum('priority').notNull().default('medium'),
  owner: checklistOwnerEnum('owner').notNull().default('unassigned'),
  status: checklistStatusEnum('status').notNull().default('not_started'),
  notes: text('notes'),
  requestedAt: timestamp('requested_at').notNull().defaultNow(),
  receivedAt: timestamp('received_at'),
  receivedBy: uuid('received_by').references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const checklistItemFiles = pgTable(
  'checklist_item_files',
  {
    itemId: uuid('item_id')
      .notNull()
      .references(() => checklistItems.id, { onDelete: 'cascade' }),
    fileId: uuid('file_id')
      .notNull()
      .references(() => files.id, { onDelete: 'cascade' }),
    linkedAt: timestamp('linked_at').notNull().defaultNow(),
    linkedBy: uuid('linked_by').notNull().references(() => users.id),
  },
  (table) => [primaryKey({ columns: [table.itemId, table.fileId] })],
);
