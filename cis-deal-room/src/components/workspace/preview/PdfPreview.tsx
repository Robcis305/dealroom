'use client';

import { useEffect, useState, useRef } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';

export function PdfPreview({ url }: { url: string }) {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [Components, setComponents] = useState<{
    Document: typeof import('react-pdf').Document;
    Page: typeof import('react-pdf').Page;
  } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number>(0);

  // Dynamic import of react-pdf (code-split)
  useEffect(() => {
    let aborted = false;
    (async () => {
      const reactPdf = await import('react-pdf');
      await import('react-pdf/dist/Page/TextLayer.css');
      await import('react-pdf/dist/Page/AnnotationLayer.css');
      const pdfjs = await import('pdfjs-dist');
      pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
      if (!aborted) {
        setComponents({ Document: reactPdf.Document, Page: reactPdf.Page });
      }
    })().catch((e) => {
      if (!aborted) setError(e instanceof Error ? e.message : 'Failed to load PDF renderer');
    });
    return () => {
      aborted = true;
    };
  }, []);

  // Observe container width so pages fit the available space
  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const observer = new ResizeObserver(() => setWidth(el.clientWidth));
    observer.observe(el);
    setWidth(el.clientWidth);
    return () => observer.disconnect();
  }, [Components]);

  function onLoadSuccess(pdf: PDFDocumentProxy) {
    setNumPages(pdf.numPages);
  }

  function onLoadError() {
    setError('Failed to load PDF.');
  }

  if (error) {
    return (
      <div className="text-white/80 text-sm text-center p-4">
        {error} — use the Download button above.
      </div>
    );
  }

  if (!Components) {
    return <div className="text-white/60 text-sm">Loading PDF renderer…</div>;
  }

  const { Document, Page } = Components;

  return (
    <div ref={containerRef} className="w-full h-full overflow-auto bg-neutral-900">
      <div className="flex flex-col items-center gap-2 py-4">
        <Document
          file={url}
          onLoadSuccess={onLoadSuccess}
          onLoadError={onLoadError}
          loading={<div className="text-white/60 text-sm">Fetching PDF…</div>}
          error={<div className="text-white/80 text-sm">Couldn&apos;t load PDF.</div>}
        >
          {numPages &&
            Array.from({ length: numPages }, (_, i) => (
              <Page
                key={i + 1}
                pageNumber={i + 1}
                width={width > 32 ? width - 32 : 800}
                renderTextLayer={false}
                renderAnnotationLayer={false}
                className="shadow-lg"
              />
            ))}
        </Document>
      </div>
    </div>
  );
}
