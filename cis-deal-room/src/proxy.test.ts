import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy } from './proxy';

function make(url: string, opts: { cookie?: string } = {}): NextRequest {
  const headers: HeadersInit = {};
  if (opts.cookie) headers.cookie = opts.cookie;
  return new NextRequest(new URL(url), { headers });
}

function isRedirect(res: Response): boolean {
  return res.headers.get('location') !== null;
}

describe('proxy', () => {
  it('passes through static asset requests without session (SVG)', () => {
    const res = proxy(make('https://dealroom.cispartners.co/cis-partners-logo.svg'));
    expect(isRedirect(res)).toBe(false);
  });

  it('passes through static asset requests without session (PNG)', () => {
    const res = proxy(make('https://dealroom.cispartners.co/cis-partners-logo.png'));
    expect(isRedirect(res)).toBe(false);
  });

  it('passes through .mjs asset (pdf.js worker)', () => {
    const res = proxy(make('https://dealroom.cispartners.co/pdf.worker.min.mjs'));
    expect(isRedirect(res)).toBe(false);
  });

  it('allows /login without session', () => {
    const res = proxy(make('https://dealroom.cispartners.co/login'));
    expect(isRedirect(res)).toBe(false);
  });

  it('allows /auth/verify without session', () => {
    const res = proxy(make('https://dealroom.cispartners.co/auth/verify'));
    expect(isRedirect(res)).toBe(false);
  });

  it('redirects protected app routes to /login when no session cookie', () => {
    const res = proxy(make('https://dealroom.cispartners.co/deals'));
    expect(isRedirect(res)).toBe(true);
    expect(res.headers.get('location')).toContain('/login');
  });

  it('lets protected app routes through when session cookie is present', () => {
    const res = proxy(make('https://dealroom.cispartners.co/deals', { cookie: 'cis_session=abc' }));
    expect(isRedirect(res)).toBe(false);
  });
});
