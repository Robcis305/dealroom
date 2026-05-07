import { describe, it, expect } from 'vitest';
import { parseChecklistFile } from '@/lib/checklist/parse-checklist-file';
import * as XLSX from 'xlsx';

function buildSheet(rows: Array<Record<string, string>>): ArrayBuffer {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  return XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
}

/**
 * Build a sheet from an array-of-arrays (rows of cells). Lets tests produce
 * .xlsx files with a title row, merged section banners, or blank spacers
 * above the actual column headers — i.e., real-world diligence checklist
 * shapes where headers aren't on row 1.
 */
function buildSheetRaw(rows: unknown[][]): ArrayBuffer {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  return XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
}

describe('parseChecklistFile — XLSX input', () => {
  it('parses valid rows with all columns', () => {
    const buf = buildSheet([
      { '#': '29', Category: 'Legal', Item: 'Corporate Formation Documents',
        Description: 'Articles…', Priority: 'High', Owner: 'Seller', Notes: '' },
    ]);
    const result = parseChecklistFile({ buffer: buf, filename: 'fixture.xlsx' });
    expect(result.valid).toHaveLength(1);
    expect(result.valid[0]).toMatchObject({
      sortOrder: 29,
      category: 'Legal',
      name: 'Corporate Formation Documents',
      description: 'Articles…',
      priority: 'high',
      owner: 'seller',
    });
    expect(result.rejected).toHaveLength(0);
  });

  it('rejects rows missing Category', () => {
    const buf = buildSheet([
      { Item: 'Cap Table', Owner: 'Seller' },
    ]);
    const result = parseChecklistFile({ buffer: buf, filename: 'fixture.xlsx' });
    expect(result.valid).toHaveLength(0);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].reason).toMatch(/Category/);
  });

  it('rejects rows missing Item', () => {
    const buf = buildSheet([
      { Category: 'Legal', Owner: 'Seller' },
    ]);
    const result = parseChecklistFile({ buffer: buf, filename: 'fixture.xlsx' });
    expect(result.valid).toHaveLength(0);
    expect(result.rejected[0].reason).toMatch(/Item/);
  });

  it('coerces unknown Priority to medium', () => {
    const buf = buildSheet([
      { Category: 'Legal', Item: 'Foo', Priority: 'Extreme' },
    ]);
    const result = parseChecklistFile({ buffer: buf, filename: 'fixture.xlsx' });
    expect(result.valid[0].priority).toBe('medium');
  });

  it('coerces unknown Owner to unassigned', () => {
    const buf = buildSheet([
      { Category: 'Legal', Item: 'Foo', Owner: 'Whoever' },
    ]);
    const result = parseChecklistFile({ buffer: buf, filename: 'fixture.xlsx' });
    expect(result.valid[0].owner).toBe('unassigned');
  });

  it('accepts aliases: Description / Request Detail', () => {
    const buf = buildSheet([
      { Category: 'Legal', Item: 'Foo', 'Request Detail': 'body' },
    ]);
    const result = parseChecklistFile({ buffer: buf, filename: 'fixture.xlsx' });
    expect(result.valid[0].description).toBe('body');
  });

  it('is case-insensitive on headers', () => {
    const buf = buildSheet([
      { category: 'Legal', item: 'Foo' },
    ]);
    const result = parseChecklistFile({ buffer: buf, filename: 'fixture.xlsx' });
    expect(result.valid).toHaveLength(1);
  });

  it('falls back to row index when # is missing', () => {
    const buf = buildSheet([
      { Category: 'Legal', Item: 'A' },
      { Category: 'Legal', Item: 'B' },
    ]);
    const result = parseChecklistFile({ buffer: buf, filename: 'fixture.xlsx' });
    expect(result.valid[0].sortOrder).toBe(1);
    expect(result.valid[1].sortOrder).toBe(2);
  });

  it('detects header row when it is not on row 1', () => {
    // Row 1: title, Row 2: blank, Row 3: headers, Row 4+: data
    const buf = buildSheetRaw([
      ['Rayobyte Diligence Checklist'],
      [],
      ['#', 'Category', 'Item', 'Priority', 'Owner'],
      ['29', 'Legal', 'Corporate Formation Docs', 'High', 'Seller'],
      ['30', 'Legal', 'Cap Table', 'Critical', 'Seller'],
    ]);
    const result = parseChecklistFile({ buffer: buf, filename: 'fixture.xlsx' });
    expect(result.valid).toHaveLength(2);
    expect(result.rejected).toHaveLength(0);
    expect(result.valid[0]).toMatchObject({
      sortOrder: 29, category: 'Legal', name: 'Corporate Formation Docs', priority: 'high', owner: 'seller',
    });
  });

  it('skips fully blank rows silently (no spurious rejections)', () => {
    const buf = buildSheetRaw([
      ['#', 'Category', 'Item'],
      ['29', 'Legal', 'A'],
      ['', '', ''],
      ['30', 'Legal', 'B'],
    ]);
    const result = parseChecklistFile({ buffer: buf, filename: 'fixture.xlsx' });
    expect(result.valid).toHaveLength(2);
    expect(result.rejected).toHaveLength(0);
  });

  it('tolerates section banner rows between data (rejects them, no valid items lost)', () => {
    // A banner row with only "Legal" in column A is neither blank nor a valid
    // row (missing Item). It lands in `rejected`, real data still parses.
    const buf = buildSheetRaw([
      ['#', 'Category', 'Item'],
      ['Legal', '', ''],
      ['29', 'Legal', 'Corporate Formation Docs'],
      ['30', 'Legal', 'Cap Table'],
    ]);
    const result = parseChecklistFile({ buffer: buf, filename: 'fixture.xlsx' });
    expect(result.valid).toHaveLength(2);
    expect(result.rejected).toHaveLength(1);
  });

  it('reports a helpful error when no Category column is present anywhere', () => {
    const buf = buildSheetRaw([
      ['Title', '', ''],
      ['Section', '', ''],
      ['Some', 'Random', 'Text'],
    ]);
    const result = parseChecklistFile({ buffer: buf, filename: 'fixture.xlsx' });
    expect(result.valid).toHaveLength(0);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].reason).toMatch(/Category.*column header/i);
  });

  it('scans every sheet and uses the first one with a Category header', () => {
    // Mirrors Rob's real file: Instructions sheet first (no Category), then the
    // actual DD Request List sheet second, then a Summary sheet last.
    const wb = XLSX.utils.book_new();
    const instructions = XLSX.utils.aoa_to_sheet([
      ['Instructions'],
      ['Fill in the columns and owner will mark Received as requests come in.'],
    ]);
    const dd = XLSX.utils.aoa_to_sheet([
      ['#', 'Category', 'Item', 'Priority', 'Owner'],
      ['Legal', '', '', '', ''],
      ['29', 'Legal', 'Corporate Formation Docs', 'High', 'Seller'],
      ['30', 'Legal', 'Cap Table', 'Critical', 'Seller'],
    ]);
    const summary = XLSX.utils.aoa_to_sheet([
      ['Metric', 'Count'],
      ['Open', '2'],
    ]);
    XLSX.utils.book_append_sheet(wb, instructions, 'Instructions');
    XLSX.utils.book_append_sheet(wb, dd, 'DD Request List');
    XLSX.utils.book_append_sheet(wb, summary, 'Summary');
    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });

    const result = parseChecklistFile({ buffer: buf, filename: 'fixture.xlsx' });
    expect(result.valid).toHaveLength(2);
    expect(result.valid.map((v) => v.name)).toEqual([
      'Corporate Formation Docs',
      'Cap Table',
    ]);
    // The "Legal" banner row lands in rejected (it has 'Legal' in column A,
    // so the Category column is empty → Missing Category). Real data still parses.
    expect(result.rejected).toHaveLength(1);
  });
});

