export function VideoPreview({ url }: { url: string }) {
  return <video controls src={url} className="max-w-full max-h-full" />;
}
