/**
 * Size and row caps for sheet previews (CSV / XLSX).
 * Larger files / longer sheets fall back to "download to view" UX.
 */
export const PREVIEW_SIZE_CAP_BYTES = 10 * 1024 * 1024;
export const PREVIEW_ROW_CAP = 1000;

export type PreviewKind = 'pdf' | 'image' | 'video' | 'sheet';

const PDF_MIMES = new Set(['application/pdf']);
const IMAGE_MIMES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
const VIDEO_MIMES = new Set(['video/mp4', 'video/webm']);
const SHEET_MIMES = new Set([
  'text/csv',
  'application/csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

export function getPreviewKind(mimeType: string | null | undefined): PreviewKind | null {
  if (!mimeType) return null;
  if (PDF_MIMES.has(mimeType)) return 'pdf';
  if (IMAGE_MIMES.has(mimeType)) return 'image';
  if (VIDEO_MIMES.has(mimeType)) return 'video';
  if (SHEET_MIMES.has(mimeType)) return 'sheet';
  return null;
}

export function isPreviewable(mimeType: string | null | undefined): boolean {
  return getPreviewKind(mimeType) !== null;
}
