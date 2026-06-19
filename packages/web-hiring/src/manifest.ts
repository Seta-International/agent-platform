import { type AppManifest, noNavExtensions } from '@seta/module-sdk';
import { Box } from 'lucide-react';

export const hiringAppManifest: AppManifest = {
  id: 'hiring',
  routeNamespace: '/hiring',
  label: 'Hiring',
  icon: Box,
  color: '#6e79d6',
  requiredPermissions: [],
  useNavExtensions: noNavExtensions,
  nav: [
    {
      label: 'Hiring',
      items: [{ id: 'hiring.home', icon: Box, label: 'Hiring', to: '/hiring' }],
    },
  ],
};
