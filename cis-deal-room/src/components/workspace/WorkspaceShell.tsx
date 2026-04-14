'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { fetchWithAuth } from '@/lib/fetch-with-auth';
import { Badge } from '@/components/ui/Badge';
import { Banner } from '@/components/ui/Banner';
import { Logo } from '@/components/ui/Logo';
import { FolderSidebar } from './FolderSidebar';
import { DealOverview } from './DealOverview';
import { RightPanel } from './RightPanel';
import { FileList } from './FileList';
import { UploadModal } from './UploadModal';
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
  notificationDigest: boolean;
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

export function WorkspaceShell({ workspace, folders: initialFolders, fileCounts, isAdmin, activeClientCount, notificationDigest, userEmail }: WorkspaceShellProps) {
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [status, setStatus] = useState<WorkspaceStatus>(workspace.status);
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [folders, setFolders] = useState(initialFolders);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadRevision, setUploadRevision] = useState(0);

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
          <Logo size="sm" />
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
                            ? 'text-accent bg-accent-subtle'
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

        {/* User avatar menu — far right */}
        <UserMenu notificationDigest={notificationDigest} userEmail={userEmail} />
      </header>

      {activeClientCount === 0 && (
        <Banner
          variant="warning"
          action={{
            label: 'Invite Client',
            onClick: () => {
              toast.info('Click Participants tab → Invite Participant → select Client');
            },
          }}
        >
          No active Client participant. Invite one to progress the deal.
        </Banner>
      )}

      {/* Three-panel body */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left: Folder sidebar — 240px */}
        <div className="w-[240px] shrink-0 bg-surface border-r border-border overflow-y-auto">
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
              folderId={selectedFolderId}
              folderName={folders.find((f) => f.id === selectedFolderId)?.name ?? 'Files'}
              isAdmin={isAdmin}
              onUpload={() => setShowUploadModal(true)}
              uploadRevision={uploadRevision}
            />
          )}
        </main>

        {/* Right: RightPanel — 320px */}
        <div className="w-[320px] shrink-0 bg-surface border-l border-border overflow-y-auto">
          <RightPanel
                workspaceId={workspace.id}
                cisAdvisorySide={workspace.cisAdvisorySide}
                folders={folders}
                isAdmin={isAdmin}
                participantsRefreshToken={0}
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
    </div>
  );
}

function UserMenu({ notificationDigest, userEmail }: { notificationDigest: boolean; userEmail: string }) {
  const [open, setOpen] = useState(false);
  const [digest, setDigest] = useState(notificationDigest);
  const [saving, setSaving] = useState(false);

  async function toggle() {
    const newValue = !digest;
    setSaving(true);
    setDigest(newValue); // optimistic
    try {
      const res = await fetchWithAuth('/api/user/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationDigest: newValue }),
      });
      if (!res.ok) {
        setDigest(!newValue); // revert
        toast.error('Failed to update preference');
      } else {
        toast.success(`Email notifications set to ${newValue ? 'Daily digest' : 'Instant'}`);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="w-8 h-8 rounded-full bg-surface-sunken border border-border text-text-primary text-xs font-semibold flex items-center justify-center"
        aria-label="User menu"
      >
        {userEmail.charAt(0).toUpperCase()}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1.5 z-20 bg-surface border border-border rounded-lg shadow-md min-w-[220px] p-3">
            <p className="text-xs text-text-muted mb-2">{userEmail}</p>
            <label className="flex items-center gap-2 text-sm text-text-primary cursor-pointer">
              <input type="checkbox" checked={digest} onChange={toggle} disabled={saving} />
              Daily digest (vs. instant)
            </label>
          </div>
        </>
      )}
    </div>
  );
}
