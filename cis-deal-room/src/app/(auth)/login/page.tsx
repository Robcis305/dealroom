import { LoginForm } from '@/components/auth/LoginForm';

export const metadata = {
  title: 'Sign In — CIS Deal Room',
};

export default function LoginPage() {
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

        <div className="bg-[#141414] border border-[#2A2A2A] rounded-xl p-6 shadow-2xl">
          <div className="mb-6">
            <h1 className="text-xl font-semibold text-white mb-1">
              Sign in to Deal Room
            </h1>
            <p className="text-sm text-neutral-400">
              Enter your email to receive a sign-in link.
            </p>
          </div>

          <LoginForm />
        </div>
      </div>
    </main>
  );
}
