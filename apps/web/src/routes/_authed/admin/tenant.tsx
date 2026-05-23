import { createFileRoute } from '@tanstack/react-router';
import { TenantSettings } from '@/modules/console/tenant-settings/pages/TenantSettings.tsx';

export const Route = createFileRoute('/_authed/admin/tenant')({
  component: TenantSettings,
});
