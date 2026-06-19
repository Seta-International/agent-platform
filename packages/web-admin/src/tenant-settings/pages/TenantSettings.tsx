import {
  Alert,
  AlertDescription,
  Button,
  Card,
  PageChrome,
  Skeleton,
  Switch,
} from '@seta/shared-ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { DomainsField } from '../../components/DomainsField.tsx';
import {
  getTenantSettings,
  setLocalPasswordDisabled,
  type TenantSettings as TenantSettingsRow,
  updateEmailDomains,
} from '../api/tenant-settings-client.ts';

const settingsKey = ['admin', 'tenant-settings'] as const;

export function TenantSettings() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery<TenantSettingsRow>({
    queryKey: settingsKey,
    queryFn: () => getTenantSettings(),
  });

  const toggle = useMutation({
    mutationFn: (disabled: boolean) => setLocalPasswordDisabled(disabled),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: settingsKey });
    },
  });

  const [domains, setDomains] = useState<string[]>([]);
  const [domainsSaved, setDomainsSaved] = useState(false);

  useEffect(() => {
    if (data) {
      setDomains(data.email_domains ?? []);
    }
  }, [data]);

  const saveDomainsM = useMutation({
    mutationFn: (next: string[]) => updateEmailDomains(next),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: settingsKey });
      setDomainsSaved(true);
      setTimeout(() => setDomainsSaved(false), 3000);
    },
  });

  return (
    <PageChrome breadcrumb={['Admin']} title="General">
      <div className="page-container space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{(error as Error).message}</AlertDescription>
          </Alert>
        )}
        <Card className="p-5">
          <div className="space-y-3">
            <div>
              <div className="font-medium text-ink">Email domains</div>
              <p className="mt-1 text-body-sm text-ink-muted">
                Used for work-email generation and SSO sign-in routing.
              </p>
            </div>
            {isLoading ? (
              <Skeleton className="h-9 w-full" />
            ) : (
              <>
                <DomainsField domains={domains} onChange={setDomains} idPrefix="org-domains" />
                {saveDomainsM.error && (
                  <div className="text-body-sm text-destructive">
                    {(saveDomainsM.error as Error).message}
                  </div>
                )}
                {domainsSaved && (
                  <div className="text-body-sm text-success">Email domains saved.</div>
                )}
                <div className="flex justify-end">
                  <Button
                    onClick={() => saveDomainsM.mutate(domains)}
                    disabled={saveDomainsM.isPending}
                  >
                    Save
                  </Button>
                </div>
              </>
            )}
          </div>
        </Card>
        <Card className="p-5">
          <div className="flex items-start justify-between gap-6">
            <div className="min-w-0 flex-1">
              <div className="font-medium text-ink">Require SSO for sign-in</div>
              <p className="mt-1 text-body-sm text-ink-muted">
                Turn on to make everyone sign in through a connected SSO provider. Existing
                passwords are kept on file but stop working.
              </p>
              {toggle.error && (
                <div className="mt-2 text-body-sm text-destructive">
                  {(toggle.error as Error).message}
                </div>
              )}
            </div>
            {isLoading || !data ? (
              <Skeleton className="h-6 w-11 rounded-full" />
            ) : (
              <Switch
                checked={data.local_password_disabled}
                onCheckedChange={(next) => toggle.mutate(next)}
                disabled={toggle.isPending}
                aria-label="Require SSO for sign-in"
              />
            )}
          </div>
        </Card>
      </div>
    </PageChrome>
  );
}
