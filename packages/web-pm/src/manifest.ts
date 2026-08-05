import { type AppManifest, noNavExtensions } from '@seta/module-sdk';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Building2,
  CalendarDays,
  FileText,
  FolderKanban,
} from 'lucide-react';

export const pmAppManifest: AppManifest = {
  id: 'pm',
  routeNamespace: '/pm',
  label: 'Project Monitoring',
  icon: FolderKanban,
  color: '#0047FF',
  requiredPermissions: ['pm.account.read'],
  useNavExtensions: noNavExtensions,
  nav: [
    {
      items: [
        {
          id: 'pm.portfolio',
          icon: FolderKanban,
          label: 'Portfolio',
          to: '/pm',
          requires: ['pm.account.read'],
        },
        {
          id: 'pm.requests',
          icon: FileText,
          label: 'Requests',
          to: '/pm/requests',
          requires: ['pm.charter.read'],
        },
        {
          id: 'pm.weekly',
          icon: CalendarDays,
          label: 'Weekly Reports',
          to: '/pm/weekly',
          requires: ['pm.account.read'],
          badge: 'Soon',
        },
        {
          id: 'pm.resourcing',
          icon: Activity,
          label: 'RA Monitoring',
          to: '/pm/resourcing',
          requires: ['pm.account.read'],
        },
        {
          id: 'pm.risks',
          icon: AlertTriangle,
          label: 'Risks & Issues',
          to: '/pm/risks',
          requires: ['pm.account.read'],
          badge: 'Soon',
        },
        {
          id: 'pm.metrics',
          icon: BarChart3,
          label: 'KPI Metrics',
          to: '/pm/metrics',
          requires: ['pm.project.read'],
        },
        {
          id: 'pm.accounts',
          icon: Building2,
          label: 'Accounts',
          to: '/pm/accounts',
          requires: ['pm.account.read'],
        },
        {
          id: 'pm.projects',
          icon: FolderKanban,
          label: 'Projects',
          to: '/pm/projects',
          requires: ['pm.project.read'],
        },
      ],
    },
  ],
};
