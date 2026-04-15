export function PdfPreview({ url }: { url: string }) {
  return (
    <object
      data={url}
      type="application/pdf"
      className="w-full h-full bg-white"
      aria-label="PDF preview"
    >
      <p className="text-white/80 text-sm p-4">
        Your browser can&apos;t render this PDF inline. Use the Download button above to open it.
      </p>
    </object>
  );
}
