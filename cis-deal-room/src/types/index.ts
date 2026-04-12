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
  | 'counsel'
  | 'buyer_rep'
  | 'seller_rep'
  | 'view_only';

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
  | 'status_changed';

export type ActivityTargetType = 'workspace' | 'folder' | 'file' | 'participant';
