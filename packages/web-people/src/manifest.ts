import { type AppManifest, noNavExtensions } from '@seta/module-sdk';
import { Box } from 'lucide-react';

export const peopleAppManifest: AppManifest = {
  id: 'people',
  routeNamespace: '/people',
  label: 'People',
  icon: Box,
  color: '#6e79d6',
  requiredPermissions: [],
  useNavExtensions: noNavExtensions,
  nav: [
    {
      label: 'People',
      items: [{ id: 'people.home', icon: Box, label: 'People', to: '/people' }],
    },
  ],
};
