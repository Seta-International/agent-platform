import {
  Alert,
  AlertDescription,
  Button,
  Card,
  CardContent,
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

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex justify-center">
          <SetaLogo height={32} />
        </div>
        <Card>
          <CardContent className="pt-6">
            {step === 'email' ? (
              <form onSubmit={onContinue} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    autoFocus
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
                <Button type="submit" className="w-full" disabled={submitting || !email}>
                  Continue
                </Button>
              </form>
            ) : (
              <form onSubmit={onSignIn} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email-display">Email</Label>
                  <Input id="email-display" type="email" value={email} readOnly />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    autoFocus
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
                <Button
                  type="submit"
                  className="w-full"
                  disabled={submitting || !password || rateLimited}
                >
                  Sign in
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  onClick={() => {
                    setStep('email');
                    setPassword('');
                    setError(null);
                  }}
                >
                  Use a different email
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
