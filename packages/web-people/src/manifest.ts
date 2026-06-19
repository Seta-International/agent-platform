import { type AppManifest, noNavExtensions } from '@seta/module-sdk';
import { Users } from 'lucide-react';

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
          id: 'people.directory',
          icon: Users,
          label: 'Directory',
          to: '/people',
          requires: ['people.worker.read'],
        },
      ],
    },
  ],
};
