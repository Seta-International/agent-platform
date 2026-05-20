import { Alert, AlertDescription, Skeleton } from '@seta/shared-ui';
import { useCallback, useEffect, useState } from 'react';
import type { SsoProviderRowDto } from '../api/sso-client.ts';
import { listProviders } from '../api/sso-client.ts';
import { EntraProviderCard } from '../components/EntraProviderCard.tsx';
import { useSession } from '../components/SessionProvider.tsx';
import { SignInMethodsCard } from '../components/SignInMethodsCard.tsx';

interface AdminSsoProps {
  status?: string;
  error?: string;
}

export function AdminSso({ status, error }: AdminSsoProps) {
  const session = useSession();
  const [providers, setProviders] = useState<SsoProviderRowDto[] | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: refreshKey is a manual trigger; incrementing it forces a re-fetch
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      listProviders()
        .then((rows) => {
          if (!cancelled) setProviders(rows);
        })
        .catch((e: unknown) => {
          if (!cancelled) setFetchError((e as Error).message);
        });
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [refreshKey]);

  const entraRow = providers?.find((p) => p.provider_id === 'microsoft-entra-id') ?? null;
  const hasEnabledProvider = providers?.some((p) => p.enabled) ?? false;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">SSO Configuration</h1>

      {status === 'consent_granted' && (
        <Alert>
          <AlertDescription>Admin consent granted successfully.</AlertDescription>
        </Alert>
      )}
      {status === 'consent_failed' && (
        <Alert variant="destructive">
          <AlertDescription>Admin consent failed{error ? `: ${error}` : '.'}</AlertDescription>
        </Alert>
      )}

      {fetchError && (
        <Alert variant="destructive">
          <AlertDescription>{fetchError}</AlertDescription>
        </Alert>
      )}

      {providers === null && !fetchError ? (
        <div className="space-y-4">
          <Skeleton className="h-40 w-full rounded-lg" />
          <Skeleton className="h-28 w-full rounded-lg" />
        </div>
      ) : (
        <div className="space-y-4">
          <EntraProviderCard row={entraRow} onChanged={refresh} />
          <SignInMethodsCard
            localPasswordDisabled={session.tenant_local_password_disabled}
            hasEnabledProvider={hasEnabledProvider}
            onChanged={refresh}
          />
        </div>
      )}
    </div>
  );
}
