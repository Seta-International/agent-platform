import { Alert, AlertDescription, Button, PageChrome, Skeleton } from '@seta/shared-ui';
import { ExternalLink } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useSession } from '@/modules/identity/components/SessionProvider.tsx';
import type { SsoProviderRowDto } from '../api/sso-client.ts';
import { listProviders } from '../api/sso-client.ts';
import { ComingSoonProvidersCard } from '../components/ComingSoonProvidersCard.tsx';
import { EntraProviderCard } from '../components/EntraProviderCard.tsx';
import { SignInMethodsCard } from '../components/SignInMethodsCard.tsx';

interface AdminSsoProps {
  status?: string;
  error?: string;
}

function summarize(providers: SsoProviderRowDto[] | null): string {
  if (providers === null) return 'Loading…';
  const total = providers.length;
  const active = providers.filter((p) => p.enabled).length;
  if (total === 0) return 'No providers configured';
  const noun = total === 1 ? 'provider' : 'providers';
  return `${total} ${noun} · ${active} active`;
}

export function AdminSso({ status, error }: AdminSsoProps) {
  const session = useSession();
  const [providers, setProviders] = useState<SsoProviderRowDto[] | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchProviders = useCallback(() => {
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
  }, []);

  const refresh = useCallback(() => {
    void fetchProviders();
  }, [fetchProviders]);

  useEffect(() => fetchProviders(), [fetchProviders]);

  const entraRow = providers?.find((p) => p.provider_id === 'microsoft-entra-id') ?? null;
  const hasEnabledProvider = providers?.some((p) => p.enabled) ?? false;

  return (
    <PageChrome
      breadcrumb={['Admin']}
      title="Single sign-on"
      subtitle={summarize(providers)}
      actions={
        <Button variant="ghost" size="sm" asChild>
          <a
            href="https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5"
          >
            <ExternalLink aria-hidden className="size-3.5" />
            Entra docs
          </a>
        </Button>
      }
    >
      <div className="mx-auto max-w-[880px] space-y-4 p-6">
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
            <Skeleton className="h-56 w-full rounded-lg" />
            <Skeleton className="h-32 w-full rounded-lg" />
            <Skeleton className="h-44 w-full rounded-lg" />
          </div>
        ) : (
          <>
            <EntraProviderCard row={entraRow} onChanged={refresh} />
            <SignInMethodsCard
              localPasswordDisabled={session.tenant_local_password_disabled}
              hasEnabledProvider={hasEnabledProvider}
              onChanged={refresh}
            />
            <ComingSoonProvidersCard />
          </>
        )}
      </div>
    </PageChrome>
  );
}
