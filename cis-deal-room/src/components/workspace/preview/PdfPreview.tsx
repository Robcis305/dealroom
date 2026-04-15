export function PdfPreview({ url }: { url: string }) {
  return <iframe src={url} className="w-full h-full bg-white" title="PDF preview" />;
}
