import { describe, it, expect } from 'vitest';
import { parseCsv } from '@/lib/cap-table/parse-csv';

const validCsvHeader = 'Holder,Class,Instrument,Shares,Ownership %,Price per Share,Amount Invested';

describe('parseCsv — happy path', () => {
  it('parses a minimal valid 1-row CSV', () => {
    const text = `${validCsvHeader}
Alice Founder,Common,common,1000000,50,0.0001,100`;

    const result = parseCsv(text);

    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      holder: 'Alice Founder',
      className: 'Common',
      instrument: 'common',
      shares: 1000000,
      ownershipPercent: '50',
      pricePerShare: '0.0001',
      amountInvested: '100',
    });
  });

  it('accepts case-insensitive header names', () => {
    const text = `holder,CLASS,instrument,shares,Ownership %,price per share,amount invested
Alice,Common,common,100,50,1,100`;

    const result = parseCsv(text);
    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(1);
  });

  it('handles BOM at start of file', () => {
    const text = `﻿${validCsvHeader}
Alice,Common,common,100,50,1,100`;

    const result = parseCsv(text);
    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(1);
  });

  it('handles quoted fields with commas inside', () => {
    const text = `${validCsvHeader},Notes
"Alice, Inc.",Common,common,100,50,1,100,"a, b, c"`;

    const result = parseCsv(text);
    expect(result.errors).toEqual([]);
    expect(result.rows[0].holder).toBe('Alice, Inc.');
    expect(result.rows[0].notes).toBe('a, b, c');
  });

  it('handles quoted fields containing newlines', () => {
    const text = `${validCsvHeader},Notes
Alice,Common,common,100,50,1,100,"line one
line two"`;

    const result = parseCsv(text);
    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].notes).toBe('line one\nline two');
  });

  it('preserves all 13 columns when supplied', () => {
    const text = `Holder,Class,Instrument,Shares,Ownership %,Price per Share,Amount Invested,Round,Round Valuation,Vesting Start,Vesting Schedule,Certificate / Grant #,Notes
Alice,Common,common,100,50,1,100,Founders,1000000,2024-01-01,4yr/1yr cliff,CS-1,Founder shares`;

    const result = parseCsv(text);
    expect(result.errors).toEqual([]);
    expect(result.rows[0]).toMatchObject({
      round: 'Founders',
      roundValuation: '1000000',
      vestingStart: '2024-01-01',
      vestingSchedule: '4yr/1yr cliff',
      certificateNumber: 'CS-1',
      notes: 'Founder shares',
    });
  });

  it('case-insensitive instrument values', () => {
    const text = `${validCsvHeader}
Alice,Common,COMMON,100,50,1,100
Bob,Series A,Preferred,50,30,2,100
Carol,Option,Option,25,20,0.5,0`;

    const result = parseCsv(text);
    expect(result.errors).toEqual([]);
    expect(result.rows.map((r) => r.instrument)).toEqual(['common', 'preferred', 'option']);
  });
});

describe('parseCsv — lenient headers', () => {
  it('accepts alias header spellings', () => {
    const text = `Stakeholder,Share Class,Quantity,% Ownership,Strike Price,Investment
Alice,Common Stock,1000,100,0.25,250`;

    const result = parseCsv(text);
    expect(result.errors).toEqual([]);
    expect(result.rows[0]).toMatchObject({
      holder: 'Alice',
      className: 'Common Stock',
      instrument: 'common',
      shares: 1000,
      ownershipPercent: '100',
      pricePerShare: '0.25',
      amountInvested: '250',
    });
  });

  it('accepts semicolon-delimited files', () => {
    const text = `Holder;Class;Shares;Ownership %
Alice;Common;1000;100`;

    const result = parseCsv(text);
    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].shares).toBe(1000);
  });

  it('needs only Holder, Shares and one class/instrument column', () => {
    const text = `Holder,Class,Shares
Alice,Common,1000`;

    const result = parseCsv(text);
    expect(result.errors).toEqual([]);
    expect(result.rows[0]).toMatchObject({ pricePerShare: '0', amountInvested: '0' });
  });

  it('accepts an Instrument column with no Class column', () => {
    const text = `Holder,Instrument,Shares
Alice,common,1000`;

    const result = parseCsv(text);
    expect(result.errors).toEqual([]);
    expect(result.rows[0]).toMatchObject({ className: 'common', instrument: 'common' });
  });
});

