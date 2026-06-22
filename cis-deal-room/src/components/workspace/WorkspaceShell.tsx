'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { ChevronDown, ArrowLeft, Upload, PanelRightOpen } from 'lucide-react';
import { fetchWithAuth } from '@/lib/fetch-with-auth';
import { Badge } from '@/components/ui/Badge';
import { Banner } from '@/components/ui/Banner';
import { Logo } from '@/components/ui/Logo';
import { UserMenu } from '@/components/ui/UserMenu';
import { FolderSidebar, type CenterView } from './FolderSidebar';
import { DealOverview } from './DealOverview';
import { RightPanel, type RightPanelTab } from './RightPanel';
import { FileList } from './FileList';
import { UploadModal } from './UploadModal';
import { ParticipantFormModal } from './ParticipantFormModal';
import { ChecklistView } from './ChecklistView';
import { WorkstreamDashboard } from './WorkstreamDashboard';
import { WorkstreamMembersModal } from './WorkstreamMembersModal';
import type { WorkspaceStatus, ParticipantRole, DealKillerGroup, PendingHighlight, WorkstreamWithCounts } from '@/types';

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
  /** folderId → number of files (server-rendered at page load; kept live client-side) */
  fileCounts: Record<string, number>;
  isAdmin: boolean;
  activeClientCount: number;
  userEmail: string;
  /** Current user's participant role in this workspace. Defaults to 'admin' for admins. */
  participantRole: ParticipantRole;
}

type FileCounts = Record<string, number>;

const STATUS_OPTIONS: { value: WorkspaceStatus; label: string }[] = [
  { value: 'engagement', label: 'Engagement' },
  { value: 'active_dd', label: 'Active DD' },
  { value: 'ioi_stage', label: 'IOI Stage' },
  { value: 'closing', label: 'Closing' },
  { value: 'closed', label: 'Closed' },
  { value: 'archived', label: 'Archived' },
];

