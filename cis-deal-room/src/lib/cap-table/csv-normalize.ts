import type { CapTableInstrument } from '@/types';

/**
 * Low-level tolerance layer for cap-table CSVs: header aliasing, delimiter and
 * number/date normalisation, and instrument inference. Row-level assembly and
 * validation live in parse-csv.ts.
 */


export type Canonical =
  | 'holder' | 'class' | 'instrument' | 'shares' | 'ownership' | 'price' | 'amount'
  | 'round' | 'valuation' | 'vestingStart' | 'vestingSchedule' | 'certificate'
  | 'notes' | 'status';

/** Header spellings we accept per canonical column. First header to claim a column wins. */
export const COLUMN_ALIASES: Record<Canonical, string[]> = {
  holder: ['holder', 'holder name', 'name', 'stakeholder', 'shareholder', 'investor', 'owner', 'security holder'],
  class: ['class', 'share class', 'stock class', 'security class', 'class of stock', 'series', 'class / series'],
  instrument: ['instrument', 'instrument type', 'security type', 'security', 'type', 'equity type'],
  shares: ['shares', 'share count', 'shares outstanding', 'number of shares', 'no. of shares', '# of shares', 'quantity', 'qty', 'units'],
  ownership: ['ownership %', 'ownership', 'ownership percent', 'ownership percentage', '% ownership', 'fully diluted %', '% fully diluted', 'fd %', 'percent', 'pct'],
  price: ['price per share', 'price/share', 'price per share ($)', 'share price', 'pps', 'exercise price', 'strike price', 'price'],
  amount: ['amount invested', 'investment amount', 'amount', 'investment', 'invested', 'total invested', 'purchase price', 'consideration'],
  round: ['round', 'financing round', 'round name', 'funding round'],
  valuation: ['round valuation', 'valuation', 'pre-money valuation', 'post-money valuation', 'pre money valuation', 'post money valuation'],
  vestingStart: ['vesting start', 'vesting start date', 'vesting commencement date', 'vest start', 'grant date', 'issue date'],
  vestingSchedule: ['vesting schedule', 'vesting', 'vesting terms'],
  certificate: ['certificate / grant #', 'certificate', 'certificate #', 'certificate number', 'cert #', 'cert no', 'grant #', 'grant number', 'security id', 'security #'],
  notes: ['notes', 'note', 'comments', 'comment', 'remarks'],
  status: ['status', 'security status', 'grant status', 'state'],
};

/** Only these three must exist as columns; `class` is satisfied by an `instrument` column too. */
export const REQUIRED_CANONICALS: Canonical[] = ['holder', 'class', 'shares'];

export const REQUIRED_LABELS: Record<string, string> = {
  holder: 'Holder',
  class: 'Class',
  shares: 'Shares',
};

const INSTRUMENTS = new Set<CapTableInstrument>([
  'common', 'preferred', 'option', 'rsu', 'safe', 'convertible_note', 'warrant',
]);

/** Checked in order — the first match wins, so narrower instruments come first. */
const INSTRUMENT_PATTERNS: Array<[RegExp, CapTableInstrument]> = [
  [/convertible\s*note|conv\.?\s*note|promissory|\bnote\b/i, 'convertible_note'],
  [/\bsafe\b|simple agreement/i, 'safe'],
  [/warrant/i, 'warrant'],
  [/\brsu\b|restricted stock unit/i, 'rsu'],
  [/option|\biso\b|\bnso\b|\bsar\b|esop|stock plan|equity pool|reserve/i, 'option'],
  [/preferred|\bpref\b|series\s+[a-z0-9]/i, 'preferred'],
  [/common|ordinary|founder/i, 'common'],
];

export const PURCHASE_INSTRUMENTS: ReadonlySet<CapTableInstrument> = new Set(['common', 'preferred']);

/** Placeholders spreadsheets use for "no value". */
export const NULLISH = new Set(['', '-', '--', '–', '—', 'n/a', 'na', 'n.a.', '#n/a', 'tbd', 'none', 'null']);

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** Returns the trimmed value, or null when it is blank or a "no value" placeholder. */
export function notPlaceholder(raw: string): string | null {
  const s = raw.trim();
  return s && !NULLISH.has(s.toLowerCase()) ? s : null;
}

