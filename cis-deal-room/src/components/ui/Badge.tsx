import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Workspace lifecycle status values from the schema
type WorkspaceStatus =
  | 'engagement'
  | 'active_dd'
  | 'ioi_stage'
  | 'closing'
  | 'closed'
  | 'archived';

const STATUS_STYLES: Record<WorkspaceStatus, string> = {
  engagement: 'bg-blue-500/10 text-blue-400 border border-blue-500/20',
  active_dd: 'bg-green-500/10 text-green-400 border border-green-500/20',
  ioi_stage: 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20',
  closing: 'bg-orange-500/10 text-orange-400 border border-orange-500/20',
  closed: 'bg-neutral-500/10 text-neutral-400 border border-neutral-500/20',
  archived: 'bg-neutral-500/10 text-neutral-500 border border-neutral-500/20',
};

const STATUS_LABELS: Record<WorkspaceStatus, string> = {
  engagement: 'Engagement',
  active_dd: 'Active DD',
  ioi_stage: 'IOI Stage',
  closing: 'Closing',
  closed: 'Closed',
  archived: 'Archived',
};

interface BadgeProps {
  status: WorkspaceStatus;
  className?: string;
}

export function Badge({ status, className }: BadgeProps) {
  return (
    <span
      className={twMerge(
        clsx(
          'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
          STATUS_STYLES[status],
          className
        )
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
