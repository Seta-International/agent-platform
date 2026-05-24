import { Alert, AlertDescription, PageChrome, Skeleton } from '@seta/shared-ui';
import { NotificationPrefRow } from '../components/NotificationPrefRow';
import { useNotificationPrefs, useSetNotificationPref } from '../hooks/usePrefs';

export function AdminNotificationPrefs() {
  const { data, isLoading, error } = useNotificationPrefs();
  const setPref = useSetNotificationPref();

  return (
    <PageChrome
      breadcrumb={['Admin']}
      title="Notifications"
      subtitle="Choose what your team gets notified about, and where."
    >
      <div className="mx-auto max-w-[880px] space-y-4 p-6">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>
              Couldn&apos;t load notification settings: {(error as Error).message}
            </AlertDescription>
          </Alert>
        )}

        {isLoading || !data ? (
          <Skeleton className="h-72 w-full rounded-lg" />
        ) : (
          <section className="overflow-hidden rounded-lg border border-hairline bg-canvas">
            <header className="border-b border-hairline-tertiary px-5 py-4">
              <h2 className="m-0 text-section-title font-semibold tracking-tight text-ink">
                Events
              </h2>
              <p className="m-0 mt-0.5 text-body-sm text-ink-subtle">
                Pick how each event reaches your team.
              </p>
            </header>

            <div className="divide-y divide-hairline-tertiary">
              {data.rows.map((row) => (
                <NotificationPrefRow
                  key={row.event_type}
                  row={row}
                  onToggle={(input) => setPref.mutate(input)}
                  disabled={setPref.isPending}
                />
              ))}
            </div>
          </section>
        )}
      </div>
    </PageChrome>
  );
}
