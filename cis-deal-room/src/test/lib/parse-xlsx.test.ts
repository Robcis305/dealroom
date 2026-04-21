import { describe, it, expect } from 'vitest';
import { parseChecklistXlsx } from '@/lib/checklist/parse-xlsx';
import * as XLSX from 'xlsx';

function buildSheet(rows: Array<Record<string, string>>): ArrayBuffer {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  return XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
}

describe('parseChecklistXlsx', () => {
  it('parses valid rows with all columns', () => {
    const buf = buildSheet([
      { '#': '29', Category: 'Legal', Item: 'Corporate Formation Documents',
        Description: 'Articles…', Priority: 'High', Owner: 'Seller', Notes: '' },
    ]);
    const result = parseChecklistXlsx(buf);
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
    const result = parseChecklistXlsx(buf);
    expect(result.valid).toHaveLength(0);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].reason).toMatch(/Category/);
  });

  it('rejects rows missing Item', () => {
    const buf = buildSheet([
      { Category: 'Legal', Owner: 'Seller' },
    ]);
    const result = parseChecklistXlsx(buf);
    expect(result.valid).toHaveLength(0);
    expect(result.rejected[0].reason).toMatch(/Item/);
  });

  it('coerces unknown Priority to medium', () => {
    const buf = buildSheet([
      { Category: 'Legal', Item: 'Foo', Priority: 'Extreme' },
    ]);
    const result = parseChecklistXlsx(buf);
    expect(result.valid[0].priority).toBe('medium');
  });

  it('coerces unknown Owner to unassigned', () => {
    const buf = buildSheet([
      { Category: 'Legal', Item: 'Foo', Owner: 'Whoever' },
    ]);
    const result = parseChecklistXlsx(buf);
    expect(result.valid[0].owner).toBe('unassigned');
  });

  it('accepts aliases: Description / Request Detail', () => {
    const buf = buildSheet([
      { Category: 'Legal', Item: 'Foo', 'Request Detail': 'body' },
    ]);
    const result = parseChecklistXlsx(buf);
    expect(result.valid[0].description).toBe('body');
  });

  it('is case-insensitive on headers', () => {
    const buf = buildSheet([
      { category: 'Legal', item: 'Foo' },
    ]);
    const result = parseChecklistXlsx(buf);
    expect(result.valid).toHaveLength(1);
  });

  it('falls back to row index when # is missing', () => {
    const buf = buildSheet([
      { Category: 'Legal', Item: 'A' },
      { Category: 'Legal', Item: 'B' },
    ]);
    const result = parseChecklistXlsx(buf);
    expect(result.valid[0].sortOrder).toBe(1);
    expect(result.valid[1].sortOrder).toBe(2);
  });
});
