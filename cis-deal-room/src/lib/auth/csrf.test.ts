import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { isSameOriginRequest } from './csrf';

describe('isSameOriginRequest', () => {
  const originalBranchUrl = process.env.VERCEL_BRANCH_URL;
  const originalVercelUrl = process.env.VERCEL_URL;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://dealroom.cispartners.co';
    delete process.env.VERCEL_BRANCH_URL;
    delete process.env.VERCEL_URL;
  });

  afterEach(() => {
    if (originalBranchUrl === undefined) delete process.env.VERCEL_BRANCH_URL;
    else process.env.VERCEL_BRANCH_URL = originalBranchUrl;
    if (originalVercelUrl === undefined) delete process.env.VERCEL_URL;
    else process.env.VERCEL_URL = originalVercelUrl;
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

  it('accepts the Vercel branch URL as an additional allowed origin', () => {
    process.env.VERCEL_BRANCH_URL = 'dealroom-git-feat-x-example.vercel.app';
    const req = new Request('https://dealroom-git-feat-x-example.vercel.app/api/x', {
      headers: { origin: 'https://dealroom-git-feat-x-example.vercel.app' },
    });
    expect(isSameOriginRequest(req)).toBe(true);
  });
});
