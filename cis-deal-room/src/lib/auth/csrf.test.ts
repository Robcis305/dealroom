import { describe, it, expect, beforeEach } from 'vitest';
import { isSameOriginRequest } from './csrf';

describe('isSameOriginRequest', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://dealroom.cispartners.co';
  });

  it('accepts matching Origin', () => {
    const req = new Request('https://dealroom.cispartners.co/api/x', {
      headers: { origin: 'https://dealroom.cispartners.co' },
    });
    expect(isSameOriginRequest(req)).toBe(true);
  });

  it('accepts matching Referer when Origin is absent', () => {
    const req = new Request('https://dealroom.cispartners.co/api/x', {
      headers: { referer: 'https://dealroom.cispartners.co/deals' },
    });
    expect(isSameOriginRequest(req)).toBe(true);
  });

  it('rejects cross-origin Origin', () => {
    const req = new Request('https://dealroom.cispartners.co/api/x', {
      headers: { origin: 'https://evil.example' },
    });
    expect(isSameOriginRequest(req)).toBe(false);
  });

  it('rejects when both Origin and Referer are missing', () => {
    const req = new Request('https://dealroom.cispartners.co/api/x');
    expect(isSameOriginRequest(req)).toBe(false);
  });

  it('rejects protocol-relative spoof', () => {
    const req = new Request('https://dealroom.cispartners.co/api/x', {
      headers: { origin: '//evil.example' },
    });
    expect(isSameOriginRequest(req)).toBe(false);
  });
});
