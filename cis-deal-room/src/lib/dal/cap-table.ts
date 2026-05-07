import { and, eq, sql as drizzleSql } from 'drizzle-orm';
import { db } from '@/db';
import {
  capTables,
  capTableRows,
  playbookItems,
} from '@/db/schema';
import { verifySession } from './index';
import { logActivity } from './activity';
import { setCanonicalItemStatus, getChecklistForWorkspace } from './checklist';
import type {
  CapTableStatus,
  CisAdvisorySide,
  ParticipantRole,
  ViewOnlyShadowSide,
} from '@/types';
import type { ParsedRow, ParseWarning } from '@/lib/cap-table/parse-csv';

interface SessionScope {
  isAdmin: boolean;
  role: ParticipantRole;
  shadowSide: ViewOnlyShadowSide | null;
  cisAdvisorySide: CisAdvisorySide;
}

interface CapTableSummary {
  id: string;
  status: CapTableStatus;
}

const SELLER_SIDE_ROLES: ReadonlySet<ParticipantRole> = new Set([
  'admin',
  'cis_team',
  'seller_rep',
  'seller_counsel',
]);

/**
 * Pure visibility gate: given a cap_table summary and the viewer's session
 * scope, returns whether the viewer should see the full cap table data.
 *
 * Rules:
 *   - admin / cis_team / seller-side roles: always visible
 *   - client on sell-side workspace: visible
 *   - client on buy-side workspace: hidden when draft
 *   - buyer-side roles: hidden when draft
 *   - view_only shadow=seller: visible (regardless of cisAdvisorySide)
 *   - view_only shadow=buyer: hidden when draft
 *   - counsel (deprecated): hidden
 */
export function applyCapTableVisibilityGate(
  ct: CapTableSummary,
  scope: SessionScope,
): { visible: boolean } {
  if (scope.isAdmin) return { visible: true };
  if (SELLER_SIDE_ROLES.has(scope.role)) return { visible: true };

  if (scope.role === 'client') {
    if (scope.cisAdvisorySide === 'seller_side') return { visible: true };
    return { visible: ct.status === 'published' };
  }

  if (scope.role === 'view_only') {
    if (scope.shadowSide === 'seller') return { visible: true };
    return { visible: ct.status === 'published' };
  }

  if (scope.role === 'buyer_rep' || scope.role === 'buyer_counsel') {
    return { visible: ct.status === 'published' };
  }

  // counsel (deprecated) and any unknown role
  return { visible: false };
}

/** Returns the workspace's cap_tables row, or null. No auth check. */
export async function getCapTableForWorkspace(workspaceId: string) {
  const [row] = await db
    .select()
    .from(capTables)
    .where(eq(capTables.workspaceId, workspaceId))
    .limit(1);
  return row ?? null;
}

/** Returns the cap_table_rows for a cap_table, ordered by row_number. */
export async function getCapTableRows(capTableId: string) {
  return db
    .select()
    .from(capTableRows)
    .where(eq(capTableRows.capTableId, capTableId))
    .orderBy(capTableRows.rowNumber);
}

interface UploadCapTableInput {
  workspaceId: string;
  fileId: string;
  rows: ParsedRow[];
  warnings: ParseWarning[];
}

/**
 * Replace the workspace's cap table with a freshly-uploaded one.
 * Admin only. Transactional. If a previous published cap_table existed,
 * its file_id and summary are written to activity_log under
 * 'cap_table_unpublished' before the row is replaced — preserving an
 * audit trail of past published versions.
 */
