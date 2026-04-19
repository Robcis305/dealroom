'use client';

import { useEffect, useState } from 'react';
import { PREVIEW_ROW_CAP, PREVIEW_SIZE_CAP_BYTES } from '@/lib/preview';

const MAX_ROWS = 1000;
const MAX_COLS = 200;

type State =
  | { status: 'loading' }
  | { status: 'too-large' }
  | { status: 'parse-error' }
  | {
      status: 'ready';
      rows: string[][];
      totalRows: number;
      totalCols: number;
      sheetCount: number;
      headers: string[];
    };

interface SheetPreviewProps {
  url: string;
  mimeType: string;
  sizeBytes: number;
}

export function SheetPreview({ url, sizeBytes }: SheetPreviewProps) {
  const [state, setState] = useState<State>(
    sizeBytes > PREVIEW_SIZE_CAP_BYTES ? { status: 'too-large' } : { status: 'loading' }
  );

  useEffect(() => {
    if (sizeBytes > PREVIEW_SIZE_CAP_BYTES) return;
    let aborted = false;

    (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error('fetch failed');
        const buffer = await res.arrayBuffer();
        if (aborted) return;
        const XLSX = await import('xlsx');
        const workbook = XLSX.read(buffer, { type: 'array', cellHTML: false, cellFormula: false });
        const firstSheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[firstSheetName];

        // Clip the sheet range before sheet_to_json so huge sheets don't expand.
        const original = XLSX.utils.decode_range(sheet['!ref'] ?? 'A1');
        // Compute unclipped totals BEFORE clipping so the banner reflects the real file size.
        const totalRows = Math.max(0, original.e.r - original.s.r); // exclude header row
        const totalCols = original.e.c - original.s.c + 1;
        const clipped = {
          s: original.s,
          e: {
            r: Math.min(original.e.r, original.s.r + MAX_ROWS - 1),
            c: Math.min(original.e.c, original.s.c + MAX_COLS - 1),
          },
        };
        const range = XLSX.utils.encode_range(clipped);
        const raw = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, range, defval: '' });
        if (aborted) return;
        const headers = (raw[0] ?? []).map(String);
        const dataRows = raw.slice(1);
        setState({
          status: 'ready',
          rows: dataRows.slice(0, PREVIEW_ROW_CAP),
          totalRows,
          totalCols,
          sheetCount: workbook.SheetNames.length,
          headers,
        });
      } catch {
        if (!aborted) setState({ status: 'parse-error' });
      }
    })();

    return () => {
      aborted = true;
    };
  }, [url, sizeBytes]);

  if (state.status === 'too-large') {
    const mb = (sizeBytes / (1024 * 1024)).toFixed(1);
    return (
      <div className="text-white/80 text-sm text-center">
        File too large to preview ({mb} MB) — download to open locally.
      </div>
    );
  }

  if (state.status === 'loading') {
    return <div className="text-white/60 text-sm">Parsing spreadsheet…</div>;
  }

  if (state.status === 'parse-error') {
    return (
      <div className="text-white/80 text-sm text-center">
        This file couldn&apos;t be parsed — download to open in Excel.
      </div>
    );
  }

  const { rows, totalRows, totalCols, sheetCount, headers } = state;
  const rowTruncated = totalRows > PREVIEW_ROW_CAP;
  const colTruncated = totalCols > headers.length;
  const truncated = rowTruncated || colTruncated;

  return (
    <div className="w-full h-full overflow-auto bg-white text-black rounded">
      {sheetCount > 1 && (
        <div className="px-3 py-2 bg-yellow-50 border-b border-yellow-200 text-xs text-yellow-900">
          This workbook has {sheetCount} sheets — only the first is shown.
        </div>
      )}
      {truncated && (
        <div className="px-3 py-2 bg-blue-50 border-b border-blue-200 text-xs text-blue-900">
          Showing first {Math.min(PREVIEW_ROW_CAP, totalRows).toLocaleString()} rows
          {colTruncated && ` × ${headers.length} columns`} of{' '}
          {totalRows.toLocaleString()} rows{colTruncated && ` × ${totalCols.toLocaleString()} columns`}
          {' '}— download for the full file.
        </div>
      )}
      <table className="text-xs w-full border-collapse">
        <thead className="bg-gray-50 sticky top-0">
          <tr>
            {headers.map((h) => (
              <th key={h} className="px-2 py-1 text-left border-b font-semibold">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className={i % 2 ? 'bg-gray-50' : ''}>
              {headers.map((h, colIndex) => (
                <td key={h} className="px-2 py-1 border-b align-top">{String(row[colIndex] ?? '')}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
