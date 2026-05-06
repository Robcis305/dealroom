import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { playbookItems, checklistItems } from '@/db/schema';
import type {
  ChecklistOwner,
  ChecklistPriority,
  ChecklistStatus,
} from '@/types';

export type PlaybookCategory =
  | 'corporate_legal'
  | 'financial'
  | 'commercial'
  | 'team_hr'
  | 'ip_technical'
  | 'operations_risk';

export type DealKillerGroup =
  | 'cap_table'
  | 'eighty_three_b'
  | 'customer_coc'
  | 'ip_assignment'
  | 'revenue_bridge';

export type Stage = 1 | 2 | 3 | 4;

export const CATEGORY_TO_STAGE: Record<PlaybookCategory, Stage> = {
  corporate_legal: 1,
  financial: 2,
  commercial: 3,
  team_hr: 4,
  ip_technical: 4,
  operations_risk: 4,
};

export const STAGE_META: Record<Stage, { label: string; dayRange: string }> = {
  1: { label: 'Cap & Corp', dayRange: 'Day 1-3' },
  2: { label: 'Financial', dayRange: 'Day 3-10' },
  3: { label: 'Commercial', dayRange: 'Day 10-15' },
  4: { label: 'Legal · IP · HR · Ops', dayRange: 'Day 15-21' },
};

export interface PlaybookCanonicalRow {
  playbookItemId: string;
  number: number;
  category: PlaybookCategory;
  name: string;
  rationale: string;
  dealKillerGroup: DealKillerGroup | null;
  defaultPriority: ChecklistPriority;
  sortOrder: number;

  // Effective per-deal state (defaults when no checklist_items row exists)
  itemId: string | null;
  status: ChecklistStatus;
  owner: ChecklistOwner;
  priority: ChecklistPriority;
  notes: string | null;
  receivedAt: Date | null;
  folderId: string | null;
}

