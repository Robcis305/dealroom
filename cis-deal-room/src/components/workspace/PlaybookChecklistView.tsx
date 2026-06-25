'use client';

import { useState, useEffect } from 'react';
import { ChevronDown, ChevronRight, AlertCircle, Plus, Upload } from 'lucide-react';
import clsx from 'clsx';
import type {
  PlaybookCategory,
  ChecklistStatus,
  ChecklistOwner,
  ChecklistPriority,
  DealKillerGroup,
  PendingHighlight,
  Stage,
} from '@/types';
import { CATEGORY_TO_STAGE, STAGE_META } from '@/lib/dal/playbook';
import { ChecklistStatusChip } from './ChecklistStatusChip';
import { ChecklistItemEditModal } from './ChecklistItemEditModal';

interface CanonicalRow {
  playbookItemId: string;
  number: number;
  category: PlaybookCategory;
  name: string;
  rationale: string;
  dealKillerGroup: DealKillerGroup | null;
  defaultPriority: ChecklistPriority;
  sortOrder: number;
  itemId: string | null;
  status: ChecklistStatus;
  owner: ChecklistOwner;
  priority: ChecklistPriority;
  notes: string | null;
  receivedAt: Date | string | null;
  folderId: string | null;
}

interface CustomRow {
  itemId: string;
  category: PlaybookCategory;
  name: string;
  status: ChecklistStatus;
  owner: ChecklistOwner;
  priority: ChecklistPriority;
  notes: string | null;
  folderId: string | null;
  sortOrder: number;
}

interface Props {
  workspaceId: string;
  isAdmin: boolean;
  canonical: CanonicalRow[];
  custom: CustomRow[];
  folders: Array<{ id: string; name: string }>;
  onChanged: () => void;
  onUploadForItem: (itemId: string, name: string) => void;
  /** When set, scrolls the matching item into view and pulses it. */
  highlightTarget?: PendingHighlight | null;
  onHighlightConsumed?: () => void;
}

const CATEGORY_LABEL: Record<PlaybookCategory, string> = {
  corporate_legal: 'Corporate & Legal',
  financial: 'Financial',
  commercial: 'Commercial & Customer',
  team_hr: 'Team & HR',
  ip_technical: 'IP & Technical',
  operations_risk: 'Operations & Risk',
};

const CATEGORY_ORDER: PlaybookCategory[] = [
  'corporate_legal',
  'financial',
  'commercial',
  'team_hr',
  'ip_technical',
  'operations_risk',
];

export function PlaybookChecklistView({
  workspaceId,
  isAdmin,
  canonical,
  custom,
  folders,
  onChanged,
  onUploadForItem,
  highlightTarget,
  onHighlightConsumed,
}: Props) {
  useEffect(() => {
    if (!highlightTarget) return;

    let target: HTMLElement | null = null;
    if (highlightTarget.kind === 'deal_killer') {
      target = document.querySelector<HTMLElement>(
        `[data-deal-killer-group="${highlightTarget.group}"]`,
      );
    } else if (highlightTarget.kind === 'stage') {
      target = document.querySelector<HTMLElement>(
        `[data-stage="${highlightTarget.stage}"][data-stage-first="true"]`,
      );
    }

    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      target.classList.add('ring-2', 'ring-accent', 'ring-offset-2', 'ring-offset-black');
      const timer = setTimeout(() => {
        target!.classList.remove('ring-2', 'ring-accent', 'ring-offset-2', 'ring-offset-black');
        onHighlightConsumed?.();
      }, 2000);
      return () => clearTimeout(timer);
    }
    onHighlightConsumed?.();
  }, [highlightTarget, onHighlightConsumed]);

  return (
    <div className="px-8 pt-6 pb-12 max-w-5xl">
      <h2 className="text-lg font-semibold text-text-primary mb-1">Diligence Playbook</h2>
      <p className="text-sm text-text-muted mb-6">
        48-item Data Room Construction Playbook. Resolve every item before sharing the room.
      </p>

      {CATEGORY_ORDER.map((cat, idx) => {
        const items = canonical.filter((c) => c.category === cat);
        const customItems = custom.filter((c) => c.category === cat);
        items.sort((a, b) => {
          if (!!a.dealKillerGroup !== !!b.dealKillerGroup) {
            return a.dealKillerGroup ? -1 : 1;
          }
          return a.sortOrder - b.sortOrder;
        });

        const stage = CATEGORY_TO_STAGE[cat];
        const prevCat = idx > 0 ? CATEGORY_ORDER[idx - 1] : null;
        const isFirstInStage = !prevCat || CATEGORY_TO_STAGE[prevCat] !== stage;

        return (
          <CategorySection
            key={cat}
            category={cat}
            label={CATEGORY_LABEL[cat]}
            stage={stage}
            isFirstInStage={isFirstInStage}
            items={items}
            customItems={customItems}
            isAdmin={isAdmin}
            workspaceId={workspaceId}
            folders={folders}
            onChanged={onChanged}
            onUploadForItem={onUploadForItem}
          />
        );
      })}
    </div>
  );
}

interface CategorySectionProps {
  category: PlaybookCategory;
  label: string;
  stage: Stage;
  isFirstInStage: boolean;
  items: CanonicalRow[];
  customItems: CustomRow[];
  isAdmin: boolean;
  workspaceId: string;
  folders: Array<{ id: string; name: string }>;
  onChanged: () => void;
  onUploadForItem: (itemId: string, name: string) => void;
}

