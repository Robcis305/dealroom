import { describe, it, expect } from 'vitest';
import { buildContentDisposition } from './content-disposition';

describe('buildContentDisposition', () => {
  it('encodes ASCII filenames directly', () => {
    const out = buildContentDisposition('attachment', 'report.pdf');
    expect(out).toBe(`attachment; filename="report.pdf"; filename*=UTF-8''report.pdf`);
  });

  it('strips CR/LF (header injection attempts)', () => {
    const out = buildContentDisposition('attachment', 'evil\r\nX-Hdr: 1.pdf');
    expect(out).not.toContain('\r');
    expect(out).not.toContain('\n');
    // The CRLF that would break out of the header is gone — the attacker-chosen
    // header name `X-Hdr` can no longer start a new header line.
    expect(out).not.toMatch(/\r\n\s*X-Hdr/);
  });

  it('escapes quote characters in the quoted form', () => {
    const out = buildContentDisposition('attachment', 'a"b.pdf');
    expect(out).not.toMatch(/"a"b\.pdf"/);
    expect(out).toContain(`filename*=UTF-8''`);
  });

  it('percent-encodes unicode for the extended form', () => {
    const out = buildContentDisposition('inline', 'résumé.pdf');
    expect(out).toContain(`filename*=UTF-8''r%C3%A9sum%C3%A9.pdf`);
  });
});
