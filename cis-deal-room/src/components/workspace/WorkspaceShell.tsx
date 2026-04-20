'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ArrowLeft, Upload } from 'lucide-react';
import { fetchWithAuth } from '@/lib/fetch-with-auth';
import { Badge } from '@/components/ui/Badge';
import { Banner } from '@/components/ui/Banner';
import { Logo } from '@/components/ui/Logo';
import { UserMenu } from '@/components/ui/UserMenu';
import { FolderSidebar } from './FolderSidebar';
import { DealOverview } from './DealOverview';
import { RightPanel } from './RightPanel';
import { FileList } from './FileList';
import { UploadModal } from './UploadModal';
import { ParticipantFormModal } from './ParticipantFormModal';
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
  /** folderId → number of files (server-rendered at page load) */
  fileCounts: Record<string, number>;
  isAdmin: boolean;
  activeClientCount: number;
  userEmail: string;
}

const STATUS_OPTIONS: { value: WorkspaceStatus; label: string }[] = [
  { value: 'engagement', label: 'Engagement' },
  { value: 'active_dd', label: 'Active DD' },
  { value: 'ioi_stage', label: 'IOI Stage' },
  { value: 'closing', label: 'Closing' },
  { value: 'closed', label: 'Closed' },
  { value: 'archived', label: 'Archived' },
];

export function WorkspaceShell({ workspace, folders: initialFolders, fileCounts, isAdmin, activeClientCount, userEmail }: WorkspaceShellProps) {
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [status, setStatus] = useState<WorkspaceStatus>(workspace.status);
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [folders, setFolders] = useState(initialFolders);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadRevision, setUploadRevision] = useState(0);
  const [showInviteParticipant, setShowInviteParticipant] = useState(false);
  const [participantsRefresh, setParticipantsRefresh] = useState(0);

  async function handleStatusChange(newStatus: WorkspaceStatus) {
    const previous = status;
    // Optimistic update
    setStatus(newStatus);
    setStatusDropdownOpen(false);

    try {
      const res = await fetchWithAuth(`/api/workspaces/${workspace.id}/status`, {
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
    <div className="flex flex-col h-screen bg-bg overflow-hidden">
      {/* Header bar */}
      <header className="h-14 bg-surface border-b border-border flex items-center px-4 gap-4 shrink-0 z-10">
        {/* Back to deals + Logo */}
        <Link
          href="/deals"
          className="flex items-center gap-2 text-text-secondary hover:text-text-primary transition-colors"
          aria-label="Back to deal rooms"
        >
          <ArrowLeft size={16} />
          <Logo size="sm" inverse />
        </Link>

        {/* Deal name */}
        <span className="text-sm font-semibold text-text-primary truncate min-w-0 flex-1">
          {workspace.name}
        </span>

        {/* Status badge — clickable for admin */}
        {isAdmin ? (
          <div className="relative">
            <button
              onClick={() => setStatusDropdownOpen((prev) => !prev)}
              className="flex items-center gap-1.5 focus:outline-none focus:ring-2
                focus:ring-accent rounded cursor-pointer"
              aria-label="Change workspace status"
              aria-expanded={statusDropdownOpen}
              aria-haspopup="listbox"
            >
              <Badge status={status} />
              <ChevronDown size={12} className="text-text-muted" />
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
                  className="absolute right-0 top-full mt-1.5 z-20 bg-surface border
                    border-border rounded-lg shadow-md overflow-hidden min-w-[140px]"
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
                            ? 'text-accent-on-subtle bg-accent-subtle'
                            : 'text-text-secondary hover:text-text-primary hover:bg-surface-elevated'
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

        {/* Upload — persistent primary action */}
        <button
          type="button"
          onClick={() => setShowUploadModal(true)}
          disabled={folders.length === 0}
          className="flex items-center gap-1.5 bg-accent hover:bg-accent-hover text-text-inverse
            text-sm font-medium px-3 py-1.5 rounded-lg transition-colors cursor-pointer
            focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface
            disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label="Upload files"
          title={folders.length === 0 ? 'Create a folder first' : 'Upload files'}
        >
          <Upload size={14} aria-hidden="true" />
          <span className="hidden sm:inline">Upload</span>
        </button>

        {/* User avatar menu — far right */}
        <UserMenu userEmail={userEmail} />
      </header>

      {activeClientCount === 0 && (
        <Banner
          variant="warning"
          action={{
            label: 'Invite Client',
            onClick: () => setShowInviteParticipant(true),
          }}
        >
          No active Client participant. Invite one to progress the deal.
        </Banner>
      )}

      {/* Three-panel body */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left: Folder sidebar — 240px */}
        <div className="w-[240px] shrink-0 bg-surface border-r border-border overflow-y-auto hidden lg:flex lg:flex-col">
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
        <main className="flex-1 min-w-0 overflow-y-auto bg-surface-elevated border-x border-border">
          {selectedFolderId === null ? (
            <DealOverview
              workspace={workspace}
              status={status}
              folders={folders}
              fileCounts={fileCounts}
              onFolderSelect={setSelectedFolderId}
            />
          ) : (
            <FileList
              workspaceId={workspace.id}
              folderId={selectedFolderId}
              folderName={folders.find((f) => f.id === selectedFolderId)?.name ?? 'Files'}
              isAdmin={isAdmin}
              onUpload={() => setShowUploadModal(true)}
              uploadRevision={uploadRevision}
              folders={folders}
            />
          )}
        </main>

        {/* Right: RightPanel — 320px */}
        <div className="w-[320px] shrink-0 bg-surface border-l border-border overflow-y-auto hidden lg:flex lg:flex-col">
          <RightPanel
                workspaceId={workspace.id}
                cisAdvisorySide={workspace.cisAdvisorySide}
                folders={folders}
                isAdmin={isAdmin}
                participantsRefreshToken={participantsRefresh}
              />
        </div>
      </div>

      <UploadModal
        open={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        folders={folders}
        initialFolderId={selectedFolderId ?? undefined}
        workspaceId={workspace.id}
        onUploadComplete={() => {
          setShowUploadModal(false);
          setUploadRevision((n) => n + 1);
        }}
      />

      {showInviteParticipant && (
        <ParticipantFormModal
          mode="invite"
          open={showInviteParticipant}
          onClose={() => setShowInviteParticipant(false)}
          onSuccess={() => {
            setParticipantsRefresh((n) => n + 1);
            setShowInviteParticipant(false);
          }}
          workspaceId={workspace.id}
          cisAdvisorySide={workspace.cisAdvisorySide}
          folders={folders}
        />
      )}
    </div>
  );
}

