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
  },
}));

import * as XLSX from 'xlsx';

const csvMime = 'text/csv';
const xlsxMime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function mockWorkbook(rows: unknown[], sheetNames = ['Sheet1']) {
  vi.mocked(XLSX.read).mockReturnValue({
    SheetNames: sheetNames,
    Sheets: Object.fromEntries(sheetNames.map((n) => [n, {}])),
  } as never);
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
    const rows = Array.from({ length: 50 }, (_, i) => ({ a: `row${i}`, b: i }));
    mockWorkbook(rows);
    vi.mocked(global.fetch).mockResolvedValue(
      new Response(new ArrayBuffer(8), { status: 200 })
    );

    render(<SheetPreview url="https://example.com/small.csv" mimeType={csvMime} sizeBytes={5000} />);
    expect(await screen.findByText('row0')).toBeInTheDocument();
    expect(screen.queryByText(/showing first 1,000/i)).toBeNull();
  });

  it('shows truncation banner when parsed rows exceed 1,000', async () => {
    const rows = Array.from({ length: 1234 }, (_, i) => ({ a: i }));
    mockWorkbook(rows);
    vi.mocked(global.fetch).mockResolvedValue(
      new Response(new ArrayBuffer(8), { status: 200 })
    );

    render(<SheetPreview url="https://example.com/big.csv" mimeType={csvMime} sizeBytes={200000} />);
    expect(await screen.findByText(/Showing first 1,000 of 1,234 rows/i)).toBeInTheDocument();
  });

  it('shows multi-sheet banner when an XLSX has more than one sheet', async () => {
    mockWorkbook([{ a: 1 }], ['Sheet1', 'Sheet2', 'Sheet3']);
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
