'use client';

import { useState, FormEvent, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Mail } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

type LoginState = 'input' | 'sent';

export function LoginForm() {
  const [state, setState] = useState<LoginState>('input');
  const searchParams = useSearchParams();
  useEffect(() => {
    const returnTo = searchParams.get('returnTo');
    if (returnTo && returnTo.startsWith('/')) {
      sessionStorage.setItem('loginReturnTo', returnTo);
    }
  }, [searchParams]);
  const [email, setEmail] = useState('');
  const [submittedEmail, setSubmittedEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      if (res.ok) {
        setSubmittedEmail(email);
        setState('sent');
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data?.error ?? 'Something went wrong. Please try again.');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    setLoading(true);
    setError('');

    try {
      await fetch('/api/auth/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: submittedEmail }),
      });
    } catch {
      // Silently ignore resend errors — user can try again
    } finally {
      setLoading(false);
    }
  }

  if (state === 'sent') {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-accent-subtle text-accent">
          <Mail size={24} />
        </div>
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold text-text-primary">Check your email</h2>
          <p className="text-sm text-text-muted">
            We sent a link to{' '}
            <span className="text-text-primary font-medium">{submittedEmail}</span>
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleResend}
          disabled={loading}
          className="mt-2"
        >
          Resend email
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Input
        label="Email"
        type="email"
        name="email"
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        autoFocus
        error={error || undefined}
      />
      <Button type="submit" disabled={loading || !email} className="w-full">
        {loading ? 'Sending...' : 'Send magic link'}
      </Button>
    </form>
  );
}
