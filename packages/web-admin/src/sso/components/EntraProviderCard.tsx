import {
  Badge,
  Banner,
  Button,
  Card,
  Divider,
  HStack,
  InfoRow,
  SettingsSection,
  StatusDot,
  Text,
  VStack,
} from '@seta/shared-ui';
import { CheckCircle2, Plug, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import type { SsoProviderRowDto } from '../api/sso-client.ts';
import {
  disconnectProvider,
  setProviderEnabled,
  startConsent,
  syncConsent,
} from '../api/sso-client.ts';
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
  consent_pending: 'Waiting on consent',
  consent_granted: 'Ready to turn on',
  active: 'Active',
};

const STATUS_VARIANT: Record<Status, 'neutral' | 'warning' | 'accent' | 'success'> = {
  not_connected: 'neutral',
  consent_pending: 'warning',
  consent_granted: 'accent',
  active: 'success',
};

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

  async function handleSyncConsent() {
    setBusy(true);
    setActionError(null);
    try {
      const updated = await syncConsent();
      if (!updated.config.consent_granted_at) {
        setActionError(
          "Microsoft hasn't confirmed admin consent yet. Grant it in Microsoft, then check again.",
        );
      }
      onChanged();
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
      !window.confirm(
        "Disconnect Microsoft Entra ID? Your team won't be able to sign in with Microsoft until you reconnect.",
      )
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
    <SettingsSection
      title="Microsoft Entra ID"
      description="Let your team sign in with their Microsoft work account."
    >
      <HStack hAlign="between" vAlign="center" gap={2} paddingBlock={4}>
        <HStack gap={2} vAlign="center">
          <MicrosoftMark />
          {row?.updated_at && (
            <Text type="supporting" color="secondary">
              Updated <time dateTime={row.updated_at}>{relativeTime(row.updated_at)}</time>.
            </Text>
          )}
        </HStack>
        <HStack gap={1.5} vAlign="center">
          <StatusDot variant={STATUS_VARIANT[status]} label={`Status: ${STATUS_LABEL[status]}`} />
          <Text type="supporting" weight="medium">
            {STATUS_LABEL[status]}
          </Text>
        </HStack>
      </HStack>
      <Divider />

      {row === null ? (
        <Card variant="muted">
          <HStack gap={3} vAlign="start">
            <Plug
              aria-hidden
              className="size-4 flex-none"
              style={{ color: 'var(--color-text-secondary)' }}
            />
            <VStack gap={1}>
              <Text display="block">
                Microsoft Entra sign-in is linked through the Microsoft 365 integration.
              </Text>
              <Text type="supporting" color="secondary" display="block">
                Configure the Microsoft 365 integration (via platform provisioning) first. Once
                it&apos;s linked, the Entra provider appears here to enable and to manage email
                domains.
              </Text>
            </VStack>
          </HStack>
        </Card>
      ) : (
        <>
          <InfoRow
            label="Tenant ID"
            value={
              row.entra_tenant_id ? (
                <code className="font-mono">{row.entra_tenant_id}</code>
              ) : (
                'Not yet linked — configured via the Microsoft 365 integration.'
              )
            }
          />
          <InfoRow
            label="Email domains"
            value={
              row.email_domains.length === 0 ? (
                'No domains added yet'
              ) : (
                <HStack as="span" gap={1.5} wrap="wrap">
                  {row.email_domains.map((d) => (
                    <Badge key={d} variant="neutral" label={d} className="font-mono" />
                  ))}
                </HStack>
              )
            }
            action={
              <EditDomainsDialog
                entraTenantId={row.entra_tenant_id}
                initialDomains={row.email_domains}
                onSaved={onChanged}
              />
            }
          />
          <InfoRow
            label="Admin consent"
            value={
              row.config.consent_granted_at ? (
                <HStack as="span" gap={1.5} vAlign="center">
                  <CheckCircle2
                    aria-hidden
                    className="size-3.5"
                    style={{ color: 'var(--color-success)' }}
                  />
                  <span>
                    Granted{' '}
                    {row.config.consent_granted_by_email && (
                      <>
                        by <code className="font-mono">
                          {row.config.consent_granted_by_email}
                        </code>{' '}
                      </>
                    )}
                    <time dateTime={row.config.consent_granted_at}>
                      ({relativeTime(row.config.consent_granted_at)})
                    </time>
                  </span>
                </HStack>
              ) : (
                <HStack as="span" gap={1.5} vAlign="center">
                  <ShieldCheck
                    aria-hidden
                    className="size-3.5"
                    style={{ color: 'var(--color-warning)' }}
                  />
                  <span>Grant admin consent in Microsoft to finish activating.</span>
                </HStack>
              )
            }
          />

          <HStack hAlign="between" vAlign="center" gap={2} paddingBlock={4}>
            <HStack gap={2} vAlign="center">
              {status === 'consent_pending' && (
                <>
                  <Button
                    onClick={handleConsent}
                    isDisabled={busy}
                    size="sm"
                    variant="primary"
                    label="Grant admin consent"
                  />
                  <Button
                    variant="ghost"
                    onClick={handleSyncConsent}
                    isDisabled={busy}
                    size="sm"
                    label="Already granted in Microsoft? Check again"
                  />
                </>
              )}
              {status === 'consent_granted' && (
                <Button
                  onClick={handleEnable}
                  isDisabled={busy}
                  size="sm"
                  variant="primary"
                  label="Turn on Microsoft sign-in"
                />
              )}
              {status === 'active' && (
                <Button
                  variant="secondary"
                  onClick={handleDisable}
                  isDisabled={busy}
                  size="sm"
                  label="Turn off"
                />
              )}
            </HStack>
            <Button
              variant="destructive"
              onClick={handleDisconnect}
              isDisabled={busy}
              size="sm"
              label="Disconnect"
            />
          </HStack>
        </>
      )}

      {actionError && <Banner status="error" title={actionError} />}
    </SettingsSection>
  );
}
