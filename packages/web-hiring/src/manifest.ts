import { type AppManifest, noNavExtensions } from '@seta/module-sdk';
import { BarChart3, BookOpen, Briefcase, CalendarCheck, Settings, Users } from 'lucide-react';

export const hiringAppManifest: AppManifest = {
  id: 'hiring',
  routeNamespace: '/hiring',
  label: 'Hiring Management',
  icon: Briefcase,
  color: '#0047FF',
  requiredPermissions: ['hiring.requisition.read'],
  useNavExtensions: noNavExtensions,
  nav: [
    {
      label: 'Hiring Management',
      items: [
        {
          id: 'hiring.reports',
          icon: BarChart3,
          label: 'Reports',
          to: '/hiring',
          requires: ['hiring.requisition.read'],
          badge: 'Soon',
        },
        {
          id: 'hiring.requisitions',
          icon: Briefcase,
          label: 'Requisitions',
          to: '/hiring/requisitions',
          requires: ['hiring.requisition.read'],
        },
        {
          id: 'hiring.candidates',
          icon: Users,
          label: 'Candidates',
          to: '/hiring/candidates',
          requires: ['hiring.candidate.read'],
        },
        {
          id: 'hiring.interviews',
          icon: CalendarCheck,
          label: 'Interviews',
          to: '/hiring/interviews',
          requires: ['hiring.candidate.read'],
        },
        {
          id: 'hiring.knowledge',
          icon: BookOpen,
          label: 'Knowledge Base',
          to: '/hiring/knowledge',
          requires: ['hiring.requisition.read'],
          badge: 'Soon',
        },
        {
          id: 'hiring.settings',
          icon: Settings,
          label: 'Settings',
          to: '/hiring/settings',
          requires: ['hiring.jd_template.read'],
        },
      ],
    },
  ],
};
