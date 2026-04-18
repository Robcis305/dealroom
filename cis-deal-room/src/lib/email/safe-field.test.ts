import { describe, it, expect } from 'vitest';
import { safeHeader, safeEmailAddress } from './safe-field';

describe('safeHeader', () => {
  it('strips CR and LF', () => {
    expect(safeHeader('hello\r\nBcc: a@b.com')).toBe('helloBcc: a@b.com');
    expect(safeHeader('one\ntwo\rthree')).toBe('onetwothree');
  });

  it('caps extreme length to 300 chars', () => {
    const long = 'x'.repeat(1000);
    expect(safeHeader(long).length).toBe(300);
  });

  it('returns empty string for non-string input', () => {
    expect(safeHeader(undefined as any)).toBe('');
    expect(safeHeader(null as any)).toBe('');
  });
});

describe('safeEmailAddress', () => {
  it('rejects CRLF and returns null', () => {
    expect(safeEmailAddress('u@x.com\r\nBcc: y@z.com')).toBeNull();
  });

  it('rejects obvious malformed addresses', () => {
    expect(safeEmailAddress('not-an-email')).toBeNull();
    expect(safeEmailAddress('a@')).toBeNull();
  });

  it('accepts a normal email', () => {
    expect(safeEmailAddress('user@example.com')).toBe('user@example.com');
  });
});
