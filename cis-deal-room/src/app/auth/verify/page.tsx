import Link from 'next/link';
import { Logo } from '@/components/ui/Logo';

interface VerifyPageProps {
  searchParams: Promise<{ error?: string }>;
}

function getErrorContent(error: string | undefined): {
  heading: string;
  description: string;
} {
  switch (error) {
    case 'expired':
      return {
        heading: 'This link has expired',
        description:
          'Magic links expire after 24 hours. Request a new one to sign in.',
      };
    case 'used':
      return {
        heading: 'This link has already been used',
        description:
          'Each magic link can only be used once. Request a new one to sign in.',
      };
    default:
      return {
        heading: 'Invalid link',
        description:
          'This link is not valid. Request a new one to sign in.',
      };
  }
}

export default async function VerifyPage({ searchParams }: VerifyPageProps) {
  const { error } = await searchParams;
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