describe('parseChecklistFile — CSV input', () => {
  it('parses a minimal CSV with the same shape as XLSX', () => {
    const csv = `#,Category,Item,Description,Priority,Owner,Notes
1,Financial,Audited Financials,Last 3 years,critical,seller,
2,Legal,Cap Table,Reconciled with Carta,critical,seller,Use Carta export`;
    const buffer = new TextEncoder().encode(csv).buffer;

    const result = parseChecklistFile({ buffer, filename: 'request-list.csv' });
    expect(result.valid).toHaveLength(2);
    expect(result.valid[0]).toMatchObject({
      sortOrder: 1,
      category: 'Financial',
      name: 'Audited Financials',
      priority: 'critical',
      owner: 'seller',
    });
  });

  it('detects format from filename extension (case-insensitive)', () => {
    const csv = `#,Category,Item,Priority,Owner
1,X,Y,medium,buyer`;
    const buffer = new TextEncoder().encode(csv).buffer;

    const upper = parseChecklistFile({ buffer, filename: 'list.CSV' });
    const lower = parseChecklistFile({ buffer, filename: 'list.csv' });
    expect(upper.valid).toHaveLength(1);
    expect(lower.valid).toHaveLength(1);
  });

  it('rejects CSV rows missing Category', () => {
    const csv = `#,Item,Priority
1,Cap Table,high`;
    const buffer = new TextEncoder().encode(csv).buffer;

    const result = parseChecklistFile({ buffer, filename: 'test.csv' });
    expect(result.valid).toHaveLength(0);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].reason).toMatch(/Category/);
  });

  it('coerces unknown Priority and Owner in CSV', () => {
    const csv = `#,Category,Item,Priority,Owner
1,Legal,Foo,Extreme,Whoever`;
    const buffer = new TextEncoder().encode(csv).buffer;

    const result = parseChecklistFile({ buffer, filename: 'test.csv' });
    expect(result.valid[0].priority).toBe('medium');
    expect(result.valid[0].owner).toBe('unassigned');
  });
});
