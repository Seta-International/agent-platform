import { createFileRoute } from '@tanstack/react-router';
import { TenantSettings } from '@/modules/admin/tenant-settings/pages/TenantSettings.tsx';

export const Route = createFileRoute('/_authed/admin/tenant')({
  component: TenantSettings,
});
