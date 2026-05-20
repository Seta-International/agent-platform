import { Alert, AlertDescription, Button, cn, Input, Label, SetaLogo } from '@seta/shared-ui';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useState } from 'react';
import { signIn } from '@/lib/auth-client';
import { discoverProvider } from '../api/client.ts';

type Step = 'email' | 'password';

const ERROR_MESSAGES: Record<string, string> = {
  not_pre_provisioned: 'Your email is not registered. Ask your admin to invite you.',
  tid_mismatch:
    'Your Microsoft account is in a different organization than configured for this tenant.',
  oid_conflict:
    'This Seta account is already linked to a different Microsoft identity. Contact your admin.',
  user_deactivated: 'Your account has been deactivated. Contact your admin.',
  access_denied: 'Microsoft blocked the sign-in. Check with your IT team.',
  LOCAL_PASSWORD_DISABLED: 'This tenant requires Microsoft Entra sign-in. Use your work account.',
};

export function LoginCard() {
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as {
    redirect?: string;
    reason?: string;
    error?: string;
  };
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const initialError = search.error
    ? (ERROR_MESSAGES[search.error] ?? 'Sign-in failed. Try again or contact support.')
    : search.reason === 'idle'
      ? 'Your session expired. Please sign in again.'
      : null;

  const [error, setError] = useState<string | null>(initialError);
  const [rateLimited, setRateLimited] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function onContinue(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { provider_id, redirect_url } = await discoverProvider(email);
      if (provider_id === 'credential') {
        setStep('password');
        return;
      }
      if (redirect_url) {
        window.location.href = redirect_url;
        return;
      }
      setError('Authentication path not configured.');
    } catch {
      setError('Could not check sign-in method. Try again.');
    } finally {
      setSubmitting(false);
    }
  }

  async function onSignIn(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setRateLimited(false);
    setSubmitting(true);
    try {
      const res = await signIn.email({ email, password });
      if (res.error) {
        if (res.error.status === 429) {
          setRateLimited(true);
          setError('Too many attempts. Wait a moment and try again.');
        } else {
          setError(res.error.message || 'Invalid email or password.');
        }
        return;
      }
      void navigate({ to: (search.redirect ?? '/') as '/' });
    } finally {
      setSubmitting(false);
    }
  }

  function resetToEmail() {
    setStep('email');
    setPassword('');
    setError(null);
    setRateLimited(false);
  }

  return (
    <div className="theme-light flex min-h-screen flex-col bg-canvas text-ink">
      <header className="flex items-center justify-between px-lg py-lg sm:px-xl">
        <SetaLogo height={24} />
        <a
          href="mailto:support@seta-international.vn"
          className="text-caption text-ink-subtle transition-colors hover:text-ink"
        >
          Need help?
        </a>
      </header>

      <main className="flex flex-1 items-center justify-center px-lg pb-xl sm:px-xl">
        <div className="flex w-full max-w-sm flex-col gap-xl">
          <div className="flex flex-col gap-xs">
            <h1 className="text-headline text-ink">
              {step === 'email' ? 'Welcome back.' : 'Confirm it’s you.'}
            </h1>
            <p className="text-body-sm text-ink-subtle">
              {step === 'email'
                ? 'Sign in to your Seta workspace.'
                : 'Enter the password for this account.'}
            </p>
          </div>

          {step === 'email' ? (
            <form
              onSubmit={onContinue}
              className="flex flex-col gap-md duration-200 animate-in fade-in"
            >
              <Field id="email" label="Work email">
                <Input
                  id="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="you@company.com"
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  size="lg"
                  required
                />
              </Field>

              {error ? (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}

              <Button type="submit" size="lg" className="w-full" disabled={submitting || !email}>
                {submitting ? 'Checking…' : 'Continue'}
              </Button>

              <p className="text-caption text-ink-tertiary">
                Microsoft Entra accounts are redirected automatically.
              </p>
            </form>
          ) : (
            <form
              onSubmit={onSignIn}
              className="flex flex-col gap-md duration-200 animate-in fade-in"
            >
              <EmailChip email={email} onEdit={resetToEmail} />

              <Field
                id="password"
                label="Password"
                trailing={
                  <a
                    href="mailto:support@seta-international.vn?subject=Password%20reset"
                    className="text-caption text-ink-subtle transition-colors hover:text-ink"
                  >
                    Forgot password?
                  </a>
                }
              >
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  autoFocus
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  size="lg"
                  required
                />
              </Field>

              {error ? (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}

              <Button
                type="submit"
                size="lg"
                className="w-full"
                disabled={submitting || !password || rateLimited}
              >
                {submitting ? 'Signing in…' : 'Sign in'}
              </Button>
            </form>
          )}
        </div>
      </main>

      <footer className="flex items-center justify-between px-lg py-lg sm:px-xl">
        <PingDot label="All systems normal" />
        <span className="font-mono text-caption text-ink-tertiary">SETA · M2</span>
      </footer>
    </div>
  );
}

interface FieldProps {
  id: string;
  label: string;
  trailing?: React.ReactNode;
  children: React.ReactNode;
}

function Field({ id, label, trailing, children }: FieldProps) {
  return (
    <div className="flex flex-col gap-xs">
      <div className="flex items-center justify-between">
        <Label htmlFor={id} className="text-body-sm text-ink-muted">
          {label}
        </Label>
        {trailing}
      </div>
      {children}
    </div>
  );
}

function EmailChip({ email, onEdit }: { email: string; onEdit: () => void }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-hairline bg-surface-1 px-sm py-xs">
      <span className="truncate text-body-sm text-ink">{email}</span>
      <button
        type="button"
        onClick={onEdit}
        className="text-caption text-ink-subtle transition-colors hover:text-ink"
      >
        Change
      </button>
    </div>
  );
}

function PingDot({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-xs text-caption text-ink-tertiary">
      <span className="relative inline-flex size-1.5">
        <span
          className={cn(
            'absolute inset-0 animate-ping rounded-full bg-semantic-success opacity-60',
          )}
        />
        <span className="relative size-1.5 rounded-full bg-semantic-success" />
      </span>
      {label}
    </span>
  );
}
