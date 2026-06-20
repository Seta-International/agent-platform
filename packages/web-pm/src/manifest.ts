import { type AppManifest, noNavExtensions } from '@seta/module-sdk';
import { Box } from 'lucide-react';

export const pmAppManifest: AppManifest = {
  id: 'pm',
  routeNamespace: '/pm',
  label: 'Pm',
  icon: Box,
  color: '#6e79d6',
  requiredPermissions: [],
  useNavExtensions: noNavExtensions,
  nav: [
    {
      label: 'Pm',
      items: [{ id: 'pm.home', icon: Box, label: 'Pm', to: '/pm' }],
    },
  ],
};
