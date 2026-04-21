'use client';

import type { ChecklistPriority, ChecklistOwner, ChecklistStatus } from '@/types';
import { ChecklistStatusChip } from './ChecklistStatusChip';
import { ChecklistRowActions } from './ChecklistRowActions';

export interface ChecklistItemRow {
  id: string;
  sortOrder: number;
  category: string;
  folderId: string;
  name: string;
  description: string | null;
  priority: ChecklistPriority;
  owner: ChecklistOwner;
  status: ChecklistStatus;
  notes: string | null;
  requestedAt: string;
  receivedAt: string | null;
}

interface Props {
  workspaceId: string;
  items: ChecklistItemRow[];
  isAdmin: boolean;
  onChanged: () => void;
  onUploadForItem: (item: ChecklistItemRow) => void;
  folders: Array<{ id: string; name: string }>;
}

const PRIORITY_LABEL: Record<ChecklistPriority, string> = {
  critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low',
};
const OWNER_LABEL: Record<ChecklistOwner, string> = {
  seller: 'Seller', buyer: 'Buyer', both: 'Both', cis_team: 'CIS Team', unassigned: 'Unassigned',
};

export function ChecklistTable({ workspaceId, items, isAdmin, onChanged, onUploadForItem, folders }: Props) {
  if (items.length === 0) {
    return <p className="p-8 text-sm text-text-muted">No checklist items visible.</p>;
  }

  return (
    <div className="p-6">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-xs uppercase text-text-muted tracking-wider border-b border-border">
            <th className="text-left font-medium py-2 px-2 w-10">#</th>
            <th className="text-left font-medium py-2 px-2">Category</th>
            <th className="text-left font-medium py-2 px-2">Item</th>
            <th className="text-left font-medium py-2 px-2">Priority</th>
            <th className="text-left font-medium py-2 px-2">Owner</th>
            <th className="text-left font-medium py-2 px-2">Status</th>
            {isAdmin && <th className="w-10" />}
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.id} className="border-b border-border-subtle hover:bg-surface">
              <td className="py-2 px-2 font-mono text-xs text-text-muted">{it.sortOrder}</td>
              <td className="py-2 px-2 text-text-secondary">{it.category}</td>
              <td className="py-2 px-2">
                <button
                  onClick={() => onUploadForItem(it)}
                  className="text-left text-text-primary hover:text-accent hover:underline cursor-pointer"
                >
                  {it.name}
                </button>
              </td>
              <td className="py-2 px-2 text-text-secondary">{PRIORITY_LABEL[it.priority]}</td>
              <td className="py-2 px-2 text-text-secondary">{OWNER_LABEL[it.owner]}</td>
              <td className="py-2 px-2">
                <ChecklistStatusChip
                  workspaceId={workspaceId}
                  itemId={it.id}
                  status={it.status}
                  isAdmin={isAdmin}
                  onChanged={onChanged}
                />
              </td>
              {isAdmin && (
                <td className="py-2 px-2">
                  <ChecklistRowActions
                    workspaceId={workspaceId}
                    item={it}
                    folders={folders}
                    onChanged={onChanged}
                  />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
