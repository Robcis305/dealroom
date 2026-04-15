/* eslint-disable @next/next/no-img-element */
export function ImagePreview({ url, alt }: { url: string; alt: string }) {
  return <img src={url} alt={alt} className="max-w-full max-h-full object-contain" />;
}
