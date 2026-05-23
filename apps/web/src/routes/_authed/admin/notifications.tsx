import { createFileRoute } from '@tanstack/react-router';
import { AdminNotificationPrefs } from '@/modules/console/notifications/pages/AdminNotificationPrefs.tsx';

export const Route = createFileRoute('/_authed/admin/notifications')({
  component: AdminNotificationPrefs,
});
