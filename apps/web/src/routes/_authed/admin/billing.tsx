import { createFileRoute } from '@tanstack/react-router';
import { BillingUsage } from '@/modules/admin/billing/pages/BillingUsage.tsx';

export const Route = createFileRoute('/_authed/admin/billing')({
  component: BillingUsage,
});
