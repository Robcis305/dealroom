'use client';

import { useMemo, useState } from 'react';
import { Filter as FilterIcon } from 'lucide-react';
import clsx from 'clsx';
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
const STATUS_LABEL: Record<ChecklistStatus, string> = {
  not_started: 'Not Started', in_progress: 'In Progress', received: 'Received', waived: 'Waived', n_a: 'N/A',
};

const TERMINAL_STATUSES: ReadonlyArray<ChecklistStatus> = ['received', 'waived', 'n_a'];

interface FilterState {
  category: Set<string>;
  priority: Set<ChecklistPriority>;
  owner: Set<ChecklistOwner>;
  status: Set<ChecklistStatus>;
}

function emptyFilters(): FilterState {
  return {
    category: new Set(),
    priority: new Set(),
    owner: new Set(),
    status: new Set(),
  };
}

function isAnyFilterActive(f: FilterState): boolean {
  return f.category.size > 0 || f.priority.size > 0 || f.owner.size > 0 || f.status.size > 0;
}

export function ChecklistTable({ workspaceId, items, isAdmin, onChanged, onUploadForItem, folders }: Props) {
  const [filters, setFilters] = useState<FilterState>(emptyFilters);

  const categoryOptions = useMemo(
    () => Array.from(new Set(items.map((i) => i.category))).sort(),
    [items],
  );
  const priorityOptions = useMemo(
    () => Array.from(new Set(items.map((i) => i.priority))) as ChecklistPriority[],
    [items],
  );
  const ownerOptions = useMemo(
    () => Array.from(new Set(items.map((i) => i.owner))) as ChecklistOwner[],
    [items],
  );
  const statusOptions = useMemo(
    () => Array.from(new Set(items.map((i) => i.status))) as ChecklistStatus[],
    [items],
  );

  const filtered = useMemo(() => {
    return items.filter((it) => {
      if (filters.category.size > 0 && !filters.category.has(it.category)) return false;
      if (filters.priority.size > 0 && !filters.priority.has(it.priority)) return false;
      if (filters.owner.size > 0 && !filters.owner.has(it.owner)) return false;
      if (filters.status.size > 0 && !filters.status.has(it.status)) return false;
      return true;
    });
  }, [items, filters]);

  function toggleFilterValue<K extends keyof FilterState>(key: K, value: FilterState[K] extends Set<infer V> ? V : never) {
    setFilters((prev) => {
      const next: FilterState = {
        category: new Set(prev.category),
        priority: new Set(prev.priority),
        owner: new Set(prev.owner),
        status: new Set(prev.status),
      };
      const set = next[key] as Set<typeof value>;
      if (set.has(value)) set.delete(value);
      else set.add(value);
      return next;
    });
  }

  function clearFilters() {
    setFilters(emptyFilters());
  }

  if (items.length === 0) {
    return <p className="p-8 text-sm text-text-muted">No checklist items visible.</p>;
  }

  return (
    <div className="p-6">
      {isAnyFilterActive(filters) && (
        <div className="mb-3 flex items-center gap-3 text-xs text-text-muted">
          <span>
            Showing {filtered.length} of {items.length}
          </span>
          <button
            onClick={clearFilters}
            className="text-accent hover:underline cursor-pointer"
          >
            Clear filters
          </button>
        </div>
      )}
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-xs uppercase text-text-muted tracking-wider border-b border-border">
            <th className="text-left font-medium py-2 px-2 w-10">#</th>
            <th className="text-left font-medium py-2 px-2">
              <ColumnHeader
                label="Category"
                options={categoryOptions.map((v) => ({ value: v, label: v }))}
                selected={filters.category}
                onToggle={(v) => toggleFilterValue('category', v)}
              />
            </th>
            <th className="text-left font-medium py-2 px-2">Item</th>
            <th className="text-left font-medium py-2 px-2">
              <ColumnHeader
                label="Priority"
                options={priorityOptions.map((v) => ({ value: v, label: PRIORITY_LABEL[v] }))}
                selected={filters.priority}
                onToggle={(v) => toggleFilterValue('priority', v)}
              />
            </th>
            <th className="text-left font-medium py-2 px-2">
              <ColumnHeader
                label="Owner"
                options={ownerOptions.map((v) => ({ value: v, label: OWNER_LABEL[v] }))}
                selected={filters.owner}
                onToggle={(v) => toggleFilterValue('owner', v)}
              />
            </th>
            <th className="text-left font-medium py-2 px-2">
              <ColumnHeader
                label="Status"
                options={statusOptions.map((v) => ({ value: v, label: STATUS_LABEL[v] }))}
                selected={filters.status}
                onToggle={(v) => toggleFilterValue('status', v)}
              />
            </th>
            {isAdmin && <th className="w-10" />}
          </tr>
        </thead>
        <tbody>
          {filtered.map((it) => {
            const isTerminal = (TERMINAL_STATUSES as ReadonlyArray<string>).includes(it.status);
            return (
              <tr key={it.id} className="border-b border-border-subtle hover:bg-surface">
                <td className="py-2 px-2 font-mono text-xs text-text-muted">{it.sortOrder}</td>
                <td className="py-2 px-2 text-text-secondary">{it.category}</td>
                <td className="py-2 px-2">
                  {isTerminal ? (
                    <span
                      className="text-text-muted"
                      title={`${STATUS_LABEL[it.status]} — no further uploads needed`}
                    >
                      {it.name}
                    </span>
                  ) : (
                    <button
                      onClick={() => onUploadForItem(it)}
                      className="text-left text-text-primary hover:text-accent hover:underline cursor-pointer"
                    >
                      {it.name}
                    </button>
                  )}
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
            );
          })}
          {filtered.length === 0 && (
            <tr>
              <td colSpan={isAdmin ? 7 : 6} className="py-8 text-center text-text-muted text-sm">
                No items match the current filters.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

interface ColumnHeaderProps<V extends string> {
  label: string;
  options: Array<{ value: V; label: string }>;
  selected: Set<V>;
  onToggle: (value: V) => void;
}

function ColumnHeader<V extends string>({ label, options, selected, onToggle }: ColumnHeaderProps<V>) {
  const [open, setOpen] = useState(false);
  const active = selected.size > 0;

  return (
    <div className="relative inline-flex items-center gap-1">
      <span>{label}</span>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={`Filter ${label}`}
        className={clsx(
          'p-0.5 rounded transition-colors cursor-pointer focus:outline-none focus:ring-1 focus:ring-accent',
          active ? 'text-accent' : 'text-text-muted hover:text-text-primary',
        )}
      >
        <FilterIcon size={12} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1 z-20 bg-surface border border-border rounded-lg shadow-md overflow-hidden min-w-[180px] normal-case tracking-normal">
            <div className="max-h-60 overflow-y-auto">
              {options.map((opt) => {
                const checked = selected.has(opt.value);
                return (
                  <label
                    key={opt.value}
                    className="flex items-center gap-2 px-3 py-1.5 text-xs text-text-secondary hover:bg-surface-elevated cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onToggle(opt.value)}
                      className="accent-accent"
                    />
                    <span className="text-text-primary">{opt.label}</span>
                  </label>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
