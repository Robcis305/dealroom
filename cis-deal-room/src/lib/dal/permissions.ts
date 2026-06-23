export type ParticipantRole =
  | 'admin'
  | 'cis_team'
  | 'client'
  | 'client_counsel'
  | 'counterparty'
  | 'view_only'
  | 'counsel'          // deprecated — not offered in new-invite UI
  | 'buyer_rep'        // deprecated — not offered in new-invite UI
  | 'seller_rep'       // deprecated — not offered in new-invite UI
  | 'seller_counsel'   // deprecated — not offered in new-invite UI
  | 'buyer_counsel';   // deprecated — not offered in new-invite UI

export type FolderAction = 'upload' | 'download';

/**
 * Resolves whether a participant with the given role can perform an action on
 * a folder they already have access to (via folder_access). This does NOT
 * check folder_access — callers must verify the membership row separately.
 *
 * Admin and CIS Team bypass folder_access entirely; this function still
 * returns true for their upload/download capability.
 */
const UPLOAD_ROLES: ReadonlySet<ParticipantRole> = new Set(['admin', 'cis_team', 'client', 'client_counsel']);

export function canPerform(role: ParticipantRole, action: FolderAction): boolean {
  if (action === 'upload') return UPLOAD_ROLES.has(role);
  return true; // download: any role with folder access
}
