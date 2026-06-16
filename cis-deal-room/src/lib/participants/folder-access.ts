import type { ParticipantRole } from '@/types';

/** Roles that can see every folder regardless of explicit folder_access rows. */
export function isFullAccessRole(role: ParticipantRole): boolean {
  return role === 'admin' || role === 'cis_team';
}

/**
 * Whether a participant can access the given folder.
 *
 * Admins / cis_team bypass folder_access checks server-side and hold no
 * folder_access rows, so they have implicit access to every folder and always
 * return true. Everyone else needs an explicit grant in `folderIds`.
 */
export function hasFolderAccess(
  participant: { role: ParticipantRole; folderIds: string[] },
  folderId: string,
): boolean {
  if (isFullAccessRole(participant.role)) return true;
  return participant.folderIds.includes(folderId);
}
