import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import VerifyPage from './page';

describe('VerifyPage /auth/verify', () => {
  it('shows "This link has expired" message when error=expired in query params', () => {
    render(<VerifyPage searchParams={{ error: 'expired' }} />);
    expect(screen.getByText(/this link has expired/i)).toBeInTheDocument();
  });

  it('shows "This link has already been used" message when error=used in query params', () => {
    render(<VerifyPage searchParams={{ error: 'used' }} />);
    expect(screen.getByText(/this link has already been used/i)).toBeInTheDocument();
  });

  it('shows a button to request a new link on error states', () => {
    render(<VerifyPage searchParams={{ error: 'expired' }} />);
    expect(screen.getByRole('link', { name: /request new link/i })).toBeInTheDocument();
  });
});
