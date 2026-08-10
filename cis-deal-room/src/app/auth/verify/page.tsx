import Link from 'next/link';
import { Logo } from '@/components/ui/Logo';

interface VerifyPageProps {
  searchParams: Promise<{ error?: string; token?: string; email?: string }>;
}

function getErrorContent(error: string | undefined): {
  heading: string;
  description: string;
} {
  switch (error) {
    case 'expired':
      return {
        heading: 'This link has expired',
        description: 'Magic links expire after a short time. Request a new one to sign in.',
      };
    case 'used':
      return {
        heading: 'This link has already been used',
        description: 'Each magic link can only be used once. Request a new one to sign in.',
      };
    case 'rate_limited':
      return {
        heading: 'Too many attempts',
        description: 'Please wait a few minutes, then request a new link to sign in.',
      };
    default:
      return {
        heading: 'Invalid link',
        description: 'This link is not valid. Request a new one to sign in.',
      };
  }
}

export default async function VerifyPage({ searchParams }: VerifyPageProps) {
  const { error, token, email } = await searchParams;

  // Confirmation interstitial: a valid, not-yet-consumed link lands here with
  // token+email and no error. Render an explicit "Confirm sign-in" button that
  // POSTs to /api/auth/verify to consume the token. Email security scanners
  // pre-fetch the link with GET and do not submit this form, so the single-use
  // token survives until the human clicks.
  if (!error && token && email) {
    return (
      <main className="min-h-screen bg-bg flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <Logo size="md" className="mx-auto mb-8" inverse />

          <div className="bg-surface border border-border rounded-xl p-6 shadow-sm text-center">
            <div className="flex flex-col items-center gap-4">
              <div className="flex flex-col gap-1">
                <h1 className="text-lg font-semibold text-text-primary">Confirm sign-in</h1>
                <p className="text-sm text-text-muted">
                  Click below to finish signing in to your deal room.
                </p>
              </div>

              <form method="POST" action="/api/auth/verify" className="w-full">
                <input type="hidden" name="token" value={token} />
                <input type="hidden" name="email" value={email} />
                <button
                  type="submit"
                  className="inline-flex w-full items-center justify-center px-4 py-2 rounded-lg
                    bg-accent hover:bg-accent-hover text-text-inverse text-sm font-medium
                    transition-colors duration-150 cursor-pointer
                    focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface"
                >
                  Confirm sign-in
                </button>
              </form>
            </div>
          </div>
        </div>
      </main>
    );
  }

  const { heading, description } = getErrorContent(error);

  return (
    <main className="min-h-screen bg-bg flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <Logo size="md" className="mx-auto mb-8" inverse />

        <div className="bg-surface border border-border rounded-xl p-6 shadow-sm text-center">
          <div className="flex flex-col items-center gap-4">
            <div className="flex flex-col gap-1">
              <h1 className="text-lg font-semibold text-text-primary">{heading}</h1>
              <p className="text-sm text-text-muted">{description}</p>
            </div>

            <Link
              href="/login"
              className="inline-flex items-center justify-center px-4 py-2 rounded-lg
                bg-accent hover:bg-accent-hover text-text-inverse text-sm font-medium
                transition-colors duration-150 cursor-pointer
                focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface"
            >
              Request new link
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
