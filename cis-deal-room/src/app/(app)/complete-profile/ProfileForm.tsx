'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { fetchWithAuth } from '@/lib/fetch-with-auth';

export function ProfileForm() {
  const router = useRouter();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetchWithAuth('/api/user/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firstName, lastName }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(typeof body.error === 'string' ? body.error : 'Failed to save profile');
        setSubmitting(false);
        return;
      }
      const returnTo = typeof window !== 'undefined' ? sessionStorage.getItem('loginReturnTo') : null;
      if (returnTo) sessionStorage.removeItem('loginReturnTo');
      router.push(returnTo ?? '/deals');
      router.refresh();
    } catch {
      toast.error('Network error');
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="first-name" className="block text-sm font-medium text-text-secondary mb-1.5">
          First name
        </label>
        <input
          id="first-name"
          type="text"
          required
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          disabled={submitting}
          className="w-full bg-surface-sunken border border-border rounded-lg px-3 py-2 text-sm
            text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
        />
      </div>
      <div>
        <label htmlFor="last-name" className="block text-sm font-medium text-text-secondary mb-1.5">
          Last name
        </label>
        <input
          id="last-name"
          type="text"
          required
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          disabled={submitting}
          className="w-full bg-surface-sunken border border-border rounded-lg px-3 py-2 text-sm
            text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
        />
      </div>
      <button
        type="submit"
        disabled={submitting || !firstName.trim() || !lastName.trim()}
        className="w-full py-2 rounded-lg text-sm font-medium bg-accent text-text-inverse
          hover:bg-accent-hover transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {submitting && <Loader2 size={14} className="animate-spin" />}
        Continue
      </button>
    </form>
  );
}
