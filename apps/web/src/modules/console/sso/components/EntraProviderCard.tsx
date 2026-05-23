import { Alert, AlertDescription, Button } from '@seta/shared-ui';
import { CheckCircle2, Plug, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import type { SsoProviderRowDto } from '../api/sso-client.ts';
import { disconnectProvider, setProviderEnabled, startConsent } from '../api/sso-client.ts';
import { ConnectEntraDialog } from './ConnectEntraDialog.tsx';
import { EditDomainsDialog } from './EditDomainsDialog.tsx';

interface EntraProviderCardProps {
  row: SsoProviderRowDto | null;
  onChanged: () => void;
}

type Status = 'not_connected' | 'consent_pending' | 'consent_granted' | 'active';
function deriveStatus(row: SsoProviderRowDto | null): Status {
  if (!row) return 'not_connected';
  if (row.config.consent_granted_at === null) return 'consent_pending';
  if (!row.enabled) return 'consent_granted';
  return 'active';
}

const STATUS_LABEL: Record<Status, string> = {
  not_connected: 'Not connected',
  consent_pending: 'Consent pending',
  consent_granted: 'Ready to enable',
  active: 'Active',
};

const STATUS_DOT: Record<Status, string> = {
  not_connected: 'bg-ink-tertiary',
  consent_pending: 'bg-warning',
  consent_granted: 'bg-primary',
  active: 'bg-success',
};

function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_1fr] items-baseline gap-3 py-2">
      <dt className="text-eyebrow uppercase tracking-[0.04em] text-ink-subtle">{label}</dt>
      <dd className="m-0 min-w-0 text-body-sm text-ink">{children}</dd>
    </div>
  );
}

function MicrosoftMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      role="img"
      aria-label="Microsoft"
      className={className}
      width="20"
      height="20"
    >
      <title>Microsoft</title>
      <rect x="1" y="1" width="10" height="10" fill="#f25022" />
      <rect x="13" y="1" width="10" height="10" fill="#7fba00" />
      <rect x="1" y="13" width="10" height="10" fill="#00a4ef" />
      <rect x="13" y="13" width="10" height="10" fill="#ffb900" />
    </svg>
  );
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return 'just now';
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86_400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86_400)}d ago`;
}

export function EntraProviderCard({ row, onChanged }: EntraProviderCardProps) {
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const status = deriveStatus(row);

  async function handleConsent() {
    setBusy(true);
    setActionError(null);
    try {
      const { admin_consent_url } = await startConsent();
      window.open(admin_consent_url, '_blank', 'noopener');
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleEnable() {
    setBusy(true);
    setActionError(null);
    try {
      await setProviderEnabled(true);
      onChanged();
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDisable() {
    setBusy(true);
    setActionError(null);
    try {
      await setProviderEnabled(false);
      onChanged();
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDisconnect() {
    if (
      !window.confirm('Disconnect the Microsoft Entra ID provider? SSO sign-in will stop working.')
    )
      return;
    setBusy(true);
    setActionError(null);
    try {
      await disconnectProvider();
      onChanged();
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="overflow-hidden rounded-lg border border-hairline bg-canvas">
      <header className="flex items-start justify-between gap-4 border-b border-hairline-tertiary px-5 py-4">
        <div className="flex items-start gap-3">
          <div className="flex size-9 flex-none items-center justify-center rounded-md border border-hairline bg-surface-1">
            <MicrosoftMark />
          </div>
          <div className="min-w-0">
            <h2 className="m-0 text-section-title font-semibold tracking-tight text-ink">
              Microsoft Entra ID
            </h2>
            <p className="m-0 mt-0.5 text-body-sm text-ink-subtle">
              Federated identity via OpenID Connect.
              {row?.updated_at && (
                <span className="ml-1">
                  Updated <time dateTime={row.updated_at}>{relativeTime(row.updated_at)}</time>.
                </span>
              )}
            </p>
          </div>
        </div>
        <div
          className="flex flex-none items-center gap-1.5 rounded-full border border-hairline bg-surface-1 px-2.5 py-1"
          role="status"
          aria-label={`Status: ${STATUS_LABEL[status]}`}
        >
          <span aria-hidden className={`size-1.5 rounded-full ${STATUS_DOT[status]}`} />
          <span className="text-caption font-medium text-ink">{STATUS_LABEL[status]}</span>
        </div>
      </header>

      {row === null ? (
        <div className="px-5 py-6">
          <div className="flex items-start gap-3 rounded-md border border-dashed border-hairline-strong bg-surface-1 px-4 py-3">
            <Plug aria-hidden className="mt-0.5 size-4 flex-none text-ink-subtle" />
            <div className="min-w-0 flex-1">
              <p className="m-0 text-body-sm text-ink">
                Connect your Entra tenant to let members sign in with their Microsoft work account.
              </p>
              <p className="m-0 mt-1 text-caption text-ink-subtle">
                Admin pre-provisioning is required. New SSO logins must match an existing user.
              </p>
            </div>
            <ConnectEntraDialog onConnected={onChanged} />
          </div>
        </div>
      ) : (
        <>
          <dl className="m-0 divide-y divide-hairline-tertiary px-5 py-1">
            <MetaRow label="Tenant ID">
              <code className="font-mono text-body-sm text-ink">{row.config.entra_tenant_id}</code>
            </MetaRow>
            <MetaRow label="Email domains">
              <div className="flex flex-wrap items-center gap-1.5">
                {row.email_domains.length === 0 ? (
                  <span className="text-ink-subtle">None configured</span>
                ) : (
                  row.email_domains.map((d) => (
                    <span
                      key={d}
                      className="inline-flex h-5 items-center rounded-full border border-hairline bg-surface-1 px-2 font-mono text-caption text-ink"
                    >
                      {d}
                    </span>
                  ))
                )}
                <EditDomainsDialog
                  entraTenantId={row.config.entra_tenant_id}
                  initialDomains={row.email_domains}
                  onSaved={onChanged}
                />
              </div>
            </MetaRow>
            <MetaRow label="Admin consent">
              {row.config.consent_granted_at ? (
                <span className="inline-flex items-center gap-1.5">
                  <CheckCircle2 aria-hidden className="size-3.5 text-success" />
                  <span className="text-body-sm text-ink">
                    Granted{' '}
                    {row.config.consent_granted_by_email && (
                      <>
                        by{' '}
                        <code className="font-mono text-body-sm text-ink-muted">
                          {row.config.consent_granted_by_email}
                        </code>{' '}
                      </>
                    )}
                    <time dateTime={row.config.consent_granted_at} className="text-ink-subtle">
                      ({relativeTime(row.config.consent_granted_at)})
                    </time>
                  </span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5">
                  <ShieldCheck aria-hidden className="size-3.5 text-warning" />
                  <span className="text-body-sm text-ink-muted">
                    Pending: grant consent in Microsoft to activate.
                  </span>
                </span>
              )}
            </MetaRow>
          </dl>

          <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-hairline-tertiary bg-surface-1 px-5 py-3">
            <div className="flex flex-wrap items-center gap-2">
              {status === 'consent_pending' && (
                <Button onClick={handleConsent} disabled={busy} size="sm">
                  Grant admin consent
                </Button>
              )}
              {status === 'consent_granted' && (
                <Button onClick={handleEnable} disabled={busy} size="sm">
                  Enable SSO
                </Button>
              )}
              {status === 'active' && (
                <Button variant="secondary" onClick={handleDisable} disabled={busy} size="sm">
                  Disable
                </Button>
              )}
            </div>
            <Button
              variant="ghost"
              onClick={handleDisconnect}
              disabled={busy}
              size="sm"
              className="text-danger hover:bg-danger-tint hover:text-danger"
            >
              Disconnect
            </Button>
          </footer>
        </>
      )}

      {actionError && (
        <div className="border-t border-hairline-tertiary px-5 py-3">
          <Alert variant="destructive">
            <AlertDescription>{actionError}</AlertDescription>
          </Alert>
        </div>
      )}
    </section>
  );
}
