import {
  AuthBackdrop,
  AuthPanel,
  Avatar,
  Banner,
  Button,
  Center,
  Heading,
  Input,
  Link,
  SetaMark,
  Text,
  Token,
  VStack,
} from '@seta/shared-ui';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { ArrowRight } from 'lucide-react';
import { useState } from 'react';
import { discoverProvider } from '../api/client.ts';
import { signIn } from '../auth-client.ts';

type Step =
  | { kind: 'email' }
  | { kind: 'password'; email: string }
  | { kind: 'sso'; email: string; callbackUrl: string; providerId: string };

const ERROR_MESSAGES: Record<string, string> = {
  not_pre_provisioned: "We don't have an account for this email. Ask your admin to invite you.",
  tid_mismatch:
    'This Microsoft account belongs to a different organization. Use the work account your organization set up here.',
  oid_conflict:
    'This account is linked to a different Microsoft login. Ask your admin to sort it out.',
  user_deactivated: 'Your account is inactive. Contact your admin to reactivate it.',
  access_denied: 'Microsoft blocked this sign-in. Check with your IT team.',
  LOCAL_PASSWORD_DISABLED:
    'Your organization signs in with Microsoft. Use your work account instead.',
};

export function LoginCard() {
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as {
    redirect?: string;
    error?: string;
  };

  const [step, setStep] = useState<Step>({ kind: 'email' });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const initialError = search.error
    ? (ERROR_MESSAGES[search.error] ?? 'Something went wrong. Try again, or contact your admin.')
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
      setError("We couldn't reach the sign-in service. Try again in a moment.");
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
          setError('Too many attempts. Wait a minute, then try again.');
        } else {
          setError(res.error.message || "That email and password don't match. Try again.");
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
    <AuthBackdrop>
      <Center axis="both" minHeight="100vh">
        <VStack width="100%" hAlign="center" padding={6}>
          <VStack gap={4} hAlign="center" width="100%" maxWidth={400}>
            <AuthPanel
              brand={<SetaMark size={30} alt="" />}
              eyebrow={
                <Text type="supporting" color="secondary" weight="semibold">
                  Seta Future
                </Text>
              }
            >
              {children}
            </AuthPanel>
            <Text type="supporting" color="secondary" justify="center">
              © {new Date().getFullYear()} Seta International
            </Text>
          </VStack>
        </VStack>
      </Center>
    </AuthBackdrop>
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
    <form onSubmit={onSubmit}>
      <VStack gap={4} hAlign="stretch">
        <VStack gap={1} hAlign="center">
          <Heading level={1} justify="center">
            Sign in
          </Heading>
          <Text type="body" size="sm" color="secondary" justify="center">
            Enter your work email to continue.
          </Text>
        </VStack>

        <Input
          type="email"
          label="Work email"
          placeholder="you@company.com"
          value={email}
          onChange={(value) => onEmailChange(value)}
          size="lg"
          isRequired
        />

        {error ? <Banner status="error" title={error} /> : null}

        <Button
          type="submit"
          variant="primary"
          size="lg"
          isLoading={submitting}
          isDisabled={!email}
          label="Continue"
          endContent={<ArrowRight size={12} />}
        />

        <Text type="supporting" color="secondary" justify="center">
          Don&apos;t have access yet? Ask your admin to invite you.
        </Text>
      </VStack>
    </form>
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
    <form onSubmit={onSubmit}>
      <VStack gap={4} hAlign="stretch">
        <Heading level={1} justify="center">
          Enter your password
        </Heading>

        {/* Centred identity pill (Google-style): content-sized and centred so it reads
            as account context, not a disabled input; lg matches the field scale. */}
        <VStack gap={2} hAlign="center">
          <Text type="supporting" color="secondary">
            Signing in as
          </Text>
          <Token
            size="lg"
            label={email}
            icon={<Avatar name={email} size={24} />}
            onRemove={onEdit}
          />
        </VStack>

        <VStack gap={1} hAlign="stretch">
          <Input
            label="Password"
            type="password"
            value={password}
            onChange={(value) => onPasswordChange(value)}
            size="lg"
            isRequired
            status={error && !rateLimited ? { type: 'error', message: error } : undefined}
          />
          <Link
            href="mailto:support@seta-international.vn?subject=Password%20reset"
            type="supporting"
          >
            Reset
          </Link>
        </VStack>

        {error && rateLimited ? <Banner status="error" title={error} /> : null}

        <Button
          type="submit"
          variant="primary"
          size="lg"
          isLoading={submitting}
          isDisabled={!password || rateLimited}
          label="Sign in"
        />

        <Text type="supporting" color="secondary" justify="center">
          Wrong account?{' '}
          <Link onClick={onEdit} type="inherit">
            Start over
          </Link>
        </Text>
      </VStack>
    </form>
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
        setError(
          ERROR_MESSAGES[res.error.message ?? ''] ??
            'Something went wrong. Try again, or contact your admin.',
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <VStack gap={4} hAlign="stretch">
      <VStack gap={1} hAlign="center">
        <Heading level={1} justify="center">
          Sign in with Microsoft
        </Heading>
        <Text type="body" size="sm" color="secondary" justify="center">
          Your organization uses Microsoft to sign in.
        </Text>
      </VStack>

      {/* Centred identity pill (Google-style): content-sized and centred so it reads
          as account context, not a disabled input; lg matches the field scale. */}
      <VStack gap={2} hAlign="center">
        <Text type="supporting" color="secondary">
          Signing in as
        </Text>
        <Token size="lg" label={email} icon={<Avatar name={email} size={24} />} onRemove={onEdit} />
      </VStack>

      {error ? <Banner status="error" title={error} /> : null}

      <Button
        size="lg"
        variant="secondary"
        onClick={() => void handleSignIn()}
        isLoading={submitting}
        // Astryx hides loading-state content with `color: transparent`, which only
        // neutralises currentColor. MicrosoftLogo's vendor hex `fill`s ignore it and
        // would stay painted under the spinner, so drop the icon while loading.
        icon={submitting ? undefined : <MicrosoftLogo />}
        label="Continue with Microsoft"
      />

      <Text type="supporting" color="secondary" justify="center">
        You&apos;ll finish signing in on Microsoft.com.
      </Text>

      <Text type="supporting" color="secondary" justify="center">
        Can&apos;t get in?{' '}
        <Link href="mailto:support@seta-international.vn" type="inherit">
          Contact your admin
        </Link>
      </Text>
    </VStack>
  );
}

// Brand sign-in mark — no Astryx or lucide equivalent, and vendor marks may not be
// redrawn. Colours are Microsoft's, so they are deliberately raw hex, not tokens.
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