export function WorkspaceShell({ workspace, folders: initialFolders, fileCounts: initialFileCounts, isAdmin, activeClientCount, userEmail, participantRole }: WorkspaceShellProps) {
  const [view, setView] = useState<CenterView>({ kind: 'overview' });
  const [status, setStatus] = useState<WorkspaceStatus>(workspace.status);
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [folders, setFolders] = useState(initialFolders);
  const [fileCounts, setFileCounts] = useState<FileCounts>(initialFileCounts);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadRevision, setUploadRevision] = useState(0);
  const [showInviteParticipant, setShowInviteParticipant] = useState(false);
  const [participantsRefresh, setParticipantsRefresh] = useState(0);
  const [hasChecklist, setHasChecklist] = useState(false);
  const [openChecklistCount, setOpenChecklistCount] = useState(0);
  const [checklistItems, setChecklistItems] = useState<Array<{ id: string; name: string; folderId: string | null }>>([]);
  const [uploadItemHint, setUploadItemHint] = useState<string | null>(null);
  const [pendingHighlight, setPendingHighlight] = useState<PendingHighlight | null>(null);
  const [panelWidth, setPanelWidth] = useState(320);
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [rightTab, setRightTab] = useState<RightPanelTab>('activity');
  const [folderAccessFocus, setFolderAccessFocus] = useState(0);
  const [workstreams, setWorkstreams] = useState<WorkstreamWithCounts[]>([]);
  const [manageWorkstreamId, setManageWorkstreamId] = useState<string | null>(null);
  const resizingRef = useRef(false);

  // Folder-header "Folder access" button: reveal the panel, switch to the
  // Participants tab, and force it to the "this folder" scope.
  const showFolderAccess = useCallback(() => {
    setPanelCollapsed(false);
    setRightTab('participants');
    setFolderAccessFocus((n) => n + 1);
  }, []);

  const startResize = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    resizingRef.current = true;
    const startX = e.clientX;
    const startWidth = panelWidth;
    function onMove(ev: PointerEvent) {
      if (!resizingRef.current) return;
      // Panel is on the right edge: dragging left (smaller clientX) widens it
      const delta = startX - ev.clientX;
      setPanelWidth(Math.min(600, Math.max(260, startWidth + delta)));
    }
    function onUp() {
      resizingRef.current = false;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      document.body.style.userSelect = '';
    }
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [panelWidth]);

  // Derived for backward-compat with UploadModal's initialFolderId
  const selectedFolderId = view.kind === 'folder' ? view.folderId : null;

  const refreshChecklistMeta = useCallback(async () => {
    try {
      const [checklistRes, foldersRes] = await Promise.all([
        fetchWithAuth(`/api/workspaces/${workspace.id}/checklist`),
        fetchWithAuth(`/api/workspaces/${workspace.id}/folders`),
      ]);

      if (foldersRes.ok) {
        // Checklist import auto-creates folders server-side; refreshing here
        // keeps the sidebar, UploadModal, and FileList name lookups in sync.
        const folderList = await foldersRes.json();
        setFolders(folderList);
      }

      if (!checklistRes.ok) return;
      const data = await checklistRes.json();
      setHasChecklist(!!data.checklist);

      // Two response shapes:
      //   - { checklist, items }                            ← buyer-side / view_only / no playbook
      //   - { checklist, playbook: { canonical, custom } }  ← seller-side / cis_team
      let normalized: Array<{ id: string; name: string; folderId: string | null; status: string }> = [];

      if (Array.isArray(data.items)) {
        normalized = (data.items as Array<{ id: string; name: string; folderId: string | null; status: string }>).map(
          (i) => ({ id: i.id, name: i.name, folderId: i.folderId, status: i.status }),
        );
      } else if (data.playbook) {
        // canonical rows: itemId may be null (virtual). Skip nulls — they have no DB row to upload against.
        const canonical = (
          data.playbook.canonical as Array<{ itemId: string | null; name: string; folderId: string | null; status: string }>
        )
          .filter((r) => r.itemId !== null)
          .map((r) => ({ id: r.itemId as string, name: r.name, folderId: r.folderId, status: r.status }));
        const custom = (
          data.playbook.custom as Array<{ itemId: string; name: string; folderId: string | null; status: string }>
        ).map((r) => ({ id: r.itemId, name: r.name, folderId: r.folderId, status: r.status }));
        normalized = [...canonical, ...custom];
      }

      const open = normalized.filter((i) => i.status === 'not_started' || i.status === 'in_progress').length;
      setOpenChecklistCount(open);
      setChecklistItems(
        normalized.map((i) => ({ id: i.id, name: i.name, folderId: i.folderId })),
      );
    } catch {
      // silently ignore — sidebar just won't show checklist meta
    }
  }, [workspace.id]);

  useEffect(() => {
    refreshChecklistMeta();
  }, [refreshChecklistMeta]);

  const refreshWorkstreams = useCallback(async () => {
    try {
      const res = await fetchWithAuth(`/api/workspaces/${workspace.id}/workstreams`);
      if (res.ok) {
        const { workstreams: ws } = await res.json();
        setWorkstreams(ws);
      }
    } catch { /* sidebar just won't show workstreams */ }
  }, [workspace.id]);

  useEffect(() => { refreshWorkstreams(); }, [refreshWorkstreams]);

  // Keep folder file counts live across uploads and soft-deletes.
  // Callers pass a signed delta (+N on upload, -N on delete, +N again on undo).
  function handleFolderCountChange(folderId: string, delta: number) {
    setFileCounts((prev) => {
      const current = prev[folderId] ?? 0;
      return { ...prev, [folderId]: Math.max(0, current + delta) };
    });
  }

  function handleUploadForItem(folderId: string | null, itemId: string, _itemName: string) {
    setUploadItemHint(itemId);
    if (folderId) {
      setView({ kind: 'folder', folderId });
    }
    // If folderId is null (canonical playbook item has no folder yet), open the
    // upload modal without pre-selecting a folder — the user picks one in the modal.
    setShowUploadModal(true);
  }

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
            selected={view}
            onSelect={setView}
            onFoldersChange={setFolders}
            isAdmin={isAdmin}
            hasChecklist={hasChecklist}
            openChecklistCount={openChecklistCount}
            fileCounts={fileCounts}
            onStructureChanged={refreshChecklistMeta}
            workstreams={workstreams}
            onManageWorkstreams={() => {
              if (view.kind === 'workstream') setManageWorkstreamId(view.workstreamId);
              else if (workstreams[0]) setView({ kind: 'workstream', workstreamId: workstreams[0].id });
            }}
          />
        </div>

        {/* Center: flex-1 main area */}
        <main className="flex-1 min-w-0 overflow-y-auto bg-surface-elevated border-x border-border">
          {view.kind === 'overview' ? (
            <DealOverview
              workspace={workspace}
              status={status}
              folders={folders}
              fileCounts={fileCounts}
              onFolderSelect={(folderId) => setView({ kind: 'folder', folderId })}
              isAdmin={isAdmin}
              role={participantRole}
              onOpenChecklist={() => setView({ kind: 'checklist' })}
              onChipClick={(group: DealKillerGroup) => {
                setPendingHighlight({ kind: 'deal_killer', group });
                setView({ kind: 'checklist' });
              }}
              onStageClick={(stage) => {
                setPendingHighlight({ kind: 'stage', stage });
                setView({ kind: 'checklist' });
              }}
            />
          ) : view.kind === 'checklist' ? (
            <ChecklistView
              workspaceId={workspace.id}
              isAdmin={isAdmin}
              onChanged={refreshChecklistMeta}
              onUploadForItem={handleUploadForItem}
              folders={folders}
              highlightTarget={pendingHighlight}
              onHighlightConsumed={() => setPendingHighlight(null)}
            />
          ) : view.kind === 'folder' ? (
            <FileList
              workspaceId={workspace.id}
              folderId={view.folderId}
              folderName={folders.find((f) => f.id === view.folderId)?.name ?? 'Files'}
              isAdmin={isAdmin}
              onUpload={() => setShowUploadModal(true)}
              uploadRevision={uploadRevision}
              folders={folders}
              onFolderCountChange={handleFolderCountChange}
              participantsRefresh={participantsRefresh}
              onShowFolderAccess={showFolderAccess}
              workstreams={workstreams}
              onWorkstreamsChanged={refreshWorkstreams}
            />
          ) : view.kind === 'workstream' ? (
            <WorkstreamDashboard
              workspaceId={workspace.id}
              workstreamId={view.workstreamId}
              isAdmin={isAdmin}
              onClearLens={() => setView({ kind: 'overview' })}
              onManageMembers={() => setManageWorkstreamId(view.workstreamId)}
            />
          ) : null}
        </main>

        {/* Right: resizable / collapsible RightPanel */}
        {panelCollapsed ? (
          <div className="hidden lg:flex flex-col w-10 shrink-0 bg-surface border-l border-border items-center pt-3">
            <button
              type="button"
              aria-label="Open side panel"
              title="Open side panel"
              onClick={() => setPanelCollapsed(false)}
              className="w-8 h-8 rounded flex items-center justify-center text-text-muted
                hover:text-text-primary hover:bg-surface-elevated transition-colors cursor-pointer
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <PanelRightOpen size={16} aria-hidden="true" />
            </button>
          </div>
        ) : (
          <div className="hidden lg:flex shrink-0">
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize side panel"
              onPointerDown={startResize}
              className="w-1.5 cursor-col-resize bg-border/40 hover:bg-accent/50 transition-colors"
            />
            <div
              style={{ width: panelWidth }}
              className="shrink-0 bg-surface border-l border-border overflow-y-auto flex flex-col"
            >
              <RightPanel
                workspaceId={workspace.id}
                cisAdvisorySide={workspace.cisAdvisorySide}
                folders={folders}
                isAdmin={isAdmin}
                participantsRefreshToken={participantsRefresh}
                currentUserEmail={userEmail}
                folderId={selectedFolderId}
                activeTab={rightTab}
                onTabChange={setRightTab}
                participantScopeToken={folderAccessFocus}
                onCollapse={() => setPanelCollapsed(true)}
              />
            </div>
          </div>
        )}
      </div>

      <UploadModal
        open={showUploadModal}
        onClose={() => {
          setShowUploadModal(false);
          setUploadItemHint(null);
        }}
        folders={folders}
        initialFolderId={selectedFolderId ?? undefined}
        workspaceId={workspace.id}
        onUploadComplete={() => {
          setShowUploadModal(false);
          setUploadItemHint(null);
          setUploadRevision((n) => n + 1);
        }}
        onFolderCountChange={handleFolderCountChange}
        initialChecklistItemId={uploadItemHint}
        checklistItems={checklistItems}
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

      {manageWorkstreamId && (
        <WorkstreamMembersModal
          workspaceId={workspace.id}
          workstreamId={manageWorkstreamId}
          workstreamName={workstreams.find((w) => w.id === manageWorkstreamId)?.name ?? 'Workstream'}
          onClose={() => setManageWorkstreamId(null)}
          onChanged={refreshWorkstreams}
        />
      )}
    </div>
  );
}

