/**
 * Strip CR/LF and cap length for anything that becomes an email header.
 * Prevents header-injection (Bcc smuggling, multi-send exploits) if a
 * user-supplied value ever reaches subject/to/from.
 */
export function safeHeader(input: string | null | undefined, maxLen = 300): string {
  if (typeof input !== 'string') return '';
  return input.replace(/[\r\n]/g, '').slice(0, maxLen);
}

const RFC_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Returns the input when it parses as a simple email with no CRLF,
 * otherwise null. Deliberately strict — our addresses are either user
 * rows (already validated) or config strings.
 */
export function safeEmailAddress(input: string | null | undefined): string | null {
  if (typeof input !== 'string') return null;
  if (/[\r\n]/.test(input)) return null;
  if (!RFC_EMAIL.test(input)) return null;
  return input;
}
