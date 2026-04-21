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
  | 'checklist_item_assigned';

export type ActivityTargetType = 'workspace' | 'folder' | 'file' | 'participant';

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
  | 'received'
  | 'waived'
  | 'n_a';

export type ViewOnlyShadowSide = 'buyer' | 'seller';