describe('parseCsv — lenient values', () => {
  it('strips thousands separators, currency symbols and percent signs', () => {
    const text = `${validCsvHeader}
Alice,Common,common,"9,000,000",63.38%,"$1.10","$9,900,000"`;

    const result = parseCsv(text);
    expect(result.errors).toEqual([]);
    expect(result.rows[0]).toMatchObject({
      shares: 9000000,
      ownershipPercent: '63.38',
      pricePerShare: '1.1',
      amountInvested: '9900000',
    });
  });

  it('infers the instrument from Class text when Instrument is unrecognised', () => {
    const text = `Instrument,Holder,Class,Shares,Ownership %
CS-1,Alice,Common,100,25
ES-4,Bob,Option (NSO),100,25
PS-1,Carol,Series A Preferred,100,25
W-1,Dave,Warrant,100,25`;

    const result = parseCsv(text);
    expect(result.errors).toEqual([]);
    expect(result.rows.map((r) => r.instrument)).toEqual(['common', 'option', 'preferred', 'warrant']);
  });

  it('keeps an unrecognised Instrument value as the certificate number', () => {
    const text = `Instrument,Holder,Class,Shares,Ownership %
CS-1,Alice,Common,100,100`;

    const result = parseCsv(text);
    expect(result.rows[0].certificateNumber).toBe('CS-1');
  });

  it('folds a Status column into Notes', () => {
    const text = `Holder,Class,Shares,Ownership %,Status
Alice,Common,100,50,Outstanding
Bob,Common,100,50,Forfeited`;

    const result = parseCsv(text);
    expect(result.rows.map((r) => r.notes)).toEqual(['Status: Outstanding', 'Status: Forfeited']);
  });

  it('derives Ownership % from share count when the column is blank', () => {
    const text = `Holder,Class,Shares,Ownership %
Alice,Common,750,
Bob,Common,250,`;

    const result = parseCsv(text);
    expect(result.errors).toEqual([]);
    expect(result.rows.map((r) => r.ownershipPercent)).toEqual(['75', '25']);
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: 'OWNERSHIP_DERIVED' }),
    );
  });

  it('defaults blank Price per Share and Amount Invested to 0', () => {
    const text = `${validCsvHeader}
Alice,Common,common,100,100,,`;

    const result = parseCsv(text);
    expect(result.errors).toEqual([]);
    expect(result.rows[0]).toMatchObject({ pricePerShare: '0', amountInvested: '0' });
  });

  it('clamps out-of-range Ownership % instead of failing', () => {
    const text = `${validCsvHeader}
Alice,Common,common,100,150,1,100`;

    const result = parseCsv(text);
    expect(result.errors).toEqual([]);
    expect(result.rows[0].ownershipPercent).toBe('100');
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: 'OWNERSHIP_CLAMPED', row: 2 }),
    );
  });

  it('warns and defaults instead of failing on a negative Price or Amount', () => {
    const text = `${validCsvHeader}
Alice,Common,common,100,100,-1,-100`;

    const result = parseCsv(text);
    expect(result.errors).toEqual([]);
    expect(result.rows[0]).toMatchObject({ pricePerShare: '0', amountInvested: '0' });
    expect(result.warnings.filter((w) => w.code === 'VALUE_IGNORED')).toHaveLength(2);
  });

  it('accepts non-ISO Vesting Start dates', () => {
    const text = `Holder,Class,Shares,Ownership %,Vesting Start
Alice,Common,25,25,01/15/2024
Bob,Common,25,25,15-Jan-2024
Carol,Common,25,25,"Jan 15, 2024"
Dave,Common,25,25,2024-1-5`;

    const result = parseCsv(text);
    expect(result.errors).toEqual([]);
    expect(result.rows.map((r) => r.vestingStart)).toEqual([
      '2024-01-15', '2024-01-15', '2024-01-15', '2024-01-05',
    ]);
  });

  it('warns and blanks an unparseable Vesting Start instead of failing', () => {
    const text = `Holder,Class,Shares,Ownership %,Vesting Start
Alice,Common,100,100,not-a-date`;

    const result = parseCsv(text);
    expect(result.errors).toEqual([]);
    expect(result.rows[0].vestingStart).toBeNull();
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: 'VALUE_IGNORED', row: 2 }),
    );
  });

  it('rounds fractional shares with a warning', () => {
    const text = `Holder,Class,Shares,Ownership %
Alice,Common,100.4,100`;

    const result = parseCsv(text);
    expect(result.rows[0].shares).toBe(100);
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: 'SHARES_ROUNDED', row: 2 }),
    );
  });
});

