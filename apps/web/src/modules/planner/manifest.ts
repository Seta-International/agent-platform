import type { NavItem, NavManifest } from '@seta/module-sdk';
import { Archive, ClipboardList, Inbox, Search, Users } from 'lucide-react';
import { useSession } from '@/modules/identity/components/SessionProvider.tsx';
import { useRecentPlans } from './hooks/use-recent-plans.ts';

function useRecentPlanNavItems(): NavItem[] {
  const session = useSession();
  const { recents } = useRecentPlans(session.tenant_id);
  return recents.map((r) => ({
    id: `planner.recent.${r.planId}`,
    label: r.planName,
    to: `/planner/plans/${r.planId}`,
    indent: 1,
  }));
}

export const plannerNavManifest: NavManifest = {
  id: 'planner',
  label: 'Planner',
  icon: ClipboardList,
  requiredPermissions: [],
  nav: [
    { id: 'planner.my-tasks', icon: Inbox, label: 'My tasks', to: '/planner/my-tasks' },
    { id: 'planner.groups', icon: Users, label: 'Groups', to: '/planner/groups' },
    {
      id: 'planner.search',
      icon: Search,
      label: 'Search',
      disabled: true,
      disabledHint: 'Task search ships with B5',
    },
    { id: 'planner.trash', icon: Archive, label: 'Trash', to: '/planner/trash' },
  ],
  useNavExtensions: useRecentPlanNavItems,
};
