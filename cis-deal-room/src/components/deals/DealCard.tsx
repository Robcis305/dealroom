'use client';

import Link from 'next/link';
import { FileText, Users } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import type { WorkspaceStatus } from '@/types';

interface DealCardProps {
  id: string;
  name: string;
  clientName: string;
  status: WorkspaceStatus;
  docCount: number;
  participantCount: number;
  lastActivityAction: string | null;
  lastActivityAt: Date | string | null;
  isAdmin: boolean;
}

function formatRelative(ts: Date | string): string {
  const then = new Date(ts).getTime();
  const diff = Date.now() - then;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

function actionSummary(action: string | null, at: Date | string | null): string {
  if (!action || !at) return 'No activity yet';
  const labels: Record<string, string> = {
    uploaded: 'File uploaded',
    downloaded: 'File downloaded',
    deleted: 'File deleted',
    invited: 'Participant invited',
    removed: 'Participant removed',
    participant_updated: 'Participant updated',
    created_folder: 'Folder created',
    renamed_folder: 'Folder renamed',
    created_workspace: 'Workspace created',
    revoked_access: 'Access revoked',
    status_changed: 'Status changed',
    notified_batch: 'Batch notification',
  };
  return `${labels[action] ?? action} · ${formatRelative(at)}`;
}

export function DealCard({
  id, name, clientName, status, docCount, participantCount, lastActivityAction, lastActivityAt, isAdmin,
}: DealCardProps) {
  return (
    <Link
      href={`/workspace/${id}`}
      className="block bg-surface border border-border rounded-xl p-5 transition-colors
        hover:border-accent hover:bg-accent-subtle/30 focus:outline-none focus:ring-2 focus:ring-accent"
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <h3 className="text-base font-semibold text-text-primary truncate flex-1">{name}</h3>
        <Badge status={status} />
      </div>
      {isAdmin && (
        <p className="text-sm text-text-secondary truncate mb-3">{clientName}</p>
      )}
      <div className="flex flex-col gap-1 text-xs text-text-muted">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1">
            <FileText size={12} /> {docCount} {docCount === 1 ? 'doc' : 'docs'}
          </span>
          <span className="flex items-center gap-1">
            <Users size={12} /> {participantCount} {participantCount === 1 ? 'participant' : 'participants'}
          </span>
        </div>
        <span>{actionSummary(lastActivityAction, lastActivityAt)}</span>
      </div>
    </Link>
  );
}
