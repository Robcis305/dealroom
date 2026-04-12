'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { FolderSidebar } from './FolderSidebar';
import { DealOverview } from './DealOverview';
import { RightPanel } from './RightPanel';
import type { WorkspaceStatus } from '@/types';

interface Workspace {
  id: string;
  name: string;
  clientName: string;
  status: WorkspaceStatus;
  cisAdvisorySide: 'buyer_side' | 'seller_side';
  createdAt: Date | string;
  updatedAt: Date | string;
  createdBy: string;
}

interface Folder {
  id: string;
  workspaceId: string;
  name: string;
  sortOrder: number;
  createdAt: Date | string;
  updatedAt: Date | string;
}

interface WorkspaceShellProps {
  workspace: Workspace;
  folders: Folder[];
  isAdmin: boolean;
}

const STATUS_OPTIONS: { value: WorkspaceStatus; label: string }[] = [
  { value: 'engagement', label: 'Engagement' },
  { value: 'active_dd', label: 'Active DD' },
  { value: 'ioi_stage', label: 'IOI Stage' },
  { value: 'closing', label: 'Closing' },
  { value: 'closed', label: 'Closed' },
  { value: 'archived', label: 'Archived' },
];

export function WorkspaceShell({ workspace, folders: initialFolders, isAdmin }: WorkspaceShellProps) {
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [status, setStatus] = useState<WorkspaceStatus>(workspace.status);
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [folders, setFolders] = useState(initialFolders);

  async function handleStatusChange(newStatus: WorkspaceStatus) {
    const previous = status;
    // Optimistic update
    setStatus(newStatus);
    setStatusDropdownOpen(false);

    try {
      const res = await fetch(`/api/workspaces/${workspace.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        // Revert on failure
        setStatus(previous);
      }
    } catch {
      setStatus(previous);
    }
  }

  return (
    <div className="flex flex-col h-screen bg-[#0D0D0D] overflow-hidden">
      {/* Header bar */}
      <header className="h-14 bg-[#141414] border-b border-[#2A2A2A] flex items-center px-4 gap-4 shrink-0 z-10">
        {/* TODO: Replace with CIS Partners logo asset */}
        <div
          className="w-8 h-8 bg-[#1F1F1F] border border-[#2A2A2A] rounded flex items-center
            justify-center shrink-0"
          aria-label="CIS Partners logo placeholder"
        >
          <span className="text-xs font-bold text-[#E10600]">CIS</span>
        </div>

        {/* Deal name */}
        <span className="text-sm font-semibold text-white truncate min-w-0 flex-1">
          {workspace.name}
        </span>

        {/* Status badge — clickable for admin */}
        {isAdmin ? (
          <div className="relative">
            <button
              onClick={() => setStatusDropdownOpen((prev) => !prev)}
              className="flex items-center gap-1.5 focus:outline-none focus:ring-2
                focus:ring-[#E10600] rounded cursor-pointer"
              aria-label="Change workspace status"
              aria-expanded={statusDropdownOpen}
              aria-haspopup="listbox"
            >
              <Badge status={status} />
              <ChevronDown size={12} className="text-neutral-400" />
            </button>
            {statusDropdownOpen && (
              <>
                {/* Backdrop */}
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setStatusDropdownOpen(false)}
                />
                {/* Dropdown */}
                <div
                  className="absolute right-0 top-full mt-1.5 z-20 bg-[#1A1A1A] border
                    border-[#2A2A2A] rounded-lg shadow-xl overflow-hidden min-w-[140px]"
                  role="listbox"
                  aria-label="Select workspace status"
                >
                  {STATUS_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      role="option"
                      aria-selected={status === opt.value}
                      onClick={() => handleStatusChange(opt.value)}
                      className={`w-full text-left px-3 py-2 text-xs transition-colors
                        duration-100 cursor-pointer
                        ${
                          status === opt.value
                            ? 'text-[#E10600] bg-[#E10600]/10'
                            : 'text-neutral-300 hover:text-white hover:bg-[#2A2A2A]'
                        }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        ) : (
          <Badge status={status} />
        )}
      </header>

      {/* Three-panel body */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left: Folder sidebar — 240px */}
        <div className="w-[240px] shrink-0 overflow-y-auto">
          <FolderSidebar
            folders={folders}
            workspaceId={workspace.id}
            selectedFolderId={selectedFolderId}
            onFolderSelect={setSelectedFolderId}
            onFoldersChange={setFolders}
            isAdmin={isAdmin}
          />
        </div>

        {/* Center: flex-1 main area */}
        <main className="flex-1 min-w-0 overflow-y-auto bg-[#0D0D0D] border-x border-[#2A2A2A]">
          {selectedFolderId === null ? (
            <DealOverview
              workspace={workspace}
              status={status}
              folders={folders}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-neutral-500 text-sm">
              {/* File list UI is Phase 2 */}
              <div className="text-center">
                <p className="text-sm text-neutral-400">
                  {folders.find((f) => f.id === selectedFolderId)?.name ?? 'Folder'}
                </p>
                <p className="text-xs text-neutral-600 mt-1">
                  File upload and management available in next release.
                </p>
              </div>
            </div>
          )}
        </main>

        {/* Right: RightPanel — 320px */}
        <div className="w-[320px] shrink-0 overflow-y-auto">
          <RightPanel workspaceId={workspace.id} />
        </div>
      </div>
    </div>
  );
}
