import { type AppManifest, noNavExtensions } from '@seta/module-sdk';
import { Briefcase } from 'lucide-react';

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
          label: 'Open Roles',
          to: '/hiring',
          requires: ['hiring.requisition.read'],
        },
      ],
    },
  ],
};