export async function uploadCapTable(input: UploadCapTableInput) {
  const session = await verifySession();
  if (!session) throw new Error('Unauthorized');
  if (!session.isAdmin) throw new Error('Admin required');

  return db.transaction(async (tx) => {
    // Snapshot the previous cap_table (if any) into activity log when published.
    const [prev] = await tx
      .select()
      .from(capTables)
      .where(eq(capTables.workspaceId, input.workspaceId))
      .limit(1);

    if (prev && prev.status === 'published') {
      // Compute summary stats on the prior cap_table for audit.
      const [{ count: rowCount }] = await tx
        .select({ count: drizzleSql<number>`count(*)::int` })
        .from(capTableRows)
        .where(eq(capTableRows.capTableId, prev.id));

      await logActivity(tx, {
        workspaceId: input.workspaceId,
        userId: session.userId,
        action: 'cap_table_unpublished',
        targetType: 'workspace',
        targetId: input.workspaceId,
        metadata: {
          reason: 'replaced_by_upload',
          previousFileId: prev.fileId,
          previousUploadedAt: prev.uploadedAt,
          previousRowCount: Number(rowCount ?? 0),
        },
      });
    }

    if (prev) {
      // Cascade deletes the prior cap_table_rows.
      await tx.delete(capTables).where(eq(capTables.id, prev.id));
    }

    const [created] = await tx
      .insert(capTables)
      .values({
        workspaceId: input.workspaceId,
        fileId: input.fileId,
        status: 'draft',
        uploadedBy: session.userId,
        parseWarnings: input.warnings,
      })
      .returning();

    if (input.rows.length > 0) {
      await tx.insert(capTableRows).values(
        input.rows.map((r) => ({
          capTableId: created.id,
          rowNumber: r.rowNumber,
          holder: r.holder,
          className: r.className,
          instrument: r.instrument,
          shares: r.shares,
          ownershipPercent: r.ownershipPercent,
          pricePerShare: r.pricePerShare,
          amountInvested: r.amountInvested,
          round: r.round,
          roundValuation: r.roundValuation,
          vestingStart: r.vestingStart,
          vestingSchedule: r.vestingSchedule,
          certificateNumber: r.certificateNumber,
          notes: r.notes,
        })),
      );
    }

    await logActivity(tx, {
      workspaceId: input.workspaceId,
      userId: session.userId,
      action: 'cap_table_uploaded',
      targetType: 'workspace',
      targetId: input.workspaceId,
      metadata: {
        capTableId: created.id,
        fileId: input.fileId,
        rowCount: input.rows.length,
      },
    });

    return created;
  });
}

/**
 * Look up playbook item #5 ("Cap table") and call setCanonicalItemStatus.
 * Helper used by publishCapTable / unpublishCapTable.
 */
async function setItem5Status(
  workspaceId: string,
  target: 'received' | 'in_progress',
) {
  const checklist = await getChecklistForWorkspace(workspaceId);
  if (!checklist) return; // No checklist → nothing to update

  // Find playbook_items.number = 5
  const [item] = await db
    .select({ id: playbookItems.id })
    .from(playbookItems)
    .where(eq(playbookItems.number, 5))
    .limit(1);
  if (!item) return;

  await setCanonicalItemStatus({
    checklistId: checklist.id,
    playbookItemId: item.id,
    target,
  });
}

export async function publishCapTable(workspaceId: string) {
  const session = await verifySession();
  if (!session) throw new Error('Unauthorized');
  if (!session.isAdmin) throw new Error('Admin required');

  const updated = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(capTables)
      .set({
        status: 'published',
        publishedAt: new Date(),
        publishedBy: session.userId,
        updatedAt: new Date(),
      })
      .where(eq(capTables.workspaceId, workspaceId))
      .returning();
    if (!row) throw new Error('Cap table not found');

    await logActivity(tx, {
      workspaceId,
      userId: session.userId,
      action: 'cap_table_published',
      targetType: 'workspace',
      targetId: workspaceId,
      metadata: { capTableId: row.id },
    });

    return row;
  });

  // Item-5 update happens OUTSIDE the cap_tables transaction. setCanonicalItemStatus
  // opens its own transaction. If it throws, the cap_table publish has already
  // committed; the caller can retry status flipping safely.
  await setItem5Status(workspaceId, 'received');

  return updated;
}

export async function unpublishCapTable(workspaceId: string) {
  const session = await verifySession();
  if (!session) throw new Error('Unauthorized');
  if (!session.isAdmin) throw new Error('Admin required');

  const updated = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(capTables)
      .set({
        status: 'draft',
        publishedAt: null,
        publishedBy: null,
        updatedAt: new Date(),
      })
      .where(eq(capTables.workspaceId, workspaceId))
      .returning();
    if (!row) throw new Error('Cap table not found');

    await logActivity(tx, {
      workspaceId,
      userId: session.userId,
      action: 'cap_table_unpublished',
      targetType: 'workspace',
      targetId: workspaceId,
      metadata: { capTableId: row.id, reason: 'manual_unpublish' },
    });

    return row;
  });

  await setItem5Status(workspaceId, 'in_progress');

  return updated;
}
