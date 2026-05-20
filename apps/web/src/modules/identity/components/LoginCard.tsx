import {
  Alert,
  AlertDescription,
  Button,
  cn,
  DotFieldBackdrop,
  Input,
  Label,
  SetaLogo,
} from '@seta/shared-ui';
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
    <div className="grid min-h-screen grid-cols-1 bg-canvas lg:grid-cols-[minmax(0,520px)_1fr]">
      <FormPane
        step={step}
        email={email}
        password={password}
        error={error}
        submitting={submitting}
        rateLimited={rateLimited}
        onEmailChange={setEmail}
        onPasswordChange={setPassword}
        onContinue={onContinue}
        onSignIn={onSignIn}
        onResetToEmail={resetToEmail}
      />
      <ShowcasePane />
    </div>
  );
}

interface FormPaneProps {
  step: Step;
  email: string;
  password: string;
  error: string | null;
  submitting: boolean;
  rateLimited: boolean;
  onEmailChange: (v: string) => void;
  onPasswordChange: (v: string) => void;
  onContinue: (e: React.FormEvent) => void;
  onSignIn: (e: React.FormEvent) => void;
  onResetToEmail: () => void;
}

function FormPane(props: FormPaneProps) {
  const {
    step,
    email,
    password,
    error,
    submitting,
    rateLimited,
    onEmailChange,
    onPasswordChange,
    onContinue,
    onSignIn,
    onResetToEmail,
  } = props;

  return (
    <section className="relative flex flex-col justify-between px-lg py-lg sm:px-xl lg:px-xxl lg:py-xl">
      <header className="flex items-center justify-between">
        <SetaLogo height={24} />
        <a
          href="mailto:support@seta-international.vn"
          className="text-caption text-ink-subtle transition-colors hover:text-ink"
        >
          Need help?
        </a>
      </header>

      <main className="mx-auto flex w-full max-w-sm flex-col gap-xl py-xxl">
        <div className="space-y-sm">
          <p className="text-eyebrow uppercase text-ink-subtle">
            <span className="font-mono text-ink-tertiary">{'//'}</span> Agent platform · access
          </p>
          <h1 className="text-display-md text-ink">
            {step === 'email' ? 'Welcome back.' : 'Confirm it’s you.'}
          </h1>
          <p className="text-body text-ink-subtle">
            {step === 'email'
              ? 'Sign in to your Seta workspace.'
              : 'Enter the password for this account to continue.'}
          </p>
        </div>

        {step === 'email' ? (
          <form
            onSubmit={onContinue}
            className="flex flex-col gap-md duration-200 animate-in fade-in slide-in-from-bottom-1"
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

            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}

            <Button type="submit" size="lg" className="w-full" disabled={submitting || !email}>
              {submitting ? 'Checking…' : 'Continue'}
              <ArrowRight />
            </Button>

            <p className="text-caption text-ink-tertiary">
              Microsoft Entra accounts are redirected automatically.
            </p>
          </form>
        ) : (
          <form
            onSubmit={onSignIn}
            className="flex flex-col gap-md duration-200 animate-in fade-in slide-in-from-bottom-1"
          >
            <EmailChip email={email} onEdit={onResetToEmail} />

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
        )}
      </main>

      <footer className="flex items-center justify-between text-caption text-ink-tertiary">
        <PingDot label="All systems normal" />
        <span className="font-mono">SETA · M2</span>
      </footer>
    </section>
  );
}

function ShowcasePane() {
  return (
    <aside className="relative hidden overflow-hidden border-l border-hairline bg-surface-1 lg:flex lg:flex-col lg:justify-between lg:p-xxl">
      <DotFieldBackdrop origin="top-left" intensity="default" />

      <div className="relative flex items-center gap-xs">
        <span className="size-1.5 rounded-full bg-primary" />
        <span className="text-eyebrow uppercase text-ink-subtle">Coordination layer</span>
      </div>

      <div className="relative flex max-w-lg flex-col gap-lg">
        <h2 className="text-display-lg text-ink">
          Where your people and your agents share one task graph.
        </h2>
        <p className="text-body-lg text-ink-muted">
          Seta routes work across humans and copilots — with auditable approvals, tenant-scoped
          permissions, and a workspace that remembers context.
        </p>
      </div>

      <ActivityPreview />

      <div className="relative flex items-center justify-between text-caption">
        <span className="text-ink-subtle">© 2026 Seta International</span>
        <span className="font-mono text-ink-tertiary">build · m2.stream-a</span>
      </div>
    </aside>
  );
}