export function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[:*]+$/, '').replace(/\s+/g, ' ');
}

/** Tokenize the whole document so quoted fields may contain commas AND newlines. */
export function tokenize(text: string, delimiter: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === delimiter) {
      record.push(cur);
      cur = '';
    } else if (c === '\n') {
      record.push(cur);
      records.push(record);
      record = [];
      cur = '';
    } else if (c !== '\r') {
      cur += c;
    }
  }
  record.push(cur);
  records.push(record);
  return records.map((r) => r.map((f) => f.trim()));
}

/** Pick the delimiter that appears most often in the header line. */
export function detectDelimiter(text: string): string {
  const header = text.split('\n', 1)[0] ?? '';
  const counts = [',', ';', '\t', '|'].map((d) => [d, header.split(d).length - 1] as const);
  const best = counts.reduce((a, b) => (b[1] > a[1] ? b : a));
  return best[1] > 0 ? best[0] : ',';
}

/** Accepts "$1,234.50", "(500)", "12.5%", "1 234", and blanks/placeholders (→ null). */
export function parseNumber(raw: string): number | null {
  let s = raw.trim();
  if (NULLISH.has(s.toLowerCase())) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/[$€£¥\s ,']/g, '').replace(/%$/, '');
  if (s.startsWith('-')) {
    negative = true;
    s = s.slice(1);
  } else if (s.startsWith('+')) {
    s = s.slice(1);
  }
  if (!/^(\d+\.?\d*|\.\d+)$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

/** Render for a Postgres numeric column without scientific notation. */
export function toNumericString(n: number, scale: number): string {
  if (Number.isInteger(n) && Math.abs(n) < 1e15) return String(n);
  let s = n.toFixed(scale);
  if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
  return s === '' || s === '-' ? '0' : s;
}

/** Accepts ISO, M/D/YYYY, D-Mon-YYYY, "Mon D, YYYY". Returns ISO or null. */
export function parseDate(raw: string): string | null {
  const s = raw.trim();
  if (!s || NULLISH.has(s.toLowerCase())) return null;

  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (iso) return buildIso(+iso[1], +iso[2], +iso[3]);

  const slash = /^(\d{1,2})[/.](\d{1,2})[/.](\d{2}|\d{4})$/.exec(s);
  if (slash) {
    const year = slash[3].length === 2 ? 2000 + +slash[3] : +slash[3];
    return buildIso(year, +slash[1], +slash[2]);
  }

  const dMon = /^(\d{1,2})[-\s]([a-z]{3,})[-\s](\d{2}|\d{4})$/i.exec(s);
  if (dMon) {
    const m = MONTHS.indexOf(dMon[2].slice(0, 3).toLowerCase());
    const year = dMon[3].length === 2 ? 2000 + +dMon[3] : +dMon[3];
    if (m >= 0) return buildIso(year, m + 1, +dMon[1]);
  }

  const monD = /^([a-z]{3,})\.?\s+(\d{1,2}),?\s+(\d{4})$/i.exec(s);
  if (monD) {
    const m = MONTHS.indexOf(monD[1].slice(0, 3).toLowerCase());
    if (m >= 0) return buildIso(+monD[3], m + 1, +monD[2]);
  }

  return null;
}

function buildIso(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const iso = `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const parsed = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === iso ? iso : null;
}

export function matchInstrument(value: string): CapTableInstrument | null {
  const exact = value.toLowerCase().trim().replace(/[\s\-/]+/g, '_');
  if (INSTRUMENTS.has(exact as CapTableInstrument)) return exact as CapTableInstrument;
  for (const [pattern, instrument] of INSTRUMENT_PATTERNS) {
    if (pattern.test(value)) return instrument;
  }
  return null;
}

/** True for totals/subtotals footers and fully blank spacer rows. */
export function isNonDataRow(cells: string[]): boolean {
  if (cells.every((c) => c === '')) return true;
  return cells.some((c) => /^\s*(grand\s+)?(totals?|sub-?totals?|sum)\b/i.test(c));
}

