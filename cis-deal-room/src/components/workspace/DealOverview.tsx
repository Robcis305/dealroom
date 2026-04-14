'use client';

import { Folder } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import type { WorkspaceStatus } from '@/types';

interface Workspace {
  id: string;
  name: string;
  clientName: string;
  status: WorkspaceStatus;
  cisAdvisorySide: 'buyer_side' | 'seller_side';
  createdAt: Date | string;
}

interface FolderItem {
  id: string;
  name: string;
}

interface DealOverviewProps {
  workspace: Workspace;
  /** Current status (may be updated optimistically by WorkspaceShell). */
  status: WorkspaceStatus;
  folders: FolderItem[];
  /** folderId → number of files */
  fileCounts: Record<string, number>;
  /** Select a folder (navigate the center panel to its FileList) */
  onFolderSelect: (folderId: string) => void;
}

const ADVISORY_LABELS: Record<'buyer_side' | 'seller_side', string> = {
  buyer_side: 'Buyer-side Advisory',
  seller_side: 'Seller-side Advisory',
};

export function DealOverview({ workspace, status, folders, fileCounts, onFolderSelect }: DealOverviewProps) {
  const createdDate = new Date(workspace.createdAt);
  const formattedDate = createdDate.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
  const formattedTime = createdDate.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  return (
    <div className="p-8 max-w-3xl">
      {/* Deal name heading */}
      <h1 className="text-3xl font-semibold text-text-primary mb-3">{workspace.name}</h1>

      {/* Metadata row */}
      <div className="flex flex-wrap items-center gap-3 mb-8">
        <Badge status={status} />
        <span className="text-sm text-text-secondary">
          {ADVISORY_LABELS[workspace.cisAdvisorySide]}
        </span>
        <span className="text-xs text-text-muted">&#8226;</span>
        <span className="text-xs font-mono text-text-muted">
          Created {formattedDate} at {formattedTime}
        </span>
      </div>

      {/* Folder count grid */}
      <div>
        <h2 className="text-xs font-medium text-text-muted uppercase tracking-wider mb-4">
          Folders
        </h2>
        <div className="grid grid-cols-2 gap-3">
          {folders.map((folder) => {
            const fileCount = fileCounts[folder.id] ?? 0;
            return (
              <button
                key={folder.id}
                onClick={() => onFolderSelect(folder.id)}
                className="bg-surface border border-border rounded-xl px-4 py-3
                  flex items-center justify-between w-full text-left
                  hover:border-accent hover:bg-accent-subtle/40 transition-colors
                  focus:outline-none focus:ring-2 focus:ring-accent"
                aria-label={`Open ${folder.name} folder`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Folder size={15} className="text-text-muted shrink-0" />
                  <span className="text-sm text-text-secondary truncate">{folder.name}</span>
                </div>
                <span className="text-xs font-mono text-text-muted shrink-0 ml-2">{fileCount}</span>
              </button>
            );
          })}
        </div>
        {folders.length === 0 && (
          <p className="text-sm text-text-muted text-center py-8">
            No folders in this workspace.
          </p>
        )}
      </div>
    </div>
  );
}
