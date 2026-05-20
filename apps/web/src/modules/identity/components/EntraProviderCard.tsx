import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@seta/shared-ui';
import { useState } from 'react';
import type { SsoProviderRowDto } from '../api/sso-client.ts';
import { disconnectProvider, setProviderEnabled, startConsent } from '../api/sso-client.ts';
import { ConnectEntraDialog } from './ConnectEntraDialog.tsx';
import { EditDomainsDialog } from './EditDomainsDialog.tsx';

interface EntraProviderCardProps {
  row: SsoProviderRowDto | null;
  onChanged: () => void;
}

export function EntraProviderCard({ row, onChanged }: EntraProviderCardProps) {
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Microsoft Entra ID</CardTitle>
          {row === null && <Badge variant="secondary">Not connected</Badge>}
          {row !== null && row.config.consent_granted_at === null && (
            <Badge variant="secondary">Consent pending</Badge>
          )}
          {row !== null && row.config.consent_granted_at !== null && !row.enabled && (
            <Badge variant="secondary">Consent granted</Badge>
          )}
          {row?.enabled && <Badge>Active</Badge>}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {row === null ? (
          <div className="space-y-2">
            <p className="text-muted-foreground text-sm">
              Connect a Microsoft Entra ID tenant to enable SSO sign-in for your organization.
            </p>
            <ConnectEntraDialog onConnected={onChanged} />
          </div>
        ) : (
          <>
            <div className="space-y-2 text-sm">
              <div>
                <span className="text-muted-foreground">Entra tenant ID: </span>
                <code className="font-mono">{row.config.entra_tenant_id}</code>
              </div>
              <div className="flex flex-wrap items-center gap-1">
                <span className="text-muted-foreground">Email domains: </span>
                {row.email_domains.map((d) => (
                  <Badge key={d} variant="outline">
                    {d}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {row.config.consent_granted_at === null && (
                <Button onClick={handleConsent} disabled={busy}>
                  Grant admin consent
                </Button>
              )}
              {row.config.consent_granted_at !== null && !row.enabled && (
                <Button onClick={handleEnable} disabled={busy}>
                  Enable
                </Button>
              )}
              {row.enabled && (
                <Button variant="secondary" onClick={handleDisable} disabled={busy}>
                  Disable
                </Button>
              )}
              <EditDomainsDialog
                entraTenantId={row.config.entra_tenant_id}
                initialDomains={row.email_domains}
                onSaved={onChanged}
              />
              <Button variant="destructive" onClick={handleDisconnect} disabled={busy}>
                Disconnect
              </Button>
            </div>
          </>
        )}
        {actionError && (
          <Alert variant="destructive">
            <AlertDescription>{actionError}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
