import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  useNotificationPrefs,
  useSetNotificationPref,
} from '../../../../../../src/modules/admin/notifications/hooks/usePrefs.ts';
import type { NotificationPrefsResponse } from '../../../../../../src/modules/notifications/api/client.ts';
import { notificationKeys } from '../../../../../../src/modules/notifications/state/query-keys.ts';

const initialMatrix: NotificationPrefsResponse = {
  rows: [
    {
      event_type: 'planner.task.assigned',
      label: 'Task assigned',
      in_app_enabled: true,
      email_enabled: false,
      email_available: false,
    },
    {
      event_type: 'planner.task.completed',
      label: 'Task completed',
      in_app_enabled: true,
      email_enabled: false,
      email_available: false,
    },
  ],
};

vi.mock('../../../../../../src/modules/notifications/api/client.ts', () => ({
  notificationsClient: {
    listPrefs: vi.fn(async () => initialMatrix),
    setPref: vi.fn(async () => ({ ok: true })),
  },
}));

const wrap =
  (qc: QueryClient) =>
  ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );

describe('useNotificationPrefs', () => {
  it('fetches the matrix and exposes it via data', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useNotificationPrefs(), { wrapper: wrap(qc) });
    await waitFor(() => expect(result.current.data?.rows).toHaveLength(2));
    expect(result.current.data?.rows[0]?.event_type).toBe('planner.task.assigned');
  });
});

describe('useSetNotificationPref', () => {
  it('optimistically flips the toggle in the cache', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(notificationKeys.prefs(), initialMatrix);
    const { result } = renderHook(() => useSetNotificationPref(), { wrapper: wrap(qc) });
    await result.current.mutateAsync({
      event_type: 'planner.task.assigned',
      channel: 'in_app',
      enabled: false,
    });
    await waitFor(() => {
      const cached = qc.getQueryData<NotificationPrefsResponse>(notificationKeys.prefs());
      const row = cached?.rows.find((r) => r.event_type === 'planner.task.assigned');
      expect(row?.in_app_enabled).toBe(false);
    });
  });

  it('rolls back on error', async () => {
    const client = await import('../../../../../../src/modules/notifications/api/client.ts');
    (
      client.notificationsClient.setPref as unknown as { mockRejectedValueOnce: (e: Error) => void }
    ).mockRejectedValueOnce(new Error('boom'));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(notificationKeys.prefs(), initialMatrix);
    const { result } = renderHook(() => useSetNotificationPref(), { wrapper: wrap(qc) });
    await expect(
      result.current.mutateAsync({
        event_type: 'planner.task.assigned',
        channel: 'in_app',
        enabled: false,
      }),
    ).rejects.toThrow();
    const cached = qc.getQueryData<NotificationPrefsResponse>(notificationKeys.prefs());
    const row = cached?.rows.find((r) => r.event_type === 'planner.task.assigned');
    expect(row?.in_app_enabled).toBe(true);
  });
});
