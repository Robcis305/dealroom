/**
 * RFC 6266 + RFC 5987 Content-Disposition builder.
 * - Strips CR/LF to prevent header injection.
 * - Provides a quoted ASCII fallback (quote-stripped + backslash-escaped).
 * - Always emits filename* for full UTF-8 support.
 */
export function buildContentDisposition(
  kind: 'inline' | 'attachment',
  filename: string
): string {
  const stripped = filename.replace(/[\r\n]/g, '');
  const ascii = stripped.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
  const encoded = encodeURIComponent(stripped).replace(/['()]/g, escape);
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
