import {
  Banner,
  BreadcrumbItem,
  Breadcrumbs,
  HStack,
  Layout,
  LayoutContent,
  LayoutHeader,
  Skeleton,
  Text,
  VStack,
} from '@seta/shared-ui';
import { NotificationPrefRow } from '../components/NotificationPrefRow';
import { useNotificationPrefs, useSetNotificationPref } from '../hooks/usePrefs';

export function AdminNotificationPrefs() {
  const { data, isLoading, error } = useNotificationPrefs();
  const setPref = useSetNotificationPref();

  return (
    <Layout
      height="fill"
      header={
        <LayoutHeader hasDivider padding={4}>
          <VStack gap={1}>
            <Breadcrumbs variant="supporting">
              <BreadcrumbItem href="/admin">Admin</BreadcrumbItem>
              <BreadcrumbItem isCurrent>Notification prefs</BreadcrumbItem>
            </Breadcrumbs>
            <HStack hAlign="between" vAlign="center" gap={2}>
              <HStack gap={2} vAlign="center">
                <Text as="h1" size="lg" weight="semibold">
                  Notifications
                </Text>
                <Text color="secondary">Choose what your team gets notified about, and where.</Text>
              </HStack>
            </HStack>
          </VStack>
        </LayoutHeader>
      }
      content={
        <LayoutContent>
          <div className="page-container space-y-4">
            {error && (
              <Banner
                status="error"
                title={<>Couldn&apos;t load notification settings: {(error as Error).message}</>}
              />
            )}

            {isLoading || !data ? (
              <Skeleton height={288} radius={3} />
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
        </LayoutContent>
      }
    />
  );
}