function CategorySection({
  category,
  label,
  stage,
  isFirstInStage,
  items,
  customItems,
  isAdmin,
  workspaceId,
  folders,
  onChanged,
  onUploadForItem,
}: CategorySectionProps) {
  const [showAddModal, setShowAddModal] = useState(false);
  const meta = STAGE_META[stage];

  return (
    <section
      className={clsx('mb-8', isFirstInStage ? 'pt-6' : 'pt-2')}
      data-stage={stage}
      data-stage-first={isFirstInStage ? 'true' : 'false'}
    >
      {isFirstInStage && (
        <div className="text-[10px] font-mono font-normal text-text-muted/70 uppercase tracking-[0.15em] mb-0.5">
          Stage {stage} · {meta.dayRange}
        </div>
      )}
      <h3 className="text-xs font-medium text-text-muted uppercase tracking-wider mb-3">
        {label}
      </h3>
      <div className="border border-border rounded-xl divide-y divide-border bg-surface">
        {items.map((item) => (
          <PlaybookItemRow
            key={item.playbookItemId}
            item={item}
            isAdmin={isAdmin}
            workspaceId={workspaceId}
            onChanged={onChanged}
            onUploadForItem={onUploadForItem}
          />
        ))}
        {customItems.map((item) => (
          <CustomItemRow
            key={item.itemId}
            item={item}
            isAdmin={isAdmin}
            workspaceId={workspaceId}
            onChanged={onChanged}
            onUploadForItem={onUploadForItem}
          />
        ))}
      </div>
      {isAdmin && (
        <button
          className="mt-3 flex items-center gap-2 text-xs text-text-muted hover:text-text-secondary transition-colors cursor-pointer"
          onClick={() => setShowAddModal(true)}
        >
          <Plus size={12} />
          Add custom item
        </button>
      )}
      {showAddModal && (
        <ChecklistItemEditModal
          mode="create"
          workspaceId={workspaceId}
          defaultCategory={category}
          folders={folders}
          onClose={() => setShowAddModal(false)}
          onSaved={() => { setShowAddModal(false); onChanged(); }}
        />
      )}
    </section>
  );
}

interface PlaybookItemRowProps {
  item: CanonicalRow;
  isAdmin: boolean;
  workspaceId: string;
  onChanged: () => void;
  onUploadForItem: (itemId: string, name: string) => void;
}

function PlaybookItemRow({
  item,
  isAdmin,
  workspaceId,
  onChanged,
  onUploadForItem,
}: PlaybookItemRowProps) {
  const [expanded, setExpanded] = useState(false);
  const isKiller = !!item.dealKillerGroup;

  return (
    <div
      data-testid="playbook-item"
      data-deal-killer-group={item.dealKillerGroup ?? undefined}
      className={clsx(
        'p-4 flex flex-col gap-2 transition-shadow',
        isKiller && 'border-l-2 border-l-accent',
      )}
    >
      <div className="flex items-start gap-3">
        <button
          aria-label={expanded ? 'Collapse' : 'Expand'}
          onClick={() => setExpanded((v) => !v)}
          className="text-text-muted hover:text-text-secondary mt-0.5"
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        <span className="text-xs font-mono text-text-muted shrink-0 mt-0.5 w-6 text-right">
          {item.number}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {isKiller && (
              <span
                title="Deal-killer"
                className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-accent"
              >
                <AlertCircle size={10} />
                Deal-killer
              </span>
            )}
            <span className="text-sm text-text-primary">{item.name}</span>
          </div>
          {expanded && (
            <p className="text-xs text-text-secondary mt-2 leading-relaxed">
              <span className="font-semibold">Why investors check this:</span> {item.rationale}
            </p>
          )}
        </div>
        <div className="shrink-0 flex items-center gap-2">
          {item.itemId && (
            <button
              type="button"
              aria-label={`Upload for ${item.name}`}
              title="Upload document for this item"
              onClick={() => onUploadForItem(item.itemId!, item.name)}
              className="text-text-muted hover:text-accent transition-colors cursor-pointer"
            >
              <Upload size={14} />
            </button>
          )}
          <ChecklistStatusChip
            workspaceId={workspaceId}
            itemId={item.itemId ?? `pb:${item.playbookItemId}`}
            status={item.status}
            isAdmin={isAdmin}
            onChanged={onChanged}
            playbookItemId={item.itemId ? null : item.playbookItemId}
          />
        </div>
      </div>
    </div>
  );
}

interface CustomItemRowProps {
  item: CustomRow;
  isAdmin: boolean;
  workspaceId: string;
  onChanged: () => void;
  onUploadForItem: (itemId: string, name: string) => void;
}

function CustomItemRow({
  item,
  isAdmin,
  workspaceId,
  onChanged,
  onUploadForItem,
}: CustomItemRowProps) {
  return (
    <div data-testid="playbook-item-custom" className="p-4 flex items-center gap-3">
      <span className="text-[10px] font-medium uppercase tracking-wider text-text-muted shrink-0">
        Custom
      </span>
      <span className="text-sm text-text-primary flex-1 min-w-0 truncate">{item.name}</span>
      <button
        type="button"
        aria-label={`Upload for ${item.name}`}
        title="Upload document for this item"
        onClick={() => onUploadForItem(item.itemId, item.name)}
        className="text-text-muted hover:text-accent transition-colors cursor-pointer shrink-0"
      >
        <Upload size={14} />
      </button>
      <ChecklistStatusChip
        workspaceId={workspaceId}
        itemId={item.itemId}
        status={item.status}
        isAdmin={isAdmin}
        onChanged={onChanged}
        playbookItemId={null}
      />
    </div>
  );
}
