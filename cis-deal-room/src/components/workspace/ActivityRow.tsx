'use client';

import { displayName } from '@/lib/users/display';
import { formatRelative } from '@/lib/format-date';

interface ActivityRowProps {
  actorEmail: string;
  actorFirstName: string | null;
  actorLastName: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date | string;
  count?: number;
  onTargetClick?: (targetType: string, targetId: string | null) => void;
  /** Optional lookup for resolving folderId → name (for activity where metadata.folderName wasn't denormalized) */
  resolveFolderName?: (folderId: string) => string | null;
}

const ACTION_VERBS: Record<string, string> = {
  uploaded: 'uploaded',
  downloaded: 'downloaded',
  deleted: 'deleted',
  invited: 'invited',
  removed: 'removed',
  participant_updated: 'updated',
  created_folder: 'created folder',
  renamed_folder: 'renamed folder',
  created_workspace: 'created workspace',
  revoked_access: 'revoked access to',
  status_changed: 'changed status',
  notified_batch: 'notified participants about',
  checklist_imported: 'imported a diligence checklist',
  checklist_item_linked: 'linked a file to',
  checklist_item_received: 'marked as received',
  checklist_item_waived: 'marked as waived',
  checklist_item_na: 'marked as N/A',
  checklist_item_assigned: 'assigned',
};

// Actions whose verb already mentions "folder" — don't repeat the word as a target
const VERB_INCLUDES_FOLDER = new Set(['created_folder', 'renamed_folder']);

function actionVerb(action: string): string {
  return ACTION_VERBS[action] ?? action;
}

function resolveTarget(
  metadata: Record<string, unknown> | null,
  action: string,
  targetType: string,
  resolveFolderName?: (id: string) => string | null,
): string | null {
  if (typeof metadata?.fileName === 'string') return metadata.fileName;
  if (typeof metadata?.itemName === 'string') return metadata.itemName;
  if (typeof metadata?.email === 'string') return metadata.email;
  if (typeof metadata?.folderName === 'string') return metadata.folderName;
  if (typeof metadata?.folderId === 'string') {
    const resolved = resolveFolderName?.(metadata.folderId);
    if (resolved) return resolved;
    // Don't produce "created folder folder" — the verb already names it
    if (VERB_INCLUDES_FOLDER.has(action)) return null;
    return 'a folder';
  }
  // Fall back to targetType only for unknown cases — never for folder-verb actions
  if (VERB_INCLUDES_FOLDER.has(action)) return null;
  return targetType;
}

export function ActivityRow({
  actorEmail, actorFirstName, actorLastName, action, targetType, targetId, metadata, createdAt, count, onTargetClick, resolveFolderName,
}: ActivityRowProps) {
  const actor = displayName({ firstName: actorFirstName, lastName: actorLastName, email: actorEmail });
  const targetName = resolveTarget(metadata, action, targetType, resolveFolderName);
  const plural = count && count > 1 ? `s (${count})` : '';

  return (
    <div className="py-2.5 border-b border-border-subtle last:border-0">
      <p className="text-sm text-text-primary leading-relaxed">
        <span className="font-medium">{actor}</span>
        <span className="text-text-secondary"> {actionVerb(action)}</span>
        {targetName && (
          <>
            {' '}
            {targetId && onTargetClick ? (
              <button
                onClick={() => onTargetClick(targetType, targetId)}
                className="font-medium text-accent hover:underline"
              >
                {targetName}{plural}
              </button>
            ) : (
              <span className="font-medium">{targetName}{plural}</span>
            )}
          </>
        )}
      </p>
      <p className="text-xs text-text-muted mt-0.5">{formatRelative(createdAt)}</p>
    </div>
  );
}
