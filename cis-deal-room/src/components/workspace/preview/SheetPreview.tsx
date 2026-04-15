'use client';

import { useEffect, useState } from 'react';
import { PREVIEW_ROW_CAP, PREVIEW_SIZE_CAP_BYTES } from '@/lib/preview';

type State =
  | { status: 'loading' }
  | { status: 'too-large' }
  | { status: 'parse-error' }
  | {
      status: 'ready';
      rows: Record<string, unknown>[];
      totalRows: number;
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
        const workbook = XLSX.read(buffer, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[firstSheetName];
        const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
        if (aborted) return;
        const headers = json.length > 0 ? Object.keys(json[0]) : [];
        setState({
          status: 'ready',
          rows: json.slice(0, PREVIEW_ROW_CAP),
          totalRows: json.length,
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

  const { rows, totalRows, sheetCount, headers } = state;
  const truncated = totalRows > PREVIEW_ROW_CAP;

  return (
    <div className="w-full h-full overflow-auto bg-white text-black rounded">
      {sheetCount > 1 && (
        <div className="px-3 py-2 bg-yellow-50 border-b border-yellow-200 text-xs text-yellow-900">
          This workbook has {sheetCount} sheets — only the first is shown.
        </div>
      )}
      {truncated && (
        <div className="px-3 py-2 bg-blue-50 border-b border-blue-200 text-xs text-blue-900">
          Showing first 1,000 of {totalRows.toLocaleString()} rows — download for the full file.
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
              {headers.map((h) => (
                <td key={h} className="px-2 py-1 border-b align-top">{String(row[h] ?? '')}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
