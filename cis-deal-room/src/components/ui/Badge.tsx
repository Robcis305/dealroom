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
  engagement: 'bg-surface-sunken text-text-secondary border border-border',
  active_dd: 'bg-success-subtle text-success border border-success/30',
  ioi_stage: 'bg-warning-subtle text-warning border border-warning/30',
  closing: 'bg-accent-subtle text-accent border border-accent/30',
  closed: 'bg-surface-sunken text-text-muted border border-border',
  archived: 'bg-surface-sunken text-text-muted border border-border',
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
