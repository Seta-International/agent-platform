import type { ShellNavModule } from '@seta/shared-ui';

export type RecentPlanEntry = { planId: string; planName: string };

// Extracted from route.tsx so unit tests can import it without triggering
// TanStack Router's file-route side-effects (createFileRoute, redirect, etc.).
export function buildNavModules(recents: RecentPlanEntry[]): ShellNavModule[] {
  return [
    {
      id: 'copilot',
      label: 'Copilot',
      icon: 'sparkles',
      items: [
        { id: 'copilot.chat', icon: 'inbox', label: 'Chat', href: '/copilot/chat' },
        {
          id: 'copilot.workflows',
          icon: 'workflow',
          label: 'Workflows',
          href: '/copilot/workflows',
        },
        {
          id: 'copilot.knowledge',
          icon: 'archive',
          label: 'Knowledge',
          href: '/copilot/knowledge',
        },
      ],
    },
    {
      id: 'planner',
      label: 'Planner',
      icon: 'board',
      items: [
        { id: 'planner.my-tasks', icon: 'inbox', label: 'My tasks', href: '/planner/my-tasks' },
        { id: 'planner.groups', icon: 'users', label: 'Groups', href: '/planner/groups' },
        ...recents.map((r) => ({
          id: `planner.recent.${r.planId}`,
          label: r.planName,
          href: `/planner/plans/${r.planId}`,
          indent: 1,
        })),
        {
          id: 'planner.search',
          icon: 'search' as const,
          label: 'Search',
          disabled: true,
          disabledHint: 'Task search ships with B5',
        },
        { id: 'planner.trash', icon: 'archive', label: 'Trash', href: '/planner/trash' },
      ],
    },
    {
      id: 'integrations',
      label: 'Integrations',
      icon: 'link',
      items: [
        {
          id: 'integrations.bindings',
          icon: 'link',
          label: 'Bindings',
          disabled: true,
          disabledHint: 'Integrations ship with M2 Stream B3',
        },
        {
          id: 'integrations.conflicts',
          icon: 'alert',
          label: 'Conflicts',
          disabled: true,
          disabledHint: 'Integrations ship with M2 Stream B3',
        },
        {
          id: 'integrations.health',
          icon: 'shield',
          label: 'Health',
          disabled: true,
          disabledHint: 'Integrations ship with M2 Stream B3',
        },
      ],
    },
    {
      id: 'admin',
      label: 'Admin',
      icon: 'building',
      items: [
        { id: 'admin.users', icon: 'users', label: 'Users', href: '/admin/users' },
        { id: 'admin.sso', icon: 'shield', label: 'SSO', href: '/admin/sso' },
        {
          id: 'admin.notifications',
          icon: 'bell',
          label: 'Notifications',
          href: '/admin/notifications',
        },
        { id: 'admin.audit', icon: 'inbox', label: 'Audit log', href: '/admin/audit' },
      ],
    },
  ];
}

export function activeNavId(pathname: string): string | undefined {
  if (pathname.startsWith('/copilot/knowledge')) return 'copilot.knowledge';
  if (pathname.startsWith('/copilot/chat')) return 'copilot.chat';
  if (pathname.startsWith('/planner/my-tasks')) return 'planner.my-tasks';
  if (pathname.startsWith('/planner/groups')) return 'planner.groups';
  if (pathname.startsWith('/planner/plans/')) {
    const planId = pathname.slice('/planner/plans/'.length).split('/')[0];
    if (planId) return `planner.recent.${planId}`;
  }
  if (pathname.startsWith('/planner/trash')) return 'planner.trash';
  if (pathname.startsWith('/admin/users')) return 'admin.users';
  if (pathname.startsWith('/admin/sso')) return 'admin.sso';
  if (pathname.startsWith('/admin/notifications')) return 'admin.notifications';
  if (pathname.startsWith('/admin/audit')) return 'admin.audit';
  return undefined;
}
