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
}

const ADVISORY_LABELS: Record<'buyer_side' | 'seller_side', string> = {
  buyer_side: 'Buyer-side Advisory',
  seller_side: 'Seller-side Advisory',
};

export function DealOverview({ workspace, status, folders }: DealOverviewProps) {
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
      <h1 className="text-3xl font-semibold text-white mb-3">{workspace.name}</h1>

      {/* Metadata row */}
      <div className="flex flex-wrap items-center gap-3 mb-8">
        <Badge status={status} />
        <span className="text-sm text-neutral-400">
          {ADVISORY_LABELS[workspace.cisAdvisorySide]}
        </span>
        <span className="text-xs text-neutral-600">&#8226;</span>
        <span className="text-xs font-mono text-neutral-500">
          Created {formattedDate} at {formattedTime}
        </span>
      </div>

      {/* Folder count grid */}
      <div>
        <h2 className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-4">
          Folders
        </h2>
        <div className="grid grid-cols-2 gap-3">
          {folders.map((folder) => (
            <div
              key={folder.id}
              className="bg-[#141414] border border-[#2A2A2A] rounded-xl px-4 py-3
                flex items-center justify-between"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Folder size={15} className="text-neutral-500 shrink-0" />
                <span className="text-sm text-neutral-300 truncate">{folder.name}</span>
              </div>
              <span className="text-xs font-mono text-neutral-600 shrink-0 ml-2">0</span>
            </div>
          ))}
        </div>
        {folders.length === 0 && (
          <p className="text-sm text-neutral-500 text-center py-8">
            No folders in this workspace.
          </p>
        )}
      </div>
    </div>
  );
}
