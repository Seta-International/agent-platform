import { Alert, AlertDescription, Card, PageChrome, Skeleton, Switch } from '@seta/shared-ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getTenantSettings,
  setLocalPasswordDisabled,
  type TenantSettings as TenantSettingsRow,
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

  return (
    <PageChrome breadcrumb={['Admin']} title="Organization">
      <div className="mx-auto max-w-[880px] space-y-4 p-6">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{(error as Error).message}</AlertDescription>
          </Alert>
        )}
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
