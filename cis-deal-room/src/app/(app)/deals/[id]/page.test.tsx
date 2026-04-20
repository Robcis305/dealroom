import { describe, it, expect, vi, beforeEach } from 'vitest';

const redirectCalls: string[] = [];
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    redirectCalls.push(url);
    throw new Error('NEXT_REDIRECT');
  },
}));

import LegacyDealRedirect from './page';

beforeEach(() => {
  redirectCalls.length = 0;
});

describe('LegacyDealRedirect', () => {
  it('redirects /deals/<id> to /workspace/<id>', async () => {
    await expect(
      LegacyDealRedirect({
        params: Promise.resolve({ id: 'a71be708-9e08-4c50-b17b-de7503b50d17' }),
      })
    ).rejects.toThrow('NEXT_REDIRECT');
    expect(redirectCalls).toEqual(['/workspace/a71be708-9e08-4c50-b17b-de7503b50d17']);
  });
});
