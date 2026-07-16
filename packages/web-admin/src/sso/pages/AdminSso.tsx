import {
  Banner,
  BreadcrumbItem,
  Breadcrumbs,
  Button,
  HStack,
  Layout,
  LayoutContent,
  LayoutHeader,
  Skeleton,
  Text,
  VStack,
} from '@seta/shared-ui';
import { useSession } from '@seta/web-identity';
import { ExternalLink } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
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
  if (total === 0) return 'No providers connected yet';
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

  const subtitle = summarize(providers);

  return (
    <Layout
      height="fill"
      header={
        <LayoutHeader hasDivider padding={4}>
          <VStack gap={1}>
            <Breadcrumbs variant="supporting">
              <BreadcrumbItem href="/admin">Admin</BreadcrumbItem>
              <BreadcrumbItem isCurrent>Sign-in & SSO</BreadcrumbItem>
            </Breadcrumbs>
            <HStack hAlign="between" vAlign="center" gap={2}>
              <HStack gap={2} vAlign="center">
                <Text as="h1" size="lg" weight="semibold">
                  Sign-in & SSO
                </Text>
                {subtitle && <Text color="secondary">{subtitle}</Text>}
              </HStack>
              <Button
                variant="ghost"
                size="sm"
                label="Entra docs"
                icon={<ExternalLink aria-hidden className="size-3.5" />}
                href="https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app"
                target="_blank"
                rel="noopener noreferrer"
              />
            </HStack>
          </VStack>
        </LayoutHeader>
      }
      content={
        <LayoutContent>
          <div className="page-container space-y-4">
            {status === 'consent_granted' && (
              <Banner
                status="info"
                title="Admin consent granted. The provider is ready to enable."
              />
            )}
            {status === 'consent_failed' && (
              <Banner
                status="error"
                title={<>Admin consent didn&apos;t go through{error ? `: ${error}` : '.'}</>}
              />
            )}
            {fetchError && <Banner status="error" title={fetchError} />}

            {providers === null && !fetchError ? (
              <div className="space-y-4">
                <Skeleton height={224} radius={3} />
                <Skeleton height={128} radius={3} />
                <Skeleton height={176} radius={3} />
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
        </LayoutContent>
      }
    />
  );
}
