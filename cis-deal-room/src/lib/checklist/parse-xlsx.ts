import * as XLSX from 'xlsx';
import type { ChecklistOwner, ChecklistPriority } from '@/types';

export interface ParsedRow {
  sortOrder: number;
  category: string;
  name: string;
  description: string | null;
  priority: ChecklistPriority;
  owner: ChecklistOwner;
  notes: string | null;
  requestedAt: Date | null;
}

export interface ParseResult {
  valid: ParsedRow[];
  rejected: Array<{ rowNumber: number; raw: Record<string, string>; reason: string }>;
}

const HEADER_ALIASES: Record<string, string[]> = {
  sortOrder: ['#'],
  category: ['category'],
  name: ['item', 'document', 'request'],
  description: ['description', 'description / request detail', 'request detail'],
  priority: ['priority'],
  owner: ['owner'],
  notes: ['notes'],
  requestedAt: ['date requested', 'requested'],
};

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, ' ');
}

function findKey(row: Record<string, unknown>, field: keyof typeof HEADER_ALIASES): string | undefined {
  const aliases = HEADER_ALIASES[field];
  for (const rawKey of Object.keys(row)) {
    const k = normalizeHeader(rawKey);
    if (aliases.includes(k)) return rawKey;
  }
  return undefined;
}

function coercePriority(v: unknown): ChecklistPriority {
  const s = String(v ?? '').trim().toLowerCase();
  if (s === 'critical' || s === 'high' || s === 'medium' || s === 'low') return s;
  return 'medium';
}

function coerceOwner(v: unknown): ChecklistOwner {
  const s = String(v ?? '').trim().toLowerCase();
  if (s === 'seller' || s === 'buyer' || s === 'both' || s === 'cis_team') return s;
  if (s === 'cis team' || s === 'cis') return 'cis_team';
  return 'unassigned';
}

const HEADER_SCAN_LIMIT = 20;

/**
 * Returns the 0-based index of the first row in `rawRows` that contains a
 * cell matching "category" (case-insensitive, whitespace-tolerant). Returns
 * -1 if no such row is found within the first HEADER_SCAN_LIMIT rows.
 *
 * This lets real-world .xlsx files work even when the column headers are not
 * on row 1 — e.g., when there's a title row, merged section banner, or blank
 * spacer above the header.
 */
function detectHeaderRow(rawRows: unknown[][]): number {
  const limit = Math.min(HEADER_SCAN_LIMIT, rawRows.length);
  for (let i = 0; i < limit; i++) {
    const row = rawRows[i];
    if (!Array.isArray(row)) continue;
    const hasCategory = row.some((cell) => normalizeHeader(String(cell ?? '')) === 'category');
    if (hasCategory) return i;
  }
  return -1;
}

function isAllBlank(rowArr: unknown[]): boolean {
  return rowArr.every((v) => String(v ?? '').trim() === '');
}

export function parseChecklistXlsx(input: ArrayBuffer | Buffer): ParseResult {
  const wb = XLSX.read(input, { type: input instanceof ArrayBuffer ? 'array' : 'buffer' });
  if (wb.SheetNames.length === 0) return { valid: [], rejected: [] };

  // Workbooks often have helper sheets (Instructions, Summary) alongside the
  // actual request list. Scan every sheet and use the first one that contains
  // a detectable "Category" header row.
  let rawRows: unknown[][] = [];
  let headerRowIdx = -1;
  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    const candidate = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });
    const idx = detectHeaderRow(candidate);
    if (idx !== -1) {
      rawRows = candidate;
      headerRowIdx = idx;
      break;
    }
  }

  if (headerRowIdx === -1) {
    return {
      valid: [],
      rejected: [{
        rowNumber: 1,
        raw: {},
        reason: 'Could not find a "Category" column header in any sheet (scanned first ' + HEADER_SCAN_LIMIT + ' rows of each)',
      }],
    };
  }

  const headerRow = rawRows[headerRowIdx] as unknown[];
  const headers = headerRow.map((h) => String(h ?? ''));

  const valid: ParsedRow[] = [];
  const rejected: ParseResult['rejected'] = [];

  for (let i = headerRowIdx + 1; i < rawRows.length; i++) {
    const rowArr = rawRows[i];
    if (!Array.isArray(rowArr)) continue;
    // Skip entirely blank rows silently — they don't belong in the rejection list.
    if (isAllBlank(rowArr)) continue;

    const rowNumber = i + 1; // 1-based for human-readable error output

    // Build a record keyed by header labels, so the rest of the parser (which
    // expects Record<string, unknown>) works unchanged.
    const row: Record<string, unknown> = {};
    for (let c = 0; c < headers.length; c++) {
      row[headers[c]] = rowArr[c] ?? '';
    }

    const categoryKey = findKey(row, 'category');
    const nameKey = findKey(row, 'name');
    const category = categoryKey ? String(row[categoryKey] ?? '').trim() : '';
    const name = nameKey ? String(row[nameKey] ?? '').trim() : '';

    if (!category) {
      rejected.push({ rowNumber, raw: row as Record<string, string>, reason: 'Missing Category' });
      continue;
    }
    if (!name) {
      rejected.push({ rowNumber, raw: row as Record<string, string>, reason: 'Missing Item' });
      continue;
    }

    const sortKey = findKey(row, 'sortOrder');
    const sortRaw = sortKey ? String(row[sortKey] ?? '').trim() : '';
    const sortNum = Number.parseInt(sortRaw, 10);
    const sortOrder = Number.isFinite(sortNum) ? sortNum : i - headerRowIdx;

    const descKey = findKey(row, 'description');
    const notesKey = findKey(row, 'notes');
    const priorityKey = findKey(row, 'priority');
    const ownerKey = findKey(row, 'owner');
    const reqKey = findKey(row, 'requestedAt');

    const description = descKey ? String(row[descKey] ?? '').trim() || null : null;
    const notes = notesKey ? String(row[notesKey] ?? '').trim() || null : null;
    const priority = coercePriority(priorityKey ? row[priorityKey] : undefined);
    const owner = coerceOwner(ownerKey ? row[ownerKey] : undefined);

    let requestedAt: Date | null = null;
    if (reqKey) {
      const raw = row[reqKey];
      if (raw instanceof Date) requestedAt = raw;
      else if (typeof raw === 'string' && raw.trim()) {
        const d = new Date(raw);
        if (!Number.isNaN(d.getTime())) requestedAt = d;
      }
    }

    valid.push({ sortOrder, category, name, description, priority, owner, notes, requestedAt });
  }

  return { valid, rejected };
}
