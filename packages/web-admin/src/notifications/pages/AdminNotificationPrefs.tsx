import { Banner, SettingsSection, Skeleton } from '@seta/shared-ui';
import { AdminPageFrame } from '../../components/AdminPageFrame';
import { NotificationPrefRow } from '../components/NotificationPrefRow';
import { useNotificationPrefs, useSetNotificationPref } from '../hooks/usePrefs';

export function AdminNotificationPrefs() {
  const { data, isLoading, error } = useNotificationPrefs();
  const setPref = useSetNotificationPref();

  return (
    <AdminPageFrame
      crumb="Notifications"
      title="Notifications"
      subtitle="Choose what your team gets notified about, and where."
    >
      {error && (
        <Banner
          status="error"
          title={<>Couldn&apos;t load notification settings: {(error as Error).message}</>}
        />
      )}
      {isLoading || !data ? (
        <Skeleton height={288} radius={3} />
      ) : (
        <SettingsSection title="Events" description="Pick how each event reaches your team.">
          {data.rows.map((row) => (
            <NotificationPrefRow
              key={row.event_type}
              row={row}
              onToggle={(input) => setPref.mutate(input)}
              disabled={setPref.isPending}
            />
          ))}
        </SettingsSection>
      )}
    </AdminPageFrame>
  );
}
