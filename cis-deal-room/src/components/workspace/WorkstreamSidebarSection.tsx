'use client';

import clsx from 'clsx';
import type { WorkstreamWithCounts } from '@/types';
import type { CenterView } from './FolderSidebar';

interface Props {
  workstreams: WorkstreamWithCounts[];
  selected: CenterView;
  onSelect: (view: CenterView) => void;
  onManage: () => void;
}

export function WorkstreamSidebarSection({ workstreams, selected, onSelect, onManage }: Props) {
  if (workstreams.length === 0) return null;
  const selectedId = selected.kind === 'workstream' ? selected.workstreamId : null;

  return (
    <div className="mt-3 pt-3 border-t border-border-subtle">
      <div className="px-3 mb-1 flex items-center justify-between">
        <p className="text-xs font-medium text-text-muted uppercase tracking-wider">Workstreams</p>
        <button
          onClick={onManage}
          className="text-xs text-text-muted hover:text-accent cursor-pointer transition-colors"
        >
          Manage
        </button>
      </div>
      {workstreams.map((ws) => {
        const isSelected = ws.id === selectedId;
        return (
          <div key={ws.id} className="mx-1">
            <button
              onClick={() => onSelect(isSelected ? { kind: 'overview' } : { kind: 'workstream', workstreamId: ws.id })}
              className={clsx(
                'w-full flex items-center justify-between gap-2 px-3 py-1.5 rounded-md text-sm transition-colors',
                isSelected ? 'bg-accent-subtle text-accent-on-subtle' : 'text-text-secondary hover:bg-surface-elevated hover:text-text-primary',
              )}
            >
              <span className="flex items-center gap-2 min-w-0">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: ws.color }} aria-hidden="true" />
                <span className="truncate">{ws.name}</span>
              </span>
              <span className="text-xs font-mono text-text-muted tabular-nums shrink-0">{ws.docCount}</span>
            </button>
          </div>
        );
      })}
    </div>
  );
}