function ActivityPreview() {
  return (
    <div className="relative rounded-xl border border-hairline bg-canvas p-lg">
      <div className="flex items-center justify-between border-b border-hairline pb-sm">
        <PingDot
          tone="ok"
          label="Live activity"
          labelClassName="text-body-sm font-medium text-ink"
        />
        <span className="font-mono text-caption text-ink-tertiary">3 working</span>
      </div>

      <ul className="divide-y divide-hairline">
        <ActivityRow
          actor="planner-copilot"
          actorType="agent"
          verb="proposed split for"
          target="ENG-204 · Auth migration"
          status="pending review"
          statusTone="brand"
          time="just now"
        />
        <ActivityRow
          actor="ngoc.t"
          actorType="human"
          verb="approved plan on"
          target="ENG-198 · Inbox triage"
          status="approved"
          statusTone="ok"
          time="2m"
        />
        <ActivityRow
          actor="research-copilot"
          actorType="agent"
          verb="summarized 12 docs for"
          target="OPS-31 · Q2 vendor review"
          status="ready"
          statusTone="ok"
          time="6m"
        />
        <ActivityRow
          actor="canh.t"
          actorType="human"
          verb="started review on"
          target="ENG-204"
          status="in progress"
          statusTone="muted"
          time="11m"
        />
      </ul>
    </div>
  );
}

interface ActivityRowProps {
  actor: string;
  actorType: 'human' | 'agent';
  verb: string;
  target: string;
  status: string;
  statusTone: 'ok' | 'brand' | 'muted';
  time: string;
}

function ActivityRow(props: ActivityRowProps) {
  const { actor, actorType, verb, target, status, statusTone, time } = props;
  return (
    <li className="flex items-center justify-between gap-md py-sm">
      <div className="flex min-w-0 items-center gap-sm">
        <ActorBadge actorType={actorType} actor={actor} />
        <p className="min-w-0 truncate text-body-sm text-ink-muted">
          <span className="text-ink">{actor}</span> <span className="text-ink-subtle">{verb}</span>{' '}
          <span className="font-mono text-ink">{target}</span>
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-sm">
        <StatusPill tone={statusTone}>{status}</StatusPill>
        <span className="font-mono text-caption text-ink-tertiary">{time}</span>
      </div>
    </li>
  );
}

function ActorBadge({ actorType, actor }: { actorType: 'human' | 'agent'; actor: string }) {
  const initial = actor[0]?.toUpperCase() ?? '?';
  if (actorType === 'agent') {
    return (
      <span
        className="grid size-6 place-items-center rounded-md border border-hairline bg-surface-2 text-caption text-primary"
        title="Agent"
      >
        ⌘
      </span>
    );
  }
  return (
    <span
      className="grid size-6 place-items-center rounded-full bg-surface-3 text-caption font-medium text-ink"
      title="Human"
    >
      {initial}
    </span>
  );
}

const PILL_TONES = {
  ok: 'bg-semantic-success/15 text-semantic-success',
  brand: 'bg-primary/15 text-primary',
  muted: 'bg-surface-2 text-ink-subtle',
} as const;

function StatusPill({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: keyof typeof PILL_TONES;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-pill px-xs py-px text-caption',
        PILL_TONES[tone],
      )}
    >
      {children}
    </span>
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
      <div className="flex min-w-0 items-center gap-xs">
        <span className="grid size-5 shrink-0 place-items-center rounded-full bg-primary/15 text-caption text-primary">
          {email[0]?.toUpperCase() ?? '?'}
        </span>
        <span className="truncate text-body-sm text-ink">{email}</span>
      </div>
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

function PingDot({
  tone = 'ok',
  label,
  labelClassName,
}: {
  tone?: 'ok';
  label: string;
  labelClassName?: string;
}) {
  const color = tone === 'ok' ? 'bg-semantic-success' : 'bg-semantic-success';
  return (
    <span className="inline-flex items-center gap-xs">
      <span className="relative inline-flex size-1.5">
        <span className={cn('absolute inset-0 animate-ping rounded-full opacity-60', color)} />
        <span className={cn('relative size-1.5 rounded-full', color)} />
      </span>
      <span className={cn('text-caption text-ink-tertiary', labelClassName)}>{label}</span>
    </span>
  );
}

function ArrowRight() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <title>arrow-right</title>
      <path
        d="M3.5 8h9m0 0L8.75 4.25M12.5 8l-3.75 3.75"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
