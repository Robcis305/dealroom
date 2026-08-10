import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import VerifyPage from './page';

// VerifyPage is an async Server Component. React Testing Library can't render
// async components directly in jsdom — invoke it as a function, await the
// Promise<ReactElement>, then render the resolved element.
async function renderPage(error?: string) {
  const element = await VerifyPage({ searchParams: Promise.resolve({ error }) });
  return render(element);
}

describe('VerifyPage /auth/verify', () => {
  it('shows "This link has expired" message when error=expired in query params', async () => {
    await renderPage('expired');
    expect(screen.getByText(/this link has expired/i)).toBeInTheDocument();
  });

  it('shows "This link has already been used" message when error=used in query params', async () => {
    await renderPage('used');
    expect(screen.getByText(/this link has already been used/i)).toBeInTheDocument();
  });

  it('shows a button to request a new link on error states', async () => {
    await renderPage('expired');
    expect(screen.getByRole('link', { name: /request new link/i })).toBeInTheDocument();
  });
});
