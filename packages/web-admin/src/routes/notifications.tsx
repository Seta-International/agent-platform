import { createFileRoute } from '@tanstack/react-router';
import { AdminNotificationPrefs } from '../notifications/pages/AdminNotificationPrefs.tsx';

export const Route = createFileRoute('/_authed/admin/notifications')({
  component: AdminNotificationPrefs,
});
