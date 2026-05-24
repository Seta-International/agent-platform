import type { NavManifest, NavSection } from '@seta/module-sdk';
import { Archive, ClipboardList, Inbox, Search, Users } from 'lucide-react';
import { useSession } from '@/modules/identity/components/SessionProvider.tsx';
import { useRecentPlans } from './hooks/use-recent-plans.ts';

function useRecentPlanSections(): NavSection[] {
  const session = useSession();
  const { recents } = useRecentPlans(session.tenant_id);
  if (recents.length === 0) return [];
  return [
    {
      label: 'Recent',
      items: recents.map((r) => ({
        id: `planner.recent.${r.planId}`,
        label: r.planName,
        to: `/planner/plans/${r.planId}`,
      })),
    },
  ];
}

export const plannerNavManifest: NavManifest = {
  id: 'planner',
  label: 'Planner',
  icon: ClipboardList,
  requiredPermissions: [],
  nav: [
    {
      label: 'Work',
      items: [
        { id: 'planner.my-tasks', icon: Inbox, label: 'My tasks', to: '/planner/my-tasks' },
        { id: 'planner.groups', icon: Users, label: 'Groups', to: '/planner/groups' },
      ],
    },
    {
      label: 'Utility',
      items: [
        {
          id: 'planner.search',
          icon: Search,
          label: 'Search',
          disabled: true,
          disabledHint: 'Search is coming soon',
        },
        { id: 'planner.trash', icon: Archive, label: 'Trash', to: '/planner/trash' },
      ],
    },
  ],
  useNavExtensions: useRecentPlanSections,
};
