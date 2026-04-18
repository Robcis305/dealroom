import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { SheetPreview } from './SheetPreview';

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

vi.mock('xlsx', () => ({
  read: vi.fn(),
  utils: {
    sheet_to_json: vi.fn(),
    decode_range: vi.fn().mockReturnValue({ s: { r: 0, c: 0 }, e: { r: 0, c: 0 } }),
    encode_range: vi.fn().mockReturnValue('A1'),
  },
}));

import * as XLSX from 'xlsx';

const csvMime = 'text/csv';
const xlsxMime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * Build a workbook mock where `rows` is a string[][] in header:1 format:
 * row[0] is the header row, row[1..n] are data rows.
 */
function mockWorkbook(rows: string[][], sheetNames = ['Sheet1']) {
  vi.mocked(XLSX.read).mockReturnValue({
    SheetNames: sheetNames,
    Sheets: Object.fromEntries(sheetNames.map((n) => [n, { '!ref': 'A1' }])),
  } as never);
  vi.mocked(XLSX.utils.decode_range).mockReturnValue({ s: { r: 0, c: 0 }, e: { r: rows.length - 1, c: (rows[0]?.length ?? 1) - 1 } } as never);
  vi.mocked(XLSX.utils.encode_range).mockReturnValue('A1' as never);
  vi.mocked(XLSX.utils.sheet_to_json).mockReturnValue(rows as never);
}

describe('SheetPreview', () => {
  it('shows the "too large" state when sizeBytes > 10MB and does not fetch', async () => {
    const eleven_mb = 11 * 1024 * 1024;
    render(<SheetPreview url="https://example.com/big.csv" mimeType={csvMime} sizeBytes={eleven_mb} />);
    expect(await screen.findByText(/too large to preview/i)).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('fetches, parses, and renders up to 1,000 rows when file is under the cap', async () => {
    // header row + 50 data rows in header:1 format
    const headerRow = ['a', 'b'];
    const dataRows = Array.from({ length: 50 }, (_, i) => [`row${i}`, String(i)]);
    mockWorkbook([headerRow, ...dataRows]);
    vi.mocked(global.fetch).mockResolvedValue(
      new Response(new ArrayBuffer(8), { status: 200 })
    );

    render(<SheetPreview url="https://example.com/small.csv" mimeType={csvMime} sizeBytes={5000} />);
    expect(await screen.findByText('row0')).toBeInTheDocument();
    expect(screen.queryByText(/showing first 1,000/i)).toBeNull();
  });

  it('shows truncation banner when parsed rows exceed 1,000', async () => {
    // header row + 1234 data rows = 1235 total rows; totalRows = 1234
    const headerRow = ['a'];
    const dataRows = Array.from({ length: 1234 }, (_, i) => [String(i)]);
    mockWorkbook([headerRow, ...dataRows]);
    vi.mocked(global.fetch).mockResolvedValue(
      new Response(new ArrayBuffer(8), { status: 200 })
    );

    render(<SheetPreview url="https://example.com/big.csv" mimeType={csvMime} sizeBytes={200000} />);
    expect(await screen.findByText(/Showing first 1,000 rows.*of.*1,234 rows/i)).toBeInTheDocument();
  });

  it('shows banner with 49,999 total rows (not 999) for a 50k-row sheet', async () => {
    // Simulate a 50k-row sheet: decode_range returns e.r=49999, e.c=199
    // After clipping to MAX_ROWS=1000 rows, sheet_to_json returns only 1001 rows (header + 1000 data).
    const headerRow = Array.from({ length: 200 }, (_, i) => `col${i}`);
    const clippedDataRows = Array.from({ length: 1000 }, (_, i) => headerRow.map(() => String(i)));
    vi.mocked(XLSX.utils.decode_range).mockReturnValue(
      { s: { r: 0, c: 0 }, e: { r: 49999, c: 199 } } as never
    );
    vi.mocked(XLSX.utils.encode_range).mockReturnValue('A1' as never);
    vi.mocked(XLSX.utils.sheet_to_json).mockReturnValue([headerRow, ...clippedDataRows] as never);
    vi.mocked(XLSX.read).mockReturnValue({
      SheetNames: ['Sheet1'],
      Sheets: { Sheet1: { '!ref': 'A1' } },
    } as never);
    vi.mocked(global.fetch).mockResolvedValue(
      new Response(new ArrayBuffer(8), { status: 200 })
    );

    render(<SheetPreview url="https://example.com/huge.xlsx" mimeType={xlsxMime} sizeBytes={200000} />);
    // Banner must show 49,999 (the real row count from decode_range), not 999 (the clipped count).
    const banner = await screen.findByText(/49,999 rows/i);
    expect(banner).toBeInTheDocument();
    // The banner text should NOT reference "of 999 rows" (which would be the clipped value).
    expect(banner.textContent).not.toMatch(/of 999 rows/);
  });

  it('shows multi-sheet banner when an XLSX has more than one sheet', async () => {
    mockWorkbook([['a'], ['1']], ['Sheet1', 'Sheet2', 'Sheet3']);
    vi.mocked(global.fetch).mockResolvedValue(
      new Response(new ArrayBuffer(8), { status: 200 })
    );

    render(<SheetPreview url="https://example.com/multi.xlsx" mimeType={xlsxMime} sizeBytes={200000} />);
    expect(await screen.findByText(/3 sheets/i)).toBeInTheDocument();
  });

  it('shows parse-error state when XLSX.read throws', async () => {
    vi.mocked(XLSX.read).mockImplementation(() => {
      throw new Error('corrupt');
    });
    vi.mocked(global.fetch).mockResolvedValue(
      new Response(new ArrayBuffer(8), { status: 200 })
    );

    render(<SheetPreview url="https://example.com/bad.xlsx" mimeType={xlsxMime} sizeBytes={200000} />);
    expect(await screen.findByText(/couldn't be parsed/i)).toBeInTheDocument();
  });
});
