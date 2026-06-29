import type { SessionScopeProjection } from '@seta/web-identity';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { SettingsPage } from '../../pages/settings-page.tsx';

export const Route = createFileRoute('/_authed/hiring/settings/')({
  beforeLoad: ({ context }) => {
    const session = (context as { session?: SessionScopeProjection }).session;
    const perms = new Set(session?.permissions ?? []);
    if (!perms.has('hiring.jd_template.read')) throw redirect({ to: '/403' });
  },
  component: SettingsPage,
});
