import { Alert, AlertDescription, Button, cn, Input, Label, SetaMark } from '@seta/shared-ui';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useState } from 'react';
import { signIn } from '@/lib/auth-client';
import { discoverProvider } from '../api/client.ts';

type Step =
  | { kind: 'email' }
  | { kind: 'password'; email: string }
  | { kind: 'sso'; email: string; callbackUrl: string; providerId: string };

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

  const [step, setStep] = useState<Step>({ kind: 'email' });
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
      const { provider_id } = await discoverProvider(email);
      if (provider_id === 'credential') {
        setStep({ kind: 'password', email });
        return;
      }
      setStep({ kind: 'sso', email, callbackUrl: search.redirect ?? '/', providerId: provider_id });
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
    setStep({ kind: 'email' });
    setPassword('');
    setError(null);
    setRateLimited(false);
  }

  return (
    <LoginShell>
      <Stepper step={step.kind === 'email' ? 1 : 2} />

      {step.kind === 'email' && (
        <EmailStep
          email={email}
          onEmailChange={setEmail}
          onSubmit={onContinue}
          submitting={submitting}
          error={error}
        />
      )}

      {step.kind === 'password' && (
        <PasswordStep
          email={step.email}
          password={password}
          onPasswordChange={setPassword}
          onSubmit={onSignIn}
          onEdit={resetToEmail}
          submitting={submitting}
          rateLimited={rateLimited}
          error={error}
        />
      )}

      {step.kind === 'sso' && (
        <SsoStep email={step.email} callbackUrl={step.callbackUrl} onEdit={resetToEmail} />
      )}
    </LoginShell>
  );
}

function LoginShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="theme-light relative flex min-h-screen flex-col bg-surface-1 text-ink">
      <header className="flex items-center gap-xs px-lg pt-lg sm:px-xl">
        <SetaMark size={22} />
        <span className="text-body-sm font-semibold text-ink">Seta</span>
      </header>

      <main className="flex flex-1 items-center justify-center px-lg py-xl sm:px-xl">
        <div className="flex w-full max-w-[400px] flex-col">
          <div className="mb-md flex justify-center">
            <SetaMark size={36} />
          </div>
          {children}
        </div>
      </main>

      <footer className="flex items-center justify-between px-lg py-md text-caption text-ink-subtle sm:px-xl">
        <span>© {new Date().getFullYear()} Seta International</span>
        <div className="flex items-center gap-md">
          <a
            href="https://seta-international.vn/privacy"
            className="transition-colors hover:text-ink"
          >
            Privacy
          </a>
          <a
            href="https://seta-international.vn/terms"
            className="transition-colors hover:text-ink"
          >
            Terms
          </a>
          <SystemStatus />
        </div>
      </footer>
    </div>
  );
}

function Stepper({ step }: { step: 1 | 2 }) {
  return (
    <div className="mb-md flex items-center justify-center gap-xs">
      <StepBadge n={1} label="Email" active={step === 1} done={step > 1} />
      <span className="block h-px w-6 bg-hairline-strong" aria-hidden="true" />
      <StepBadge n={2} label="Sign in" active={step === 2} done={false} />
    </div>
  );
}

function StepBadge({
  n,
  label,
  active,
  done,
}: {
  n: number;
  label: string;
  active: boolean;
  done: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className={cn(
          'inline-flex size-[18px] items-center justify-center rounded-full text-[10.5px] font-semibold leading-none transition-colors',
          done && 'bg-primary text-on-primary',
          active && !done && 'border border-primary-border bg-primary-tint text-primary',
          !active && !done && 'bg-surface-2 text-ink-subtle',
        )}
      >
        {done ? <CheckIcon /> : n}
      </span>
      <span className={cn('text-caption', active ? 'font-medium text-ink' : 'text-ink-subtle')}>
        {label}
      </span>
    </div>
  );
}

function EmailStep({
  email,
  onEmailChange,
  onSubmit,
  submitting,
  error,
}: {
  email: string;
  onEmailChange: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  submitting: boolean;
  error: string | null;
}) {
  return (
    <>
      <h1 className="text-center text-card-title font-semibold text-ink">Sign in to Seta</h1>
      <p className="mt-1 mb-md text-center text-body-sm text-ink-muted">
        We&apos;ll route you to the right sign-in method for your tenant.
      </p>

      <form
        onSubmit={onSubmit}
        className="flex flex-col gap-sm rounded-lg border border-hairline bg-canvas p-lg duration-200 animate-in fade-in"
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
            onChange={(e) => onEmailChange(e.target.value)}
            size="lg"
            required
          />
        </Field>
        <p className="text-caption text-ink-subtle">
          Use the email your tenant admin invited you with.
        </p>

        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <Button type="submit" size="lg" className="w-full" disabled={submitting || !email}>
          {submitting ? 'Checking…' : 'Continue'}
          {!submitting ? <ArrowRightIcon /> : null}
        </Button>
      </form>

      <p className="mt-md text-center text-caption text-ink-subtle">
        Need an account? Ask your tenant admin.
      </p>
    </>
  );
}

