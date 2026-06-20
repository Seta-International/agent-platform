import { type AppManifest, noNavExtensions } from '@seta/module-sdk';
import { FolderKanban } from 'lucide-react';

export const pmAppManifest: AppManifest = {
  id: 'pm',
  routeNamespace: '/pm',
  label: 'Project Management',
  icon: FolderKanban,
  color: '#0047FF',
  requiredPermissions: ['pm.account.read'],
  useNavExtensions: noNavExtensions,
  nav: [
    {
      label: 'Project Management',
      items: [
        {
          id: 'pm.portfolio',
          icon: FolderKanban,
          label: 'Portfolio',
          to: '/pm',
          requires: ['pm.account.read'],
        },
        {
          id: 'pm.accounts',
          icon: FolderKanban,
          label: 'Accounts',
          to: '/pm/accounts',
          requires: ['pm.account.read'],
        },
      ],
    },
  ],
};
