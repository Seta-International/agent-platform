import { Alert, AlertDescription, Switch } from '@seta/shared-ui';
import { useState } from 'react';
import { setLocalPasswordDisabled } from '../api/sso-client.ts';

interface SignInMethodsCardProps {
  localPasswordDisabled: boolean;
  hasEnabledProvider: boolean;
  onChanged: () => void;
}

interface MethodRowProps {
  switchId: string;
  title: string;
  description: React.ReactNode;
  enabled: boolean;
  disabledSwitch?: boolean;
  busy?: boolean;
  onToggle?: (next: boolean) => void;
}

function MethodRow({
  switchId,
  title,
  description,
  enabled,
  disabledSwitch,
  busy,
  onToggle,
}: MethodRowProps) {
  return (
    <div className="flex items-start justify-between gap-4 px-5 py-4">
      <label htmlFor={switchId} className="min-w-0 flex-1 cursor-pointer">
        <div className="flex items-center gap-2">
          <span className="text-body font-medium text-ink">{title}</span>
          <span
            className={`inline-flex h-5 items-center rounded-full px-2 text-caption font-medium ${
              enabled
                ? 'border-0 bg-success-tint text-success'
                : 'border border-hairline bg-surface-1 text-ink-muted'
            }`}
          >
            {enabled ? 'Enabled' : 'Disabled'}
          </span>
        </div>
        <p className="m-0 mt-1 text-body-sm text-ink-subtle">{description}</p>
      </label>
      <Switch
        id={switchId}
        checked={enabled}
        disabled={disabledSwitch || busy}
        onCheckedChange={onToggle ? (v) => onToggle(!!v) : undefined}
      />
    </div>
  );
}

export function SignInMethodsCard({
  localPasswordDisabled,
  hasEnabledProvider,
  onChanged,
}: SignInMethodsCardProps) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleToggle(checked: boolean) {
    const newDisabled = !checked;
    if (newDisabled && !hasEnabledProvider) return;

    setBusy(true);
    setError(null);
    try {
      await setLocalPasswordDisabled(newDisabled);
      onChanged();
    } catch (e) {
      const msg = (e as Error).message;
      setError(
        msg.includes('404') || msg.includes('HTTP 404')
          ? 'Password sign-in toggle is not available yet.'
          : msg,
      );
    } finally {
      setBusy(false);
    }
  }

  const localEnabled = !localPasswordDisabled;
  const localDisableBlocked = localEnabled && !hasEnabledProvider;

  return (
    <section className="overflow-hidden rounded-lg border border-hairline bg-canvas">
      <header className="border-b border-hairline-tertiary px-5 py-4">
        <h2 className="m-0 text-section-title font-semibold tracking-tight text-ink">
          Sign-in methods
        </h2>
        <p className="m-0 mt-0.5 text-body-sm text-ink-subtle">
          Control which authentication paths tenant members may use.
        </p>
      </header>

      <div className="divide-y divide-hairline-tertiary">
        <MethodRow
          switchId="local-password-switch"
          title="Password sign-in"
          description={
            localDisableBlocked
              ? 'Connect a Microsoft Entra ID provider before disabling password sign-in.'
              : 'Members may sign in with email + password. Disable to enforce SSO-only.'
          }
          enabled={localEnabled}
          disabledSwitch={localDisableBlocked && localEnabled}
          busy={busy}
          onToggle={handleToggle}
        />
        <MethodRow
          switchId="sso-method-mirror"
          title="Single sign-on"
          description={
            hasEnabledProvider
              ? 'Members sign in via the connected identity provider.'
              : 'Enable a provider above to allow SSO sign-in.'
          }
          enabled={hasEnabledProvider}
          disabledSwitch
        />
      </div>

      {error && (
        <div className="border-t border-hairline-tertiary px-5 py-3">
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </div>
      )}
    </section>
  );
}