describe('parseCsv — skipping rather than failing', () => {
  it('drops totals and blank rows silently', () => {
    const text = `Holder,Class,Shares,Ownership %
Alice,Common,750,75
Bob,Common,250,25
,,,
Total — all securities,,1000,100`;

    const result = parseCsv(text);
    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(2);
    expect(result.warnings.find((w) => w.code === 'ROW_SKIPPED')).toBeUndefined();
  });

  it('skips a row with an unusable Shares value and imports the rest', () => {
    const text = `${validCsvHeader}
Alice,Common,common,100,50,1,100
Bob,Common,common,abc,50,1,100
Carol,Common,common,-5,50,1,100`;

    const result = parseCsv(text);
    expect(result.errors).toEqual([]);
    expect(result.rows.map((r) => r.holder)).toEqual(['Alice']);
    expect(result.warnings.filter((w) => w.code === 'ROW_SKIPPED')).toHaveLength(2);
  });

  it('defaults an unrecognisable instrument to common with a warning', () => {
    const text = `${validCsvHeader}
Alice,Widgets,bogus,100,100,1,100`;

    const result = parseCsv(text);
    expect(result.errors).toEqual([]);
    expect(result.rows[0].instrument).toBe('common');
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: 'INSTRUMENT_INFERRED', row: 2 }),
    );
  });
});

describe('parseCsv — errors', () => {
  it('errors when Holder, Class and Instrument are all absent from the header', () => {
    const text = `Shares,Ownership %
100,50`;

    const result = parseCsv(text);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ code: 'MISSING_REQUIRED_COLUMN', column: 'Holder' }),
    );
    expect(result.errors).toContainEqual(
      expect.objectContaining({ code: 'MISSING_REQUIRED_COLUMN', column: 'Class' }),
    );
    expect(result.rows).toHaveLength(0);
  });

  it('errors when a Shares column is missing entirely', () => {
    const text = `Holder,Class
Alice,Common`;

    const result = parseCsv(text);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ code: 'MISSING_REQUIRED_COLUMN', column: 'Shares' }),
    );
  });

  it('errors when no row survives parsing', () => {
    const text = `Holder,Class,Shares
,,
Total,,100`;

    const result = parseCsv(text);
    expect(result.errors).toContainEqual(expect.objectContaining({ code: 'NO_VALID_ROWS' }));
  });

  it('returns empty rows + at least one error for completely empty CSV', () => {
    const result = parseCsv('');
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.rows).toHaveLength(0);
  });
});

