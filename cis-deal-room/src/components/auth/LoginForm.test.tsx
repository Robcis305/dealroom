import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LoginForm } from './LoginForm';

// Mock fetch globally
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

describe('LoginForm', () => {
  it('renders an email input and submit button', () => {
    render(<LoginForm />);
    expect(screen.getByRole('textbox', { name: /email/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send.*link|continue|sign in/i })).toBeInTheDocument();
  });

  it('transitions to confirmation state after form submission', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 200 }));
    render(<LoginForm />);

    const input = screen.getByRole('textbox', { name: /email/i });
    fireEvent.change(input, { target: { value: 'test@example.com' } });
    fireEvent.submit(input.closest('form')!);

    await waitFor(() => {
      expect(screen.getByText(/check your email/i)).toBeInTheDocument();
    });
    // Input state should be gone
    expect(screen.queryByRole('textbox', { name: /email/i })).not.toBeInTheDocument();
  });

  it('shows the submitted email in the confirmation message', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 200 }));
    render(<LoginForm />);

    const input = screen.getByRole('textbox', { name: /email/i });
    fireEvent.change(input, { target: { value: 'hello@cispartners.co' } });
    fireEvent.submit(input.closest('form')!);

    await waitFor(() => {
      expect(screen.getByText(/hello@cispartners\.co/)).toBeInTheDocument();
    });
  });
});
