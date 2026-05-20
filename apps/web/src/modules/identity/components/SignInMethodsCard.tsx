import {
  Alert,
  AlertDescription,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Label,
  Switch,
} from '@seta/shared-ui';
import { useState } from 'react';
import { setLocalPasswordDisabled } from '../api/sso-client.ts';

interface SignInMethodsCardProps {
  localPasswordDisabled: boolean;
  hasEnabledProvider: boolean;
  onChanged: () => void;
}

export function SignInMethodsCard({
  localPasswordDisabled,
  hasEnabledProvider,
  onChanged,
}: SignInMethodsCardProps) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleToggle(checked: boolean) {
    // checked = true means "allow password sign-in" = localPasswordDisabled is false
    const newDisabled = !checked;

    if (newDisabled && !hasEnabledProvider) {
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await setLocalPasswordDisabled(newDisabled);
      onChanged();
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.includes('404') || msg.includes('HTTP 404')) {
        setError('Password sign-in toggle is not available yet.');
      } else {
        setError(msg);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign-in methods</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="local-password-switch">Allow password sign-in</Label>
            <p className="text-muted-foreground text-xs">
              When disabled, members must sign in via SSO only.
            </p>
          </div>
          <Switch
            id="local-password-switch"
            checked={!localPasswordDisabled}
            onCheckedChange={handleToggle}
            disabled={busy}
          />
        </div>
        {!hasEnabledProvider && !localPasswordDisabled && (
          <Alert>
            <AlertDescription>
              Connect a Microsoft Entra ID provider before disabling local password sign-in.
            </AlertDescription>
          </Alert>
        )}
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
