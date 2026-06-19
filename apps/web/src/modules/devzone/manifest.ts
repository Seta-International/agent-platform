import { type NavManifest, noNavExtensions } from '@seta/module-sdk';
import { FlaskConical, LayoutGrid } from 'lucide-react';

export const devzoneNavManifest: NavManifest = {
  id: 'devzone',
  label: 'Development Zone',
  icon: FlaskConical,
  requiredPermissions: [],
  useNavExtensions: noNavExtensions,
  nav: [
    {
      label: 'Design',
      items: [
        { id: 'devzone.card-demo', icon: LayoutGrid, label: 'Card demo', to: '/devzone/card-demo' },
      ],
    },
  ],
};
