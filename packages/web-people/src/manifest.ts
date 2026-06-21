import { type AppManifest, noNavExtensions } from '@seta/module-sdk';
import { BarChart3, LayoutDashboard, LineChart, Network, Users } from 'lucide-react';

export const peopleAppManifest: AppManifest = {
  id: 'people',
  routeNamespace: '/people',
  label: 'People',
  icon: Users,
  color: '#0047FF',
  requiredPermissions: ['people.worker.read'],
  useNavExtensions: noNavExtensions,
  nav: [
    {
      label: 'People',
      items: [
        {
          id: 'people.dashboard',
          icon: LayoutDashboard,
          label: 'Dashboard',
          to: '/people',
          requires: ['people.worker.read'],
          badge: 'Soon',
        },
        {
          id: 'people.employees',
          icon: Users,
          label: 'Employees',
          to: '/people/employees',
          requires: ['people.worker.read'],
        },
        {
          id: 'people.org',
          icon: Network,
          label: 'Org Chart',
          to: '/people/org',
          requires: ['people.worker.read'],
          badge: 'Soon',
        },
        {
          id: 'people.allocation',
          icon: BarChart3,
          label: 'Resource Allocation',
          to: '/people/allocation',
          requires: ['people.worker.read'],
          badge: 'Soon',
        },
        {
          id: 'people.performance',
          icon: LineChart,
          label: 'Performance',
          to: '/people/performance',
          requires: ['people.worker.read'],
          badge: 'Soon',
        },
      ],
    },
  ],
};
