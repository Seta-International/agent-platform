import { type AppManifest, noNavExtensions } from '@seta/module-sdk';
import {
  BadgeCheck,
  BarChart3,
  HeartPulse,
  LayoutDashboard,
  LineChart,
  Network,
  UserMinus,
  UserPlus,
  Users,
} from 'lucide-react';

export const peopleAppManifest: AppManifest = {
  id: 'people',
  routeNamespace: '/people',
  label: 'People',
  icon: Users,
  color: '#0047FF',
  requiredPermissions: ['people.worker.read', 'people.performance.read'],
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
        },
        {
          id: 'people.allocation',
          icon: BarChart3,
          label: 'Resource Allocation',
          to: '/people/allocation',
          requires: ['people.worker.read'],
        },
        {
          id: 'people.performance',
          icon: LineChart,
          label: 'Performance',
          to: '/people/performance',
          // PMO/BoD hold performance.read without the directory permission.
          requires: ['people.performance.read'],
        },
        {
          id: 'people.morale',
          icon: HeartPulse,
          label: 'Morale',
          to: '/people/morale',
          // Visible to every role: Members and TLs submit here, and the read-only
          // view for everyone else lands in the follow-up manager ticket.
          requires: ['people.performance.read'],
        },
      ],
    },
    {
      label: 'Journey',
      items: [
        {
          id: 'people.onboarding',
          icon: UserPlus,
          label: 'Onboarding',
          to: '/people/onboarding',
          requires: ['people.worker.read'],
          badge: 'Soon',
        },
        {
          id: 'people.probation',
          icon: BadgeCheck,
          label: 'Probation',
          to: '/people/probation',
          requires: ['people.worker.read'],
          badge: 'Soon',
        },
        {
          id: 'people.offboarding',
          icon: UserMinus,
          label: 'Offboarding',
          to: '/people/offboarding',
          requires: ['people.worker.read'],
          badge: 'Soon',
        },
      ],
    },
  ],
};
