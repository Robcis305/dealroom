import type { CapTableInstrument } from '@/types';
import {
  COLUMN_ALIASES,
  NULLISH,
  PURCHASE_INSTRUMENTS,
  REQUIRED_CANONICALS,
  REQUIRED_LABELS,
  detectDelimiter,
  isNonDataRow,
  matchInstrument,
  normalizeHeader,
  notPlaceholder,
  parseDate,
  parseNumber,
  toNumericString,
  tokenize,
  type Canonical,
} from './csv-normalize';

export interface ParsedRow {
  rowNumber: number;
  holder: string;
  className: string;
  instrument: CapTableInstrument;
  shares: number;
  ownershipPercent: string; // numeric strings preserve precision for decimal columns
  pricePerShare: string;
  amountInvested: string;
  round: string | null;
  roundValuation: string | null;
  vestingStart: string | null; // ISO date YYYY-MM-DD
  vestingSchedule: string | null;
  certificateNumber: string | null;
  notes: string | null;
}

/**
 * Fatal problems only. Anything recoverable is reported as a warning and the
 * upload proceeds — a cap table CSV exported from a real captable tool rarely
 * matches our column names or number formatting exactly.
 */
export interface ParseError {
  code: 'MISSING_REQUIRED_COLUMN' | 'NO_VALID_ROWS' | 'EMPTY_CSV';
  row?: number;
  column?: string;
  message: string;
}

export interface ParseWarning {
  code:
    | 'ROW_SKIPPED'
    | 'INSTRUMENT_INFERRED'
    | 'OWNERSHIP_DERIVED'
    | 'OWNERSHIP_CLAMPED'
    | 'SHARES_ROUNDED'
    | 'VALUE_IGNORED'
    | 'ROUND_VALUATION_MISMATCH'
    | 'OWNERSHIP_SUM_DEVIATION'
    | 'PURCHASE_MATH_MISMATCH'
    | 'PREFERRED_NO_ROUND';
  row?: number;
  message: string;
}

export interface ParseResult {
  rows: ParsedRow[];
  errors: ParseError[];
  warnings: ParseWarning[];
}

interface PendingRow {
  rowNumber: number;
  holder: string;
  className: string;
  instrument: CapTableInstrument;
  shares: number;
  ownership: number | null;
  price: number;
  amount: number;
  round: string | null;
  roundValuation: number | null;
  vestingStart: string | null;
  vestingSchedule: string | null;
  certificateNumber: string | null;
  notes: string | null;
}

