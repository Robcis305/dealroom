'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { NewDealModal } from './NewDealModal';
import type { WorkspaceStatus } from '@/types';

interface Workspace {
  id: string;
  name: string;
  clientName: string;
  status: WorkspaceStatus;
  cisAdvisorySide: 'buyer_side' | 'seller_side';
  createdAt: Date | string;
}

interface DealListProps {
  workspaces: Workspace[];
  isAdmin: boolean;
}

const ADVISORY_LABELS: Record<'buyer_side' | 'seller_side', string> = {
  buyer_side: 'Buyer-side',
  seller_side: 'Seller-side',
};

export function DealList({ workspaces, isAdmin }: DealListProps) {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-white">Deal Rooms</h1>
          <p className="text-sm text-neutral-400 mt-1">
            {workspaces.length === 0
              ? 'No deal rooms yet'
              : `${workspaces.length} deal room${workspaces.length === 1 ? '' : 's'}`}
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
          <div className="w-12 h-12 rounded-full bg-[#1F1F1F] flex items-center justify-center mb-4">
            <Building2 size={24} className="text-neutral-500" />
          </div>
          <h3 className="text-base font-medium text-white mb-1">
            No deal rooms
          </h3>
          <p className="text-sm text-neutral-400">
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

      {/* Workspace list */}
      {workspaces.length > 0 && (
        <div className="space-y-2">
          {workspaces.map((workspace) => (
            <button
              key={workspace.id}
              onClick={() => router.push(`/workspace/${workspace.id}`)}
              className="w-full text-left bg-[#141414] hover:bg-[#1A1A1A] border border-[#2A2A2A]
                hover:border-[#3A3A3A] rounded-xl px-5 py-4 transition-colors duration-150
                focus:outline-none focus:ring-2 focus:ring-[#E10600] cursor-pointer"
            >
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <span className="text-base font-medium text-white truncate">
                      {workspace.name}
                    </span>
                    <Badge status={workspace.status} />
                  </div>
                  <div className="flex items-center gap-4 text-xs text-neutral-400">
                    {isAdmin && (
                      <span>{workspace.clientName}</span>
                    )}
                    <span>{ADVISORY_LABELS[workspace.cisAdvisorySide]} Advisory</span>
                    <span className="font-mono">
                      {new Date(workspace.createdAt).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </span>
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* New Deal Modal */}
      <NewDealModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}
