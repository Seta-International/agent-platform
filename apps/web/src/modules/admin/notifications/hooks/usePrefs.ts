import {
  type NotificationPrefsResponse,
  notificationKeys,
  notificationsClient,
  type PatchPrefInput,
} from '@seta/web-notifications';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export function useNotificationPrefs() {
  return useQuery({
    queryKey: notificationKeys.prefs(),
    queryFn: () => notificationsClient.listPrefs(),
  });
}

export function useSetNotificationPref() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: PatchPrefInput) => notificationsClient.setPref(input),
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: notificationKeys.prefs() });
      const prev = qc.getQueryData<NotificationPrefsResponse>(notificationKeys.prefs());
      if (prev) {
        qc.setQueryData<NotificationPrefsResponse>(notificationKeys.prefs(), {
          rows: prev.rows.map((r) =>
            r.event_type === input.event_type
              ? {
                  ...r,
                  [input.channel === 'in_app' ? 'in_app_enabled' : 'email_enabled']: input.enabled,
                }
              : r,
          ),
        });
      }
      return { prev };
    },
    onError: (_err, _input, ctx) => {
      if (ctx?.prev) qc.setQueryData(notificationKeys.prefs(), ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: notificationKeys.prefs() });
    },
  });
}