function PasswordStep({
  email,
  password,
  onPasswordChange,
  onSubmit,
  onEdit,
  submitting,
  rateLimited,
  error,
}: {
  email: string;
  password: string;
  onPasswordChange: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onEdit: () => void;
  submitting: boolean;
  rateLimited: boolean;
  error: string | null;
}) {
  return (
    <>
      <h1 className="text-center text-card-title font-semibold text-ink">Enter your password</h1>
      <p className="mt-1 mb-md text-center text-body-sm text-ink-muted">
        Use the password you set up for your Seta account.
      </p>

      <form
        onSubmit={onSubmit}
        className="flex flex-col gap-sm rounded-lg border border-hairline bg-canvas p-lg duration-200 animate-in fade-in"
      >
        <EmailChip email={email} onEdit={onEdit} />

        <Field
          id="password"
          label="Password"
          trailing={
            <a
              href="mailto:support@seta-international.vn?subject=Password%20reset"
              className="text-caption font-medium text-primary hover:underline"
            >
              Forgot?
            </a>
          }
        >
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            autoFocus
            value={password}
            onChange={(e) => onPasswordChange(e.target.value)}
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

      <p className="mt-md text-center text-caption text-ink-subtle">
        Different account?{' '}
        <button type="button" onClick={onEdit} className="font-medium text-primary hover:underline">
          Use another email
        </button>
      </p>
    </>
  );
}

function SsoStep({
  email,
  callbackUrl,
  onEdit,
}: {
  email: string;
  callbackUrl: string;
  onEdit: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignIn() {
    setError(null);
    setSubmitting(true);
    try {
      const res = await signIn.social({ provider: 'microsoft', callbackURL: callbackUrl });
      if (res?.error) {
        setError(ERROR_MESSAGES[res.error.message ?? ''] ?? 'Sign-in failed. Try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <h1 className="text-center text-card-title font-semibold text-ink">Welcome back</h1>
      <p className="mt-1 mb-md text-center text-body-sm text-ink-muted">
        Your tenant signs in with Microsoft Entra.
      </p>

      <div className="flex flex-col gap-sm rounded-lg border border-hairline bg-canvas p-lg duration-200 animate-in fade-in">
        <EmailChip email={email} onEdit={onEdit} />

        <Alert variant="info">
          <AlertDescription className="flex items-start gap-1.5 text-body-sm leading-snug">
            <ShieldIcon className="mt-0.5 size-3.5 shrink-0" />
            <span>
              Your tenant requires <b className="font-semibold">Entra SSO</b>. Password sign-in is
              disabled.
            </span>
          </AlertDescription>
        </Alert>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Button
          size="lg"
          variant="secondary"
          className="w-full gap-2.5 font-medium"
          onClick={() => void handleSignIn()}
          disabled={submitting}
        >
          <MicrosoftLogo />
          {submitting ? 'Redirecting…' : 'Continue with Microsoft'}
        </Button>

        <p className="text-center text-caption text-ink-subtle">
          You&apos;ll be redirected to login.microsoftonline.com
        </p>
      </div>

      <p className="mt-md text-center text-caption text-ink-subtle">
        Trouble signing in?{' '}
        <a
          href="mailto:support@seta-international.vn"
          className="font-medium text-primary hover:underline"
        >
          Contact your admin
        </a>
      </p>
    </>
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
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between">
        <Label htmlFor={id} className="text-caption font-medium text-ink-muted">
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
    <div className="flex items-center gap-2.5 rounded-md border border-hairline bg-surface-1 px-sm py-1.5">
      <EmailAvatar email={email} />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-[10.5px] uppercase tracking-wide text-ink-subtle">Signing in as</span>
        <span className="truncate font-mono text-caption font-medium text-ink">{email}</span>
      </div>
      <button
        type="button"
        onClick={onEdit}
        className="rounded-xs px-1.5 py-0.5 text-caption text-ink-subtle transition-colors hover:bg-surface-2 hover:text-ink"
      >
        Edit
      </button>
    </div>
  );
}

const AVATAR_PALETTE = [
  ['#f3d5d0', '#7a3a30'],
  ['#d8e7d3', '#2f5a2a'],
  ['#d4e0f3', '#2a4778'],
  ['#f3e6c8', '#7a5a1f'],
  ['#e7d4ef', '#5a2f78'],
  ['#d0e5e7', '#1f5a60'],
  ['#f0d8e2', '#7a2f4d'],
] as const;

function EmailAvatar({ email }: { email: string }) {
  const initial = (email[0] ?? '?').toUpperCase();
  let h = 0;
  for (let i = 0; i < email.length; i++) h = (h * 31 + email.charCodeAt(i)) | 0;
  const [bg, fg] = AVATAR_PALETTE[Math.abs(h) % AVATAR_PALETTE.length] ?? AVATAR_PALETTE[0];
  return (
    <span
      aria-hidden="true"
      className="inline-flex size-5 shrink-0 items-center justify-center rounded-full text-[9.5px] font-semibold"
      style={{ background: bg, color: fg }}
    >
      {initial}
    </span>
  );
}

function SystemStatus() {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="relative inline-flex size-1.5">
        <span className="absolute inset-0 animate-ping rounded-full bg-semantic-success opacity-60" />
        <span className="relative inline-block size-1.5 rounded-full bg-semantic-success" />
      </span>
      All systems operational
    </span>
  );
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 10 10"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-2.5"
      aria-hidden="true"
    >
      <path d="M1.5 5.2L4 7.5L8.5 3" />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-3"
      aria-hidden="true"
    >
      <path d="M3 8h10M9 4l4 4-4 4" />
    </svg>
  );
}

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M8 1.5 3 3.5v4c0 3 2 5.5 5 6.5 3-1 5-3.5 5-6.5v-4L8 1.5Z" />
    </svg>
  );
}

function MicrosoftLogo() {
  return (
    <svg viewBox="0 0 14 14" width="14" height="14" aria-hidden="true">
      <rect x="0.5" y="0.5" width="6" height="6" fill="#f25022" />
      <rect x="7.5" y="0.5" width="6" height="6" fill="#7fba00" />
      <rect x="0.5" y="7.5" width="6" height="6" fill="#00a4ef" />
      <rect x="7.5" y="7.5" width="6" height="6" fill="#ffb900" />
    </svg>
  );
}
