'use client';

import { useState, useMemo } from 'react';
import { Plus, Building2, Search } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { NewDealModal } from './NewDealModal';
import { DealCard } from './DealCard';
import type { WorkspaceStatus } from '@/types';


interface Workspace {
  id: string;
  name: string;
  clientName: string;
  status: WorkspaceStatus;
  cisAdvisorySide: 'buyer_side' | 'seller_side';
  createdAt: Date | string;
  updatedAt: Date | string;
  docCount: number;
  participantCount: number;
  lastActivityAction: string | null;
  lastActivityAt: Date | string | null;
}

interface DealListProps {
  workspaces: Workspace[];
  isAdmin: boolean;
}

export function DealList({ workspaces, isAdmin }: DealListProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [search, setSearch] = useState('');
  // 'active' is a pseudo-filter meaning "any status except archived". It's
  // the default so archived deals are hidden from the main list unless the
  // admin explicitly picks Archived or All statuses.
  const [statusFilter, setStatusFilter] = useState<WorkspaceStatus | 'all' | 'active'>('active');

  const filtered = useMemo(() => {
    const lower = search.toLowerCase();
    return workspaces.filter((w) => {
      const matchesSearch =
        lower === '' ||
        w.name.toLowerCase().includes(lower) ||
        (w.clientName && w.clientName.toLowerCase().includes(lower));
      let matchesStatus: boolean;
      if (statusFilter === 'all') matchesStatus = true;
      else if (statusFilter === 'active') matchesStatus = w.status !== 'archived';
      else matchesStatus = w.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [workspaces, search, statusFilter]);

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Deal Rooms</h1>
          <p className="text-sm text-text-muted mt-1">
            {workspaces.length === 0
              ? 'No deal rooms yet'
              : filtered.length === workspaces.length
                ? `${workspaces.length} deal room${workspaces.length === 1 ? '' : 's'}`
                : `${filtered.length} of ${workspaces.length} deal rooms`}
          </p>
        </div>
        {isAdmin && (
          <Button
            variant="primary"
            size="md"
            onClick={() => setModalOpen(true)}
          >
            <Plus size={16} className="mr-2" />
            New Deal Room
          </Button>
        )}
      </div>

      {/* Empty state */}
      {workspaces.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-12 h-12 rounded-full bg-surface-elevated flex items-center justify-center mb-4">
            <Building2 size={24} className="text-text-muted" />
          </div>
          <h3 className="text-base font-medium text-text-primary mb-1">
            No deal rooms
          </h3>
          <p className="text-sm text-text-muted">
            {isAdmin
              ? 'Create your first deal room to get started.'
              : 'You have not been assigned to any deal rooms yet.'}
          </p>
          {isAdmin && (
            <Button
              variant="primary"
              size="md"
              className="mt-6"
              onClick={() => setModalOpen(true)}
            >
              <Plus size={16} className="mr-2" />
              New Deal Room
            </Button>
          )}
        </div>
      )}

      {/* Filters bar */}
      {workspaces.length > 0 && (
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              placeholder="Search deals..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm bg-surface-sunken border border-border rounded-lg
                text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as WorkspaceStatus | 'all' | 'active')}
            className="px-3 py-2 text-sm bg-surface-sunken border border-border rounded-lg
              text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
          >
            <option value="active">Active (excludes archived)</option>
            <option value="all">All statuses</option>
            <option value="engagement">Engagement</option>
            <option value="active_dd">Active DD</option>
            <option value="ioi_stage">IOI Stage</option>
            <option value="closing">Closing</option>
            <option value="closed">Closed</option>
            <option value="archived">Archived</option>
          </select>
        </div>
      )}

      {/* Card grid / empty states */}
      {workspaces.length > 0 && (
        filtered.length === 0 ? (
          <div className="text-center py-16 text-text-muted">
            No deals match your filters.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((w) => (
              <DealCard
                key={w.id}
                id={w.id}
                name={w.name}
                clientName={w.clientName}
                status={w.status}
                docCount={w.docCount}
                participantCount={w.participantCount}
                lastActivityAction={w.lastActivityAction}
                lastActivityAt={w.lastActivityAt}
                isAdmin={isAdmin}
              />
            ))}
          </div>
        )
      )}

      {/* New Deal Modal */}
      <NewDealModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}
