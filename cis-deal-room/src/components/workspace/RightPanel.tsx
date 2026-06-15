'use client';

import { useState } from 'react';
import { Activity, Users, PanelRightClose } from 'lucide-react';
import { ParticipantList } from './ParticipantList';
import { ActivityFeed } from './ActivityFeed';
import type { CisAdvisorySide } from '@/types';

interface Folder {
  id: string;
  name: string;
}

interface RightPanelProps {
  workspaceId: string;
  cisAdvisorySide: CisAdvisorySide;
  folders: Folder[];
  isAdmin: boolean;
  /** Parent increments to force a participant refetch */
  participantsRefreshToken: number;
  /** Current viewer's email — used to hide self-edit/self-revoke buttons */
  currentUserEmail: string;
  /** The open folder (if any) — scopes the Participants tab */
  folderId?: string | null;
  /** Display name of the open folder */
  folderName?: string | null;
  /** When provided, renders a collapse button in the tab bar */
  onCollapse?: () => void;
}

type Tab = 'activity' | 'participants';

export function RightPanel({
  workspaceId,
  cisAdvisorySide,
  folders,
  isAdmin,
  participantsRefreshToken,
  currentUserEmail,
  folderId,
  folderName,
  onCollapse,
}: RightPanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>('activity');

  return (
    <div className="flex flex-col h-full bg-surface">
      <div className="flex items-center border-b border-border shrink-0">
        <TabButton
          label="Activity"
          icon={<Activity size={14} />}
          active={activeTab === 'activity'}
          onClick={() => setActiveTab('activity')}
        />
        <TabButton
          label="Participants"
          icon={<Users size={14} />}
          active={activeTab === 'participants'}
          onClick={() => setActiveTab('participants')}
        />
        {onCollapse && (
          <button
            type="button"
            onClick={onCollapse}
            aria-label="Collapse side panel"
            title="Collapse panel"
            className="ml-auto mr-1 w-8 h-8 rounded flex items-center justify-center
              text-text-muted hover:text-text-primary hover:bg-surface-elevated
              transition-colors cursor-pointer
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <PanelRightClose size={16} aria-hidden="true" />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'activity' ? (
          <ActivityFeed workspaceId={workspaceId} />
        ) : (
          <ParticipantList
            workspaceId={workspaceId}
            cisAdvisorySide={cisAdvisorySide}
            folders={folders}
            isAdmin={isAdmin}
            refreshToken={participantsRefreshToken}
            currentUserEmail={currentUserEmail}
            folderId={folderId}
            folderName={folderName}
          />
        )}
      </div>
    </div>
  );
}

interface TabButtonProps {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
}

function TabButton({ label, icon, active, onClick }: TabButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-4 py-3 text-xs font-medium
        border-b-2 transition-colors duration-150 cursor-pointer focus:outline-none
        ${
          active
            ? 'text-accent border-accent'
            : 'text-text-secondary border-transparent hover:text-text-primary'
        }`}
      aria-selected={active}
      role="tab"
    >
      {icon}
      {label}
    </button>
  );
}

