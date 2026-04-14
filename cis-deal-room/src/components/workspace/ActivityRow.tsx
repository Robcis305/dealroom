'use client';

import { displayName } from '@/lib/users/display';

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
}

function formatRelative(ts: Date | string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(ts).toLocaleDateString();
}

function actionVerb(action: string): string {
  const map: Record<string, string> = {
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
  };
  return map[action] ?? action;
}

export function ActivityRow({
  actorEmail, actorFirstName, actorLastName, action, targetType, targetId, metadata, createdAt, count, onTargetClick,
}: ActivityRowProps) {
  const actor = displayName({ firstName: actorFirstName, lastName: actorLastName, email: actorEmail });
  const targetName =
    (metadata && (typeof metadata.fileName === 'string' ? metadata.fileName : null)) ??
    (metadata && (typeof metadata.email === 'string' ? metadata.email : null)) ??
    (metadata && (typeof metadata.folderId === 'string' ? 'folder' : null)) ??
    targetType;
  const plural = count && count > 1 ? `s (${count})` : '';

  return (
    <div className="py-2.5 border-b border-border-subtle last:border-0">
      <p className="text-sm text-text-primary leading-relaxed">
        <span className="font-medium">{actor}</span>
        <span className="text-text-secondary"> {actionVerb(action)} </span>
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
      </p>
      <p className="text-xs text-text-muted mt-0.5">{formatRelative(createdAt)}</p>
    </div>
  );
}
