import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@/lib/fetch-with-auth', () => ({
  fetchWithAuth: vi.fn().mockResolvedValue({ ok: true }),
}));
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { UserMenu } from './UserMenu';

describe('UserMenu', () => {
  it('shows a Settings link pointing at /settings when opened', () => {
    render(<UserMenu userEmail="a@b.com" />);
    fireEvent.click(screen.getByLabelText(/user menu/i));
    const link = screen.getByRole('link', { name: /settings/i });
    expect(link.getAttribute('href')).toBe('/settings');
  });

  it('does not render any daily-digest checkbox', () => {
    render(<UserMenu userEmail="a@b.com" />);
    fireEvent.click(screen.getByLabelText(/user menu/i));
    expect(screen.queryByLabelText(/daily digest/i)).toBeNull();
  });

  it('still renders the sign-out button', () => {
    render(<UserMenu userEmail="a@b.com" />);
    fireEvent.click(screen.getByLabelText(/user menu/i));
    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument();
  });
});
