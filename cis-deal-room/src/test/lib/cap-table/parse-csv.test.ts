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

describe('parseCsv — errors', () => {
  it('errors when a required column is missing from the header', () => {
    const text = `Holder,Class,Instrument,Shares,Ownership %,Price per Share
Alice,Common,common,100,50,1`;

    const result = parseCsv(text);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ code: 'MISSING_REQUIRED_COLUMN', message: expect.stringContaining('Amount Invested') }),
    );
    expect(result.rows).toHaveLength(0);
  });

  it('errors when a required field is empty in any row', () => {
    const text = `${validCsvHeader}
Alice,Common,common,,50,1,100`;

    const result = parseCsv(text);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ code: 'MISSING_REQUIRED_FIELD', row: 2 }),
    );
  });

  it('errors when Instrument is not a valid enum value', () => {
    const text = `${validCsvHeader}
Alice,Common,bogus,100,50,1,100`;

    const result = parseCsv(text);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ code: 'INVALID_INSTRUMENT', row: 2 }),
    );
  });

  it('errors when Shares is negative or non-numeric', () => {
    const text = `${validCsvHeader}
Alice,Common,common,-5,50,1,100
Bob,Common,common,abc,50,1,100`;

    const result = parseCsv(text);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ code: 'INVALID_SHARES', row: 2 }),
    );
    expect(result.errors).toContainEqual(
      expect.objectContaining({ code: 'INVALID_SHARES', row: 3 }),
    );
  });

  it('errors when Ownership % is outside 0-100', () => {
    const text = `${validCsvHeader}
Alice,Common,common,100,150,1,100`;

    const result = parseCsv(text);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ code: 'INVALID_OWNERSHIP', row: 2 }),
    );
  });

  it('errors when Price per Share or Amount Invested is negative', () => {
    const text = `${validCsvHeader}
Alice,Common,common,100,50,-1,100
Bob,Common,common,100,50,1,-100`;

    const result = parseCsv(text);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ code: 'INVALID_PRICE', row: 2 }),
    );
    expect(result.errors).toContainEqual(
      expect.objectContaining({ code: 'INVALID_AMOUNT', row: 3 }),
    );
  });

  it('errors when Round Valuation differs across rows in the same Round', () => {
    const text = `Holder,Class,Instrument,Shares,Ownership %,Price per Share,Amount Invested,Round,Round Valuation
Alice,Series A,preferred,100,30,10,1000,Series A,5000000
Bob,Series A,preferred,200,40,10,2000,Series A,6000000`;

    const result = parseCsv(text);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ code: 'ROUND_VALUATION_MISMATCH' }),
    );
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
Alice,Common,common,100,50,1,200`;

    const result = parseCsv(text);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: 'PURCHASE_MATH_MISMATCH', row: 2 }),
    );
  });

  it('does NOT warn for purchase math on options/RSUs/SAFEs (Amount Invested = 0 is expected)', () => {
    const text = `${validCsvHeader}
Alice,ESOP,option,100,50,1,0
Bob,Stock Plan,rsu,50,30,1,0`;

    const result = parseCsv(text);
    expect(result.warnings.find((w) => w.code === 'PURCHASE_MATH_MISMATCH')).toBeUndefined();
  });

  it('warns when a preferred row has empty Round', () => {
    const text = `${validCsvHeader}
Alice,Series A,preferred,100,50,10,1000`;

    const result = parseCsv(text);
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: 'PREFERRED_NO_ROUND', row: 2 }),
    );
  });

  it('does not warn for common/option/etc rows without Round', () => {
    const text = `${validCsvHeader}
Alice,Common,common,100,50,0.0001,0.01`;

    const result = parseCsv(text);
    expect(result.warnings.find((w) => w.code === 'PREFERRED_NO_ROUND')).toBeUndefined();
  });
});

describe('parseCsv — edge cases', () => {
  it('handles trailing empty lines', () => {
    const text = `${validCsvHeader}
Alice,Common,common,100,50,1,100


`;

    const result = parseCsv(text);
    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(1);
  });

  it('errors with INVALID_DATE on malformed Vesting Start', () => {
    const text = `Holder,Class,Instrument,Shares,Ownership %,Price per Share,Amount Invested,Vesting Start
Alice,Common,common,100,50,1,100,not-a-date`;

    const result = parseCsv(text);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ code: 'INVALID_DATE', row: 2 }),
    );
  });

  it('returns empty rows + at least one error for completely empty CSV', () => {
    const result = parseCsv('');
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.rows).toHaveLength(0);
  });
});
