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
      subtitle="Choose which events generate notifications for everyone in this workspace."
    >
      <div className="mx-auto max-w-3xl p-6">
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>
              Failed to load notification settings: {(error as Error).message}
            </AlertDescription>
          </Alert>
        )}

        {isLoading || !data ? (
          <Skeleton className="h-72 w-full rounded-lg" />
        ) : (
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full">
              <thead className="bg-surface-2 text-muted-foreground text-sm">
                <tr className="border-b border-border">
                  <th className="px-4 py-2 text-left font-medium">Event</th>
                  <th className="px-4 py-2 text-left font-medium">In-app</th>
                  <th className="px-4 py-2 text-left font-medium">
                    <div className="flex items-center gap-2">
                      Email
                      <span className="rounded bg-surface-3 px-1.5 py-0.5 font-medium text-xs">
                        v1.x
                      </span>
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <NotificationPrefRow
                    key={row.event_type}
                    row={row}
                    onToggle={(input) => setPref.mutate(input)}
                    disabled={setPref.isPending}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </PageChrome>
  );
}