export function parseCsv(text: string): ParseResult {
  const errors: ParseError[] = [];
  const warnings: ParseWarning[] = [];

  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const records = tokenize(text, detectDelimiter(text)).filter(
    (r) => !r.every((c) => c === ''),
  );
  if (records.length === 0) {
    errors.push({ code: 'EMPTY_CSV', message: 'CSV is empty' });
    return { rows: [], errors, warnings };
  }

  // ─── Header mapping ───────────────────────────────────────────────────────
  const colIndex = new Map<Canonical, number>();
  records[0].forEach((raw, i) => {
    const h = normalizeHeader(raw);
    if (!h) return;
    for (const [canonical, aliases] of Object.entries(COLUMN_ALIASES) as [Canonical, string[]][]) {
      if (!colIndex.has(canonical) && aliases.includes(h)) {
        colIndex.set(canonical, i);
        return;
      }
    }
  });

  // A single type column satisfies both Class and Instrument.
  const hasClassish = colIndex.has('class') || colIndex.has('instrument');
  for (const required of REQUIRED_CANONICALS) {
    if (required === 'class' ? !hasClassish : !colIndex.has(required)) {
      errors.push({
        code: 'MISSING_REQUIRED_COLUMN',
        column: REQUIRED_LABELS[required],
        message: `Missing required column: ${REQUIRED_LABELS[required]}`,
      });
    }
  }
  if (errors.length > 0) return { rows: [], errors, warnings };

  const field = (cells: string[], c: Canonical): string => {
    const idx = colIndex.get(c);
    return idx === undefined ? '' : (cells[idx] ?? '');
  };

  // ─── Row pass ─────────────────────────────────────────────────────────────
  const pending: PendingRow[] = [];

  for (let i = 1; i < records.length; i++) {
    const rowNumber = i + 1;
    const cells = records[i];
    if (isNonDataRow(cells)) continue;

    const skip = (reason: string) => {
      warnings.push({ code: 'ROW_SKIPPED', row: rowNumber, message: `Row ${rowNumber} skipped — ${reason}` });
    };

    const holder = field(cells, 'holder');
    if (!holder) {
      skip('no Holder');
      continue;
    }

    const sharesRaw = field(cells, 'shares');
    const sharesNum = parseNumber(sharesRaw);
    if (sharesNum === null || sharesNum < 0) {
      skip(`Shares is not a non-negative number (got "${sharesRaw}")`);
      continue;
    }
    let shares = sharesNum;
    if (!Number.isInteger(shares)) {
      shares = Math.round(shares);
      warnings.push({
        code: 'SHARES_ROUNDED',
        row: rowNumber,
        message: `Row ${rowNumber}: fractional Shares ${sharesRaw} rounded to ${shares}`,
      });
    }

    // Instrument: prefer the Instrument column, fall back to Class text.
    const instrumentRaw = field(cells, 'instrument');
    const classRaw = field(cells, 'class');
    let instrument = instrumentRaw ? matchInstrument(instrumentRaw) : null;
    let instrumentSource = instrumentRaw;
    if (!instrument && classRaw) {
      instrument = matchInstrument(classRaw);
      instrumentSource = classRaw;
    }
    if (!instrument) {
      instrument = 'common';
      warnings.push({
        code: 'INSTRUMENT_INFERRED',
        row: rowNumber,
        message: `Row ${rowNumber}: could not recognise instrument from "${instrumentSource || classRaw || instrumentRaw}" — defaulted to common`,
      });
    }

    // Class must be non-empty (DB NOT NULL); fall back to the instrument column's text.
    const className = classRaw || instrumentRaw;
    if (!className) {
      skip('no Class');
      continue;
    }

    // A non-instrument value in the Instrument column is almost always a
    // certificate / grant id (e.g. "CS-1"), so keep it rather than drop it.
    let certificateNumber = notPlaceholder(field(cells, 'certificate'));
    if (!certificateNumber && instrumentRaw && !matchInstrument(instrumentRaw)) {
      certificateNumber = notPlaceholder(instrumentRaw);
    }

    const numericOrDefault = (canonical: Canonical, label: string, fallback: number): number => {
      const raw = field(cells, canonical);
      if (!raw) return fallback;
      const n = parseNumber(raw);
      if (n === null || n < 0) {
        warnings.push({
          code: 'VALUE_IGNORED',
          row: rowNumber,
          message: `Row ${rowNumber}: ${label} "${raw}" is not a non-negative number — treated as ${fallback}`,
        });
        return fallback;
      }
      return n;
    };

    const price = numericOrDefault('price', 'Price per Share', 0);
    const amount = numericOrDefault('amount', 'Amount Invested', 0);

    let ownership: number | null = null;
    const ownershipRaw = field(cells, 'ownership');
    if (ownershipRaw) {
      const n = parseNumber(ownershipRaw);
      if (n === null) {
        warnings.push({
          code: 'VALUE_IGNORED',
          row: rowNumber,
          message: `Row ${rowNumber}: Ownership % "${ownershipRaw}" is not a number — derived from share count instead`,
        });
      } else if (n < 0 || n > 100) {
        ownership = Math.min(100, Math.max(0, n));
        warnings.push({
          code: 'OWNERSHIP_CLAMPED',
          row: rowNumber,
          message: `Row ${rowNumber}: Ownership % ${n} is outside 0–100 — clamped to ${ownership}`,
        });
      } else {
        ownership = n;
      }
    }

    let roundValuation: number | null = null;
    const valuationRaw = field(cells, 'valuation');
    if (valuationRaw) {
      const n = parseNumber(valuationRaw);
      if (n === null || n < 0) {
        warnings.push({
          code: 'VALUE_IGNORED',
          row: rowNumber,
          message: `Row ${rowNumber}: Round Valuation "${valuationRaw}" is not a non-negative number — left blank`,
        });
      } else {
        roundValuation = n;
      }
    }

    let vestingStart: string | null = null;
    const vestingRaw = field(cells, 'vestingStart');
    if (vestingRaw) {
      vestingStart = parseDate(vestingRaw);
      if (!vestingStart && !NULLISH.has(vestingRaw.toLowerCase())) {
        warnings.push({
          code: 'VALUE_IGNORED',
          row: rowNumber,
          message: `Row ${rowNumber}: Vesting Start "${vestingRaw}" is not a recognisable date — left blank`,
        });
      }
    }

    // Status has no column of its own; preserve it on the row's notes.
    const statusRaw = field(cells, 'status');
    const notesRaw = field(cells, 'notes');
    let notes: string | null = notesRaw || null;
    if (statusRaw) notes = notes ? `${notes} — Status: ${statusRaw}` : `Status: ${statusRaw}`;

    pending.push({
      rowNumber,
      holder,
      className,
      instrument,
      shares,
      ownership,
      price,
      amount,
      round: field(cells, 'round') || null,
      roundValuation,
      vestingStart,
      vestingSchedule: field(cells, 'vestingSchedule') || null,
      certificateNumber,
      notes,
    });
  }

  if (pending.length === 0) {
    errors.push({
      code: 'NO_VALID_ROWS',
      message: 'No usable rows found. Every row was blank, a totals line, or missing Holder/Class/Shares.',
    });
    return { rows: [], errors, warnings };
  }

  // ─── Derive missing ownership from share count ────────────────────────────
  const totalShares = pending.reduce((acc, r) => acc + r.shares, 0);
  const derived = pending.filter((r) => r.ownership === null);
  if (derived.length > 0) {
    for (const r of derived) {
      r.ownership = totalShares > 0 ? (r.shares / totalShares) * 100 : 0;
    }
    warnings.push({
      code: 'OWNERSHIP_DERIVED',
      message: `Ownership % was blank on ${derived.length} row${derived.length === 1 ? '' : 's'} — derived from share count (row${derived.length === 1 ? '' : 's'} ${derived.map((r) => r.rowNumber).join(', ')})`,
    });
  }

  const rows: ParsedRow[] = pending.map((r) => ({
    rowNumber: r.rowNumber,
    holder: r.holder,
    className: r.className,
    instrument: r.instrument,
    shares: r.shares,
    ownershipPercent: toNumericString(r.ownership ?? 0, 4),
    pricePerShare: toNumericString(r.price, 8),
    amountInvested: toNumericString(r.amount, 2),
    round: r.round,
    roundValuation: r.roundValuation === null ? null : toNumericString(r.roundValuation, 2),
    vestingStart: r.vestingStart,
    vestingSchedule: r.vestingSchedule,
    certificateNumber: r.certificateNumber,
    notes: r.notes,
  }));

  // ─── Cross-row sanity checks (all non-fatal) ──────────────────────────────
  const roundValMap = new Map<string, string>();
  for (const r of rows) {
    if (!r.round || !r.roundValuation) continue;
    const seen = roundValMap.get(r.round);
    if (seen !== undefined && seen !== r.roundValuation) {
      warnings.push({
        code: 'ROUND_VALUATION_MISMATCH',
        row: r.rowNumber,
        message: `Round "${r.round}" has conflicting valuations: ${seen} vs ${r.roundValuation}`,
      });
    } else {
      roundValMap.set(r.round, r.roundValuation);
    }
  }

  const ownershipSum = rows.reduce((acc, r) => acc + Number(r.ownershipPercent), 0);
  if (Math.abs(ownershipSum - 100) > 0.5) {
    warnings.push({
      code: 'OWNERSHIP_SUM_DEVIATION',
      message: `Sum of Ownership % is ${ownershipSum.toFixed(2)}, expected ~100`,
    });
  }

  for (const r of rows) {
    if (PURCHASE_INSTRUMENTS.has(r.instrument)) {
      const expected = r.shares * Number(r.pricePerShare);
      const actual = Number(r.amountInvested);
      // Blank price or amount is common in exports — only flag genuine mismatches.
      if (expected > 0 && actual > 0 && Math.abs(expected - actual) > 1) {
        warnings.push({
          code: 'PURCHASE_MATH_MISMATCH',
          row: r.rowNumber,
          message: `Row ${r.rowNumber}: Shares × Price (${expected.toFixed(2)}) does not equal Amount Invested (${actual.toFixed(2)})`,
        });
      }
    }
    if (r.instrument === 'preferred' && !r.round) {
      warnings.push({
        code: 'PREFERRED_NO_ROUND',
        row: r.rowNumber,
        message: `Row ${r.rowNumber}: Preferred row has no Round assigned`,
      });
    }
  }

  return { rows, errors, warnings };
}
