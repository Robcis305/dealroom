import type { CapTableInstrument } from '@/types';

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

export interface ParseError {
  code:
    | 'MISSING_REQUIRED_COLUMN'
    | 'MISSING_REQUIRED_FIELD'
    | 'INVALID_INSTRUMENT'
    | 'INVALID_SHARES'
    | 'INVALID_OWNERSHIP'
    | 'INVALID_PRICE'
    | 'INVALID_AMOUNT'
    | 'INVALID_VALUATION'
    | 'INVALID_DATE'
    | 'ROUND_VALUATION_MISMATCH'
    | 'EMPTY_CSV';
  row?: number;
  column?: string;
  message: string;
}

export interface ParseWarning {
  code: 'OWNERSHIP_SUM_DEVIATION' | 'PURCHASE_MATH_MISMATCH' | 'PREFERRED_NO_ROUND';
  row?: number;
  message: string;
}

export interface ParseResult {
  rows: ParsedRow[];
  errors: ParseError[];
  warnings: ParseWarning[];
}

const REQUIRED_COLS = [
  'Holder',
  'Class',
  'Instrument',
  'Shares',
  'Ownership %',
  'Price per Share',
  'Amount Invested',
] as const;

const OPTIONAL_COLS = [
  'Round',
  'Round Valuation',
  'Vesting Start',
  'Vesting Schedule',
  'Certificate / Grant #',
  'Notes',
] as const;

const ALL_COLS = [...REQUIRED_COLS, ...OPTIONAL_COLS];

const INSTRUMENTS = new Set<CapTableInstrument>([
  'common',
  'preferred',
  'option',
  'rsu',
  'safe',
  'convertible_note',
  'warrant',
]);

const PURCHASE_INSTRUMENTS: ReadonlySet<CapTableInstrument> = new Set(['common', 'preferred']);

/** Parse a single CSV line respecting quoted fields per RFC 4180. */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        current += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      fields.push(current);
      current = '';
    } else {
      current += c;
    }
  }
  fields.push(current);
  return fields.map((f) => f.trim());
}

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, ' ');
}

function isValidIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function parseCsv(text: string): ParseResult {
  const errors: ParseError[] = [];
  const warnings: ParseWarning[] = [];
  const rows: ParsedRow[] = [];

  // Strip BOM
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }

  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    errors.push({ code: 'EMPTY_CSV', message: 'CSV is empty' });
    return { rows, errors, warnings };
  }

  const rawHeaders = parseCsvLine(lines[0]);
  const headerMap = new Map<string, number>(); // normalized name → index
  rawHeaders.forEach((h, i) => headerMap.set(normalizeHeader(h), i));

  // Check required headers
  for (const required of REQUIRED_COLS) {
    if (!headerMap.has(normalizeHeader(required))) {
      errors.push({
        code: 'MISSING_REQUIRED_COLUMN',
        column: required,
        message: `Missing required column: ${required}`,
      });
    }
  }
  if (errors.length > 0) {
    return { rows, errors, warnings };
  }

  function getField(cells: string[], colName: string): string {
    const idx = headerMap.get(normalizeHeader(colName));
    if (idx === undefined) return '';
    return cells[idx] ?? '';
  }

  // Parse data rows (line 0 is header; data starts at line 1, file row index 2)
  for (let lineIdx = 1; lineIdx < lines.length; lineIdx++) {
    const fileRow = lineIdx + 1;
    const cells = parseCsvLine(lines[lineIdx]);

    // Required field presence
    let hasMissingRequired = false;
    for (const r of REQUIRED_COLS) {
      if (!getField(cells, r)) {
        errors.push({
          code: 'MISSING_REQUIRED_FIELD',
          row: fileRow,
          column: r,
          message: `Row ${fileRow}: missing required field "${r}"`,
        });
        hasMissingRequired = true;
      }
    }
    if (hasMissingRequired) continue;

    const instrumentRaw = getField(cells, 'Instrument').toLowerCase().replace(/[\s-]/g, '_');
    if (!INSTRUMENTS.has(instrumentRaw as CapTableInstrument)) {
      errors.push({
        code: 'INVALID_INSTRUMENT',
        row: fileRow,
        message: `Row ${fileRow}: invalid Instrument "${getField(cells, 'Instrument')}". Must be one of: common, preferred, option, rsu, safe, convertible_note, warrant`,
      });
      continue;
    }
    const instrument = instrumentRaw as CapTableInstrument;

    const sharesRaw = getField(cells, 'Shares');
    const sharesNum = Number(sharesRaw);
    if (!Number.isInteger(sharesNum) || sharesNum < 0) {
      errors.push({
        code: 'INVALID_SHARES',
        row: fileRow,
        message: `Row ${fileRow}: Shares must be a non-negative integer (got "${sharesRaw}")`,
      });
      continue;
    }

    const ownershipRaw = getField(cells, 'Ownership %').replace(/%$/, '').trim();
    const ownershipNum = Number(ownershipRaw);
    if (!Number.isFinite(ownershipNum) || ownershipNum < 0 || ownershipNum > 100) {
      errors.push({
        code: 'INVALID_OWNERSHIP',
        row: fileRow,
        message: `Row ${fileRow}: Ownership % must be between 0 and 100 (got "${ownershipRaw}")`,
      });
      continue;
    }

    const priceRaw = getField(cells, 'Price per Share').replace(/^\$/, '').trim();
    const priceNum = Number(priceRaw);
    if (!Number.isFinite(priceNum) || priceNum < 0) {
      errors.push({
        code: 'INVALID_PRICE',
        row: fileRow,
        message: `Row ${fileRow}: Price per Share must be a non-negative number (got "${priceRaw}")`,
      });
      continue;
    }

    const amountRaw = getField(cells, 'Amount Invested').replace(/^\$/, '').replace(/,/g, '').trim();
    const amountNum = Number(amountRaw);
    if (!Number.isFinite(amountNum) || amountNum < 0) {
      errors.push({
        code: 'INVALID_AMOUNT',
        row: fileRow,
        message: `Row ${fileRow}: Amount Invested must be a non-negative number (got "${amountRaw}")`,
      });
      continue;
    }

    const round = getField(cells, 'Round') || null;

    let roundValuation: string | null = null;
    const roundValRaw = getField(cells, 'Round Valuation').replace(/^\$/, '').replace(/,/g, '').trim();
    if (roundValRaw) {
      const v = Number(roundValRaw);
      if (!Number.isFinite(v) || v < 0) {
        errors.push({
          code: 'INVALID_VALUATION',
          row: fileRow,
          message: `Row ${fileRow}: Round Valuation must be a non-negative number (got "${roundValRaw}")`,
        });
        continue;
      }
      roundValuation = String(v);
    }

    let vestingStart: string | null = null;
    const vsRaw = getField(cells, 'Vesting Start');
    if (vsRaw) {
      if (!isValidIsoDate(vsRaw)) {
        errors.push({
          code: 'INVALID_DATE',
          row: fileRow,
          message: `Row ${fileRow}: Vesting Start must be ISO YYYY-MM-DD (got "${vsRaw}")`,
        });
        continue;
      }
      vestingStart = vsRaw;
    }

    rows.push({
      rowNumber: fileRow,
      holder: getField(cells, 'Holder'),
      className: getField(cells, 'Class'),
      instrument,
      shares: sharesNum,
      ownershipPercent: ownershipRaw,
      pricePerShare: priceRaw,
      amountInvested: amountRaw,
      round,
      roundValuation,
      vestingStart,
      vestingSchedule: getField(cells, 'Vesting Schedule') || null,
      certificateNumber: getField(cells, 'Certificate / Grant #') || null,
      notes: getField(cells, 'Notes') || null,
    });
  }

  // If row-level errors accumulated, return them; the rows array is partial but caller treats errors as fatal anyway.
  if (errors.length > 0) {
    return { rows, errors, warnings };
  }

  // Cross-row checks (only run if individual rows are clean)
  // 1. Round Valuation consistency within a Round
  const roundValMap = new Map<string, string>(); // round → first valuation seen
  for (const r of rows) {
    if (r.round && r.roundValuation) {
      const seen = roundValMap.get(r.round);
      if (seen !== undefined && seen !== r.roundValuation) {
        errors.push({
          code: 'ROUND_VALUATION_MISMATCH',
          row: r.rowNumber,
          message: `Round "${r.round}" has conflicting valuations: ${seen} vs ${r.roundValuation}`,
        });
      } else {
        roundValMap.set(r.round, r.roundValuation);
      }
    }
  }

  if (errors.length > 0) {
    return { rows: [], errors, warnings };
  }

  // 2. Warnings — ownership sum deviation
  const ownershipSum = rows.reduce((acc, r) => acc + Number(r.ownershipPercent), 0);
  if (Math.abs(ownershipSum - 100) > 0.5) {
    warnings.push({
      code: 'OWNERSHIP_SUM_DEVIATION',
      message: `Sum of Ownership % is ${ownershipSum.toFixed(2)}, expected ~100`,
    });
  }

  // 3. Warnings — purchase math mismatch
  for (const r of rows) {
    if (PURCHASE_INSTRUMENTS.has(r.instrument)) {
      const expected = r.shares * Number(r.pricePerShare);
      const actual = Number(r.amountInvested);
      if (Math.abs(expected - actual) > 1) {
        warnings.push({
          code: 'PURCHASE_MATH_MISMATCH',
          row: r.rowNumber,
          message: `Row ${r.rowNumber}: Shares × Price (${expected.toFixed(2)}) does not equal Amount Invested (${actual.toFixed(2)})`,
        });
      }
    }
  }

  // 4. Warnings — preferred without round
  for (const r of rows) {
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