describe('parseCsv — warnings', () => {
  it('warns when ownership % sum deviates from 100 by > 0.5', () => {
    const text = `${validCsvHeader}
Alice,Common,common,100,30,1,100
Bob,Common,common,100,40,1,100`;

    const result = parseCsv(text);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: 'OWNERSHIP_SUM_DEVIATION' }),
    );
  });

  it('warns when Shares × Price ≠ Amount Invested for purchases (>$1)', () => {
    const text = `${validCsvHeader}
Alice,Common,common,100,100,1,200`;

    const result = parseCsv(text);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: 'PURCHASE_MATH_MISMATCH', row: 2 }),
    );
  });

  it('does NOT warn on purchase math when Price or Amount was left blank', () => {
    const text = `${validCsvHeader}
Alice,Common,common,100,100,,`;

    const result = parseCsv(text);
    expect(result.warnings.find((w) => w.code === 'PURCHASE_MATH_MISMATCH')).toBeUndefined();
  });

  it('does NOT warn for purchase math on options/RSUs/SAFEs (Amount Invested = 0 is expected)', () => {
    const text = `${validCsvHeader}
Alice,ESOP,option,100,50,1,0
Bob,Stock Plan,rsu,50,50,1,0`;

    const result = parseCsv(text);
    expect(result.warnings.find((w) => w.code === 'PURCHASE_MATH_MISMATCH')).toBeUndefined();
  });

  it('warns rather than errors when Round Valuation differs within a Round', () => {
    const text = `Holder,Class,Instrument,Shares,Ownership %,Price per Share,Amount Invested,Round,Round Valuation
Alice,Series A,preferred,100,50,10,1000,Series A,5000000
Bob,Series A,preferred,200,50,10,2000,Series A,6000000`;

    const result = parseCsv(text);
    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(2);
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: 'ROUND_VALUATION_MISMATCH' }),
    );
  });

  it('warns when a preferred row has empty Round', () => {
    const text = `${validCsvHeader}
Alice,Series A,preferred,100,100,10,1000`;

    const result = parseCsv(text);
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: 'PREFERRED_NO_ROUND', row: 2 }),
    );
  });

  it('does not warn for common/option/etc rows without Round', () => {
    const text = `${validCsvHeader}
Alice,Common,common,100,100,0.0001,0.01`;

    const result = parseCsv(text);
    expect(result.warnings.find((w) => w.code === 'PREFERRED_NO_ROUND')).toBeUndefined();
  });
});

describe('parseCsv — real-world Carta-style export', () => {
  // Cert ids in the Instrument column, type in Class, an extra Status column,
  // comma-formatted shares, blank Price/Amount, and a totals footer.
  const realWorld = `﻿Instrument,Holder,Class,Price per share,Status,Shares,Ownership %,Amount Invested,,,
CS-1,Michael Hauptman,Common,,Outstanding,"9,000,000",63.38%,,,,
CS-2,Daniel Tyner-Bryan,Common,,Canceled,40,0.00%,,,,
ES-4,Daniel Bougourd,Option (NSO),$0.25,Outstanding,"2,500,000",17.61%,,,,
ES-6,William Batson,Option (ISO/NSO),$1.10,Outstanding,"689,474",4.86%,,,,
ES-1,Cynthia Kidney,Option (ISO),$0.57,Forfeited,"235,000",0.00%,,,,
—,Unallocated option reserve,Option pool,,Pool,"258,526",1.82%,,,,
Total — all securities,,,,,"14,460,040",100%,,,,
,,,,,,,,,,`;

  it('imports every holder row without a single error', () => {
    const result = parseCsv(realWorld);

    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(6);
  });

  it('maps cert ids, instruments, shares and status correctly', () => {
    const result = parseCsv(realWorld);

    expect(result.rows[0]).toMatchObject({
      holder: 'Michael Hauptman',
      className: 'Common',
      instrument: 'common',
      shares: 9000000,
      ownershipPercent: '63.38',
      pricePerShare: '0',
      amountInvested: '0',
      certificateNumber: 'CS-1',
      notes: 'Status: Outstanding',
    });
    expect(result.rows[2]).toMatchObject({
      holder: 'Daniel Bougourd',
      instrument: 'option',
      shares: 2500000,
      pricePerShare: '0.25',
      certificateNumber: 'ES-4',
    });
    expect(result.rows[4]).toMatchObject({
      holder: 'Cynthia Kidney',
      instrument: 'option',
      ownershipPercent: '0',
      notes: 'Status: Forfeited',
    });
    expect(result.rows[5]).toMatchObject({
      holder: 'Unallocated option reserve',
      className: 'Option pool',
      instrument: 'option',
      shares: 258526,
    });
  });

  it('drops the totals footer and trailing blank line', () => {
    const result = parseCsv(realWorld);
    expect(result.rows.find((r) => /total/i.test(r.holder))).toBeUndefined();
    expect(result.warnings.filter((w) => w.code === 'ROW_SKIPPED')).toHaveLength(0);
  });
});
