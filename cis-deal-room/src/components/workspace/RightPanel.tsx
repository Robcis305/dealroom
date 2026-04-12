'use client';

import { useState } from 'react';
import { Activity, Users } from 'lucide-react';

interface RightPanelProps {
  workspaceId: string;
}

type Tab = 'activity' | 'participants';

export function RightPanel({ workspaceId: _workspaceId }: RightPanelProps) {
  // Activity tab is default on workspace entry (per CONTEXT.md)
  const [activeTab, setActiveTab] = useState<Tab>('activity');

  return (
    <div className="flex flex-col h-full bg-[#141414]">
      {/* Tab bar */}
      <div className="flex border-b border-[#2A2A2A] shrink-0">
        <TabButton
          id="activity"
          label="Activity"
          icon={<Activity size={14} />}
          active={activeTab === 'activity'}
          onClick={() => setActiveTab('activity')}
        />
        <TabButton
          id="participants"
          label="Participants"
          icon={<Users size={14} />}
          active={activeTab === 'participants'}
          onClick={() => setActiveTab('participants')}
        />
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'activity' ? (
          <ActivityPlaceholder />
        ) : (
          <ParticipantsPlaceholder />
        )}
      </div>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

interface TabButtonProps {
  id: Tab;
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
            ? 'text-[#E10600] border-[#E10600]'
            : 'text-neutral-400 border-transparent hover:text-white hover:border-[#2A2A2A]'
        }`}
      aria-selected={active}
      role="tab"
    >
      {icon}
      {label}
    </button>
  );
}

function ActivityPlaceholder() {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-center">
      <div className="w-10 h-10 rounded-full bg-[#1F1F1F] flex items-center justify-center mb-3">
        <Activity size={18} className="text-neutral-600" />
      </div>
      <p className="text-sm font-medium text-neutral-400">Activity feed</p>
      <p className="text-xs text-neutral-600 mt-1 leading-relaxed max-w-[180px]">
        Activity history will appear here. Available in a future release.
      </p>
    </div>
  );
}

function ParticipantsPlaceholder() {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-center">
      <div className="w-10 h-10 rounded-full bg-[#1F1F1F] flex items-center justify-center mb-3">
        <Users size={18} className="text-neutral-600" />
      </div>
      <p className="text-sm font-medium text-neutral-400">Participants</p>
      <p className="text-xs text-neutral-600 mt-1 leading-relaxed max-w-[180px]">
        Participant management will be available in a future release.
      </p>
    </div>
  );
}
