import { LoginForm } from '@/components/auth/LoginForm';
import { Logo } from '@/components/ui/Logo';

export const metadata = {
  title: 'Sign In — CIS Deal Room',
};

export default function LoginPage() {
  return (
    <main className="min-h-screen bg-bg flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <Logo size="md" className="mx-auto mb-8" />

        <div className="bg-surface border border-border rounded-xl p-6 shadow-sm">
          <div className="mb-6">
            <h1 className="text-xl font-semibold text-text-primary mb-1">
              Sign in to Deal Room
            </h1>
            <p className="text-sm text-text-muted">
              Enter your email to receive a sign-in link.
            </p>
          </div>

          <LoginForm />
        </div>
      </div>
    </main>
  );
}
