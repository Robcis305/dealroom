// ─── Session ──────────────────────────────────────────────────────────────────

export interface Session {
  sessionId: string;
  userId: string;
  userEmail: string;
  isAdmin: boolean;
}

// ─── Workspace ────────────────────────────────────────────────────────────────

export type WorkspaceStatus =
  | 'engagement'
  | 'active_dd'
  | 'ioi_stage'
  | 'closing'
  | 'closed'
  | 'archived';

// ─── CIS Advisory Side ────────────────────────────────────────────────────────

export type CisAdvisorySide = 'buyer_side' | 'seller_side';

// ─── Participant Role ─────────────────────────────────────────────────────────

export type ParticipantRole =
  | 'admin'
  | 'cis_team'
  | 'client'
  | 'counsel'          // deprecated — not offered in new-invite UI
  | 'buyer_rep'
  | 'seller_rep'
  | 'view_only'
  | 'seller_counsel'
  | 'buyer_counsel';

// ─── Participant Status ───────────────────────────────────────────────────────

export type ParticipantStatus = 'invited' | 'active' | 'revoked';

// ─── Activity ─────────────────────────────────────────────────────────────────

export type ActivityAction =
  | 'uploaded'
  | 'downloaded'
  | 'viewed'
  | 'deleted'
  | 'invited'
  | 'removed'
  | 'created_folder'
  | 'renamed_folder'
  | 'created_workspace'
  | 'revoked_access'
  | 'status_changed'
  | 'participant_updated'
  | 'notified_batch'
  | 'previewed'
  | 'checklist_imported'
  | 'checklist_item_linked'
  | 'checklist_item_received'
  | 'checklist_item_waived'
  | 'checklist_item_na'
  | 'checklist_item_assigned'
  | 'playbook_item_blocked'
  | 'buyer_invite_with_outstanding'
  | 'file_moved'
  | 'restored'
  | 'cap_table_uploaded'
  | 'cap_table_published'
  | 'cap_table_unpublished'
  | 'workstream_member_added'
  | 'workstream_member_removed'
  | 'workstream_updated'
  | 'document_tagged'
  | 'document_untagged'
  | 'qna_asked'
  | 'qna_assigned'
  | 'qna_answered'
  | 'qna_approved'
  | 'qna_changes_requested'
  | 'qna_rerouted'
  | 'qna_message_posted';

export type ActivityTargetType = 'workspace' | 'folder' | 'file' | 'participant' | 'workstream' | 'qna_question';

// ─── Checklist ────────────────────────────────────────────────────────────────

export type ChecklistPriority = 'critical' | 'high' | 'medium' | 'low';

export type ChecklistOwner =
  | 'seller'
  | 'buyer'
  | 'both'
  | 'cis_team'
  | 'unassigned';

export type ChecklistStatus =
  | 'not_started'
  | 'in_progress'
  | 'blocked'
  | 'received'
  | 'waived'
  | 'n_a';

export type ViewOnlyShadowSide = 'buyer' | 'seller';

// ─── Cap Table ────────────────────────────────────────────────────────────────

export type CapTableStatus = 'draft' | 'published';

export type CapTableInstrument =
  | 'common'
  | 'preferred'
  | 'option'
  | 'rsu'
  | 'safe'
  | 'convertible_note'
  | 'warrant';

// ─── Playbook ─────────────────────────────────────────────────────────────────

export type { PlaybookCategory, DealKillerGroup, PendingHighlight, Stage } from '@/lib/dal/playbook';

// ─── Workstream ───────────────────────────────────────────────────────────────

export type { WorkstreamKey } from '@/lib/workstreams/constants';

export interface Workstream {
  id: string;
  workspaceId: string;
  key: string;
  name: string;
  color: string;
  tileTint: string;
  description: string | null;
  sortOrder: number;
}

/** A workstream plus the derived counts shown in the sidebar/dashboard. */
export interface WorkstreamWithCounts extends Workstream {
  docCount: number;
  memberCount: number;
  openQaCount: number;   // 0 until PR2 (Q&A)
  overdueCount: number;  // 0 until PR2 (Q&A)
}

// ─── Q&A ──────────────────────────────────────────────────────────────────────

export type { QnaStatus, QnaVisibility, QnaMessageKind } from '@/lib/qna/constants';
import type { QnaStatus as _QnaStatus, QnaVisibility as _QnaVisibility, QnaMessageKind as _QnaMessageKind } from '@/lib/qna/constants';

export interface QnaQuestionRow {
  id: string;
  workspaceId: string;
  title: string;
  status: _QnaStatus;
  askedById: string;
  askedByName: string;
  assigneeId: string | null;
  assigneeName: string | null;
  askedAt: string;
  requestedBy: string | null;
  visibility: _QnaVisibility;
  linkedDocId: string | null;
  workstreams: Array<{ id: string; name: string; color: string }>;
  isOverdue: boolean;
}

export interface QnaMessage {
  id: string;
  questionId: string;
  authorId: string;
  authorName: string;
  kind: _QnaMessageKind;
  body: string;
  createdAt: string;
  attachments: Array<{ fileId: string; name: string }>;
}

export interface QnaQuestionDetail extends QnaQuestionRow {
  thread: QnaMessage[];
  proposedAnswer: QnaMessage | null;
  recipients: Array<{ participantId: string; name: string }>;
  linkedDocName: string | null;
  /** Derived from cisAdvisorySide: the CIS approval gate is live. */
  approvalGateActive: boolean;
}
