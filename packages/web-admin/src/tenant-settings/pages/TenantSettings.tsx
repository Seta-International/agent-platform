import { Alert, AlertDescription, Button, Card, PageChrome, Skeleton } from '@seta/shared-ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { DomainsField } from '../../components/DomainsField.tsx';
import {
  getTenantSettings,
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
                Used to generate work email addresses for new people.
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
      </div>
    </PageChrome>
  );
}
