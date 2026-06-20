import { type AppManifest, noNavExtensions } from '@seta/module-sdk';
import { Briefcase, Settings } from 'lucide-react';

export const hiringAppManifest: AppManifest = {
  id: 'hiring',
  routeNamespace: '/hiring',
  label: 'Hiring',
  icon: Briefcase,
  color: '#0047FF',
  requiredPermissions: ['hiring.requisition.read'],
  useNavExtensions: noNavExtensions,
  nav: [
    {
      label: 'Hiring',
      items: [
        {
          id: 'hiring.requisitions',
          icon: Briefcase,
          label: 'Requisitions',
          to: '/hiring/requisitions',
          requires: ['hiring.requisition.read'],
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
