import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/lib/dal/index', () => ({ verifySession: vi.fn() }));

const mockDbResult = vi.fn();
vi.mock('@/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => mockDbResult(),
        }),
      }),
    }),
  },
}));

const redirectCalls: string[] = [];
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    redirectCalls.push(url);
    throw new Error('NEXT_REDIRECT');
  },
}));

import { verifySession } from '@/lib/dal/index';
import SettingsPage from './page';

beforeEach(() => {
  vi.clearAllMocks();
  redirectCalls.length = 0;
});

describe('SettingsPage (Server Component)', () => {
  it('redirects to /login when no session', async () => {
    vi.mocked(verifySession).mockResolvedValue(null);
    await expect(SettingsPage()).rejects.toThrow('NEXT_REDIRECT');
    expect(redirectCalls).toEqual(['/login']);
  });

  it('renders the form with the user\u2019s current preferences', async () => {
    vi.mocked(verifySession).mockResolvedValue({
      sessionId: 's1',
      userId: 'u1',
      userEmail: 'a@b.com',
      isAdmin: false,
    });
    mockDbResult.mockResolvedValue([{ notifyUploads: false, notifyDigest: true }]);

    const tree = await SettingsPage();
    const { container } = render(tree);
    expect(container.textContent).toContain('Notification preferences');
  });
});
