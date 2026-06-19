import { type NavManifest, noNavExtensions } from '@seta/module-sdk';
import { BarChart2, LayoutDashboard, TrendingUp } from 'lucide-react';

export const ariaNavManifest: NavManifest = {
  id: 'performance',
  label: 'ARIA',
  icon: BarChart2,
  requiredPermissions: ['performance.dashboard.read'],
  useNavExtensions: noNavExtensions,
  nav: [
    {
      label: 'Dashboards',
      items: [
        {
          id: 'aria.overview',
          icon: LayoutDashboard,
          label: 'My Overview',
          to: '/aria/overview',
          requires: ['performance.dashboard.read'],
        },
        {
          id: 'aria.team',
          icon: TrendingUp,
          label: 'Team',
          to: '/aria/team',
          requires: ['performance.dashboard.team.read'],
        },
        {
          id: 'aria.executive',
          icon: BarChart2,
          label: 'Executive',
          to: '/aria/executive',
          requires: ['performance.dashboard.executive.read'],
        },
      ],
    },
  ],
};
