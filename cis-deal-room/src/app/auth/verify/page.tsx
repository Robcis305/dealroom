import Link from 'next/link';

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
    <main className="min-h-screen bg-black flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo placeholder — real CIS Partners logo to be provided */}
        <div className="flex justify-center mb-8">
          <div className="flex items-center gap-2">
            <div
              className="w-8 h-8 bg-[#E10600] rounded"
              aria-label="CIS Partners logo placeholder"
            />
            <span className="text-white font-semibold text-lg tracking-tight">
              CIS Partners
            </span>
          </div>
        </div>

        <div className="bg-[#141414] border border-[#2A2A2A] rounded-xl p-6 shadow-2xl text-center">
          <div className="flex flex-col items-center gap-4">
            <div className="flex flex-col gap-1">
              <h1 className="text-lg font-semibold text-white">{heading}</h1>
              <p className="text-sm text-neutral-400">{description}</p>
            </div>

            <Link
              href="/login"
              className="inline-flex items-center justify-center px-4 py-2 rounded-lg
                bg-[#E10600] hover:bg-[#C40500] text-white text-sm font-medium
                transition-colors duration-150 cursor-pointer
                focus:outline-none focus:ring-2 focus:ring-[#E10600] focus:ring-offset-2 focus:ring-offset-[#141414]"
            >
              Request new link
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
