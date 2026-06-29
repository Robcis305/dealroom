import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import VerifyPage from './page';

// VerifyPage is an async Server Component. Invoke it as a function, await the
// Promise<ReactElement>, then render the resolved element.
async function renderPage(params: { error?: string; token?: string; email?: string }) {
  const element = await VerifyPage({ searchParams: Promise.resolve(params) });
  return render(element);
}

describe('VerifyPage /auth/verify', () => {
  it('renders a Confirm sign-in button when token+email present and no error', async () => {
    await renderPage({ token: 'raw-token', email: 'user@example.com' });
    expect(screen.getByRole('button', { name: /confirm sign-in/i })).toBeInTheDocument();
  });

  it('posts token+email to /api/auth/verify via a form', async () => {
    const { container } = await renderPage({ token: 'raw-token', email: 'user@example.com' });
    const form = container.querySelector('form');
    expect(form).not.toBeNull();
    expect(form?.getAttribute('method')?.toUpperCase()).toBe('POST');
    expect(form?.getAttribute('action')).toBe('/api/auth/verify');
    expect(container.querySelector('input[name="token"]')?.getAttribute('value')).toBe('raw-token');
    expect(container.querySelector('input[name="email"]')?.getAttribute('value')).toBe('user@example.com');
  });

  it('shows "This link has expired" when error=expired', async () => {
    await renderPage({ error: 'expired' });
    expect(screen.getByText(/this link has expired/i)).toBeInTheDocument();
  });

  it('shows "This link has already been used" when error=used', async () => {
    await renderPage({ error: 'used' });
    expect(screen.getByText(/this link has already been used/i)).toBeInTheDocument();
  });

  it('shows a too-many-attempts message when error=rate_limited', async () => {
    await renderPage({ error: 'rate_limited' });
    expect(screen.getByText(/too many attempts/i)).toBeInTheDocument();
  });

  it('shows a Request new link button on error states', async () => {
    await renderPage({ error: 'expired' });
    expect(screen.getByRole('link', { name: /request new link/i })).toBeInTheDocument();
  });

  it('prefers the error view when both error and token are present', async () => {
    await renderPage({ error: 'used', token: 'raw-token', email: 'user@example.com' });
    expect(screen.getByText(/this link has already been used/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /confirm sign-in/i })).not.toBeInTheDocument();
  });
});