export interface PlaybookCustomRow {
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

export interface PlaybookView {
  canonical: PlaybookCanonicalRow[];
  custom: PlaybookCustomRow[];
}

/**
 * Returns the merged playbook view for a checklist:
 *   - 48 canonical rows (playbook_items LEFT JOIN checklist_items), defaulting
 *     to not_started/unassigned/default_priority when no checklist_items row
 *     exists for that (checklist, playbook_item) pair.
 *   - All custom rows (checklist_items where playbook_item_id IS NULL).
 *
 * Caller must have verified workspace access. This function does NOT enforce
 * authorization — wrap it in a route handler that does.
 */
export async function getPlaybookView(checklistId: string): Promise<PlaybookView> {
  const canonicalRows = await db
    .select({
      playbookItemId: playbookItems.id,
      number: playbookItems.number,
      category: playbookItems.category,
      name: playbookItems.name,
      rationale: playbookItems.rationale,
      dealKillerGroup: playbookItems.dealKillerGroup,
      defaultPriority: playbookItems.defaultPriority,
      sortOrder: playbookItems.sortOrder,
      itemId: checklistItems.id,
      status: checklistItems.status,
      owner: checklistItems.owner,
      priority: checklistItems.priority,
      notes: checklistItems.notes,
      receivedAt: checklistItems.receivedAt,
      folderId: checklistItems.folderId,
    })
    .from(playbookItems)
    .leftJoin(
      checklistItems,
      and(
        eq(checklistItems.playbookItemId, playbookItems.id),
        eq(checklistItems.checklistId, checklistId),
      ),
    )
    .where(isNotNull(playbookItems.id))
    .orderBy(playbookItems.category, playbookItems.sortOrder);

  const canonical: PlaybookCanonicalRow[] = canonicalRows.map((r) => ({
    playbookItemId: r.playbookItemId,
    number: r.number,
    category: r.category as PlaybookCategory,
    name: r.name,
    rationale: r.rationale,
    dealKillerGroup: (r.dealKillerGroup ?? null) as DealKillerGroup | null,
    defaultPriority: r.defaultPriority as ChecklistPriority,
    sortOrder: r.sortOrder,
    itemId: r.itemId,
    status: (r.status ?? 'not_started') as ChecklistStatus,
    owner: (r.owner ?? 'unassigned') as ChecklistOwner,
    priority: (r.priority ?? r.defaultPriority) as ChecklistPriority,
    notes: r.notes,
    receivedAt: r.receivedAt,
    folderId: r.folderId,
  }));

  const customRows = await db
    .select({
      itemId: checklistItems.id,
      category: checklistItems.category,
      name: checklistItems.name,
      status: checklistItems.status,
      owner: checklistItems.owner,
      priority: checklistItems.priority,
      notes: checklistItems.notes,
      folderId: checklistItems.folderId,
      sortOrder: checklistItems.sortOrder,
    })
    .from(checklistItems)
    .where(
      and(
        eq(checklistItems.checklistId, checklistId),
        isNull(checklistItems.playbookItemId),
      ),
    )
    .orderBy(checklistItems.category, checklistItems.sortOrder);

  const custom: PlaybookCustomRow[] = customRows.map((r) => ({
    itemId: r.itemId,
    category: r.category as PlaybookCategory,
    name: r.name,
    status: r.status as ChecklistStatus,
    owner: r.owner as ChecklistOwner,
    priority: r.priority as ChecklistPriority,
    notes: r.notes,
    folderId: r.folderId,
    sortOrder: r.sortOrder,
  }));

  return { canonical, custom };
}

export type DealKillerGroupStatus = 'green' | 'yellow' | 'red' | 'gray';

export interface ReadinessSummary {
  total: number;
  ready: number;
  byCategory: Record<PlaybookCategory, { total: number; ready: number }>;
  byStage: Record<Stage, { total: number; ready: number; label: string; dayRange: string }>;
  dealKillerGroups: Array<{
    group: DealKillerGroup;
    status: ChecklistStatus;
    color: DealKillerGroupStatus;
    members: Array<{ playbookItemId: string; number: number; status: ChecklistStatus }>;
  }>;
}

const READY_STATUSES: ReadonlySet<ChecklistStatus> = new Set([
  'received',
  'waived',
  'n_a',
]);

/** Worst-of ordering for deal-killer group status. Higher = worse. */
const STATUS_RANK: Record<ChecklistStatus, number> = {
  blocked: 4,
  not_started: 3,
  in_progress: 2,
  received: 1,
  waived: 1,
  n_a: 1,
};

function statusToColor(status: ChecklistStatus): DealKillerGroupStatus {
  if (status === 'blocked') return 'red';
  if (status === 'not_started') return 'gray';
  if (status === 'in_progress') return 'yellow';
  return 'green';
}

export async function getReadinessSummary(checklistId: string): Promise<ReadinessSummary> {
  const view = await getPlaybookView(checklistId);

  const byCategory: ReadinessSummary['byCategory'] = {
    corporate_legal: { total: 0, ready: 0 },
    financial: { total: 0, ready: 0 },
    commercial: { total: 0, ready: 0 },
    team_hr: { total: 0, ready: 0 },
    ip_technical: { total: 0, ready: 0 },
    operations_risk: { total: 0, ready: 0 },
  };

  let total = 0;
  let ready = 0;
  for (const row of view.canonical) {
    total += 1;
    byCategory[row.category].total += 1;
    if (READY_STATUSES.has(row.status)) {
      ready += 1;
      byCategory[row.category].ready += 1;
    }
  }

  // Group deal-killer items by group, take worst-of status
  const grouped = new Map<DealKillerGroup, PlaybookCanonicalRow[]>();
  for (const row of view.canonical) {
    if (row.dealKillerGroup) {
      const list = grouped.get(row.dealKillerGroup) ?? [];
      list.push(row);
      grouped.set(row.dealKillerGroup, list);
    }
  }

  const dealKillerGroups = Array.from(grouped.entries()).map(([group, members]) => {
    const worst = members.reduce<ChecklistStatus>(
      (acc, m) => (STATUS_RANK[m.status] > STATUS_RANK[acc] ? m.status : acc),
      'received' as ChecklistStatus,
    );
    return {
      group,
      status: worst,
      color: statusToColor(worst),
      members: members.map((m) => ({
        playbookItemId: m.playbookItemId,
        number: m.number,
        status: m.status,
      })),
    };
  });

  // Stable order: cap_table, eighty_three_b, customer_coc, ip_assignment, revenue_bridge
  const ORDER: DealKillerGroup[] = [
    'cap_table',
    'eighty_three_b',
    'customer_coc',
    'ip_assignment',
    'revenue_bridge',
  ];
  dealKillerGroups.sort((a, b) => ORDER.indexOf(a.group) - ORDER.indexOf(b.group));

  return { total, ready, byCategory, dealKillerGroups };
}

/**
 * Returns the deal-killer groups that have at least one member NOT in
 * (received, waived, n_a). Used to gate buyer-side participant invites.
 */
export async function getOutstandingDealKillerGroups(
  checklistId: string,
): Promise<ReadinessSummary['dealKillerGroups']> {
  const summary = await getReadinessSummary(checklistId);
  return summary.dealKillerGroups.filter(
    (g) => !READY_STATUSES.has(g.status),
  );
}
