import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getAppUrl, getAllowedOrigins } from './app-url';

describe('getAppUrl', () => {
  const original = {
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    VERCEL_ENV: process.env.VERCEL_ENV,
    VERCEL_BRANCH_URL: process.env.VERCEL_BRANCH_URL,
    VERCEL_URL: process.env.VERCEL_URL,
  };

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.VERCEL_ENV;
    delete process.env.VERCEL_BRANCH_URL;
    delete process.env.VERCEL_URL;
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(original)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it('returns NEXT_PUBLIC_APP_URL in production', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://dealroom.cispartners.co';
    process.env.VERCEL_ENV = 'production';
    expect(getAppUrl()).toBe('https://dealroom.cispartners.co');
  });

  it('returns https://<VERCEL_BRANCH_URL> on a Vercel preview', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://dealroom.cispartners.co';
    process.env.VERCEL_ENV = 'preview';
    process.env.VERCEL_BRANCH_URL = 'dealroom-git-feat-x-example.vercel.app';
    expect(getAppUrl()).toBe('https://dealroom-git-feat-x-example.vercel.app');
  });

  it('falls back to NEXT_PUBLIC_APP_URL on preview when branch URL is missing', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://dealroom.cispartners.co';
    process.env.VERCEL_ENV = 'preview';
    expect(getAppUrl()).toBe('https://dealroom.cispartners.co');
  });

  it('falls back to localhost when nothing is set', () => {
    expect(getAppUrl()).toBe('http://localhost:3000');
  });
});

describe('getAllowedOrigins', () => {
  const original = {
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    VERCEL_BRANCH_URL: process.env.VERCEL_BRANCH_URL,
    VERCEL_URL: process.env.VERCEL_URL,
  };

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.VERCEL_BRANCH_URL;
    delete process.env.VERCEL_URL;
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(original)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it('includes NEXT_PUBLIC_APP_URL origin', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://dealroom.cispartners.co/path';
    expect(getAllowedOrigins()).toEqual(['https://dealroom.cispartners.co']);
  });

  it('includes both Vercel URLs alongside NEXT_PUBLIC_APP_URL', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://dealroom.cispartners.co';
    process.env.VERCEL_BRANCH_URL = 'dealroom-git-feat-x-example.vercel.app';
    process.env.VERCEL_URL = 'dealroom-abc123-example.vercel.app';
    expect(getAllowedOrigins().sort()).toEqual([
      'https://dealroom-abc123-example.vercel.app',
      'https://dealroom-git-feat-x-example.vercel.app',
      'https://dealroom.cispartners.co',
    ]);
  });

  it('returns an empty list when no origin env vars are set', () => {
    expect(getAllowedOrigins()).toEqual([]);
  });

  it('ignores malformed NEXT_PUBLIC_APP_URL and still includes Vercel URLs', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'not a url';
    process.env.VERCEL_BRANCH_URL = 'dealroom-git-feat-x-example.vercel.app';
    expect(getAllowedOrigins()).toEqual(['https://dealroom-git-feat-x-example.vercel.app']);
  });
});
