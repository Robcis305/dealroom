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
