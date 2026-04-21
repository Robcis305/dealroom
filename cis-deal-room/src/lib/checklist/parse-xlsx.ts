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

export function parseChecklistXlsx(input: ArrayBuffer | Buffer): ParseResult {
  const wb = XLSX.read(input, { type: input instanceof ArrayBuffer ? 'array' : 'buffer' });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return { valid: [], rejected: [] };
  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

  const valid: ParsedRow[] = [];
  const rejected: ParseResult['rejected'] = [];

  rows.forEach((row, idx) => {
    const rowNumber = idx + 2; // header is row 1

    const categoryKey = findKey(row, 'category');
    const nameKey = findKey(row, 'name');
    const category = categoryKey ? String(row[categoryKey] ?? '').trim() : '';
    const name = nameKey ? String(row[nameKey] ?? '').trim() : '';

    if (!category) {
      rejected.push({ rowNumber, raw: row as Record<string, string>, reason: 'Missing Category' });
      return;
    }
    if (!name) {
      rejected.push({ rowNumber, raw: row as Record<string, string>, reason: 'Missing Item' });
      return;
    }

    const sortKey = findKey(row, 'sortOrder');
    const sortRaw = sortKey ? String(row[sortKey] ?? '').trim() : '';
    const sortNum = Number.parseInt(sortRaw, 10);
    const sortOrder = Number.isFinite(sortNum) ? sortNum : idx + 1;

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
  });

  return { valid, rejected };
}
