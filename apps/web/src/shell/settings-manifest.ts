import { type AppManifest, noNavExtensions } from '@seta/module-sdk';
import { Award, Bell, CalendarClock, KeyRound, Settings, Shield, User } from 'lucide-react';

// Suite-level "Settings" context: global account pages owned by no feature app.
// Reached from the account menu (hideInLauncher), it drives the shell chrome so
// /settings/* reads "Seta › Settings" with its own left nav instead of hijacking
// whichever app happens to be first in the registry.
export const settingsAppManifest: AppManifest = {
  id: 'settings',
  routeNamespace: '/settings',
  label: 'Settings',
  icon: Settings,
  requiredPermissions: [],
  hideInLauncher: true,
  useNavExtensions: noNavExtensions,
  nav: [
    {
      label: 'Account',
      items: [
        { id: 'settings.profile', icon: User, label: 'Profile', to: '/settings/profile' },
        { id: 'settings.roles', icon: KeyRound, label: 'Roles', to: '/settings/roles' },
        { id: 'settings.skills', icon: Award, label: 'Skills', to: '/settings/skills' },
        {
          id: 'settings.availability',
          icon: CalendarClock,
          label: 'Availability',
          to: '/settings/availability',
        },
        { id: 'settings.security', icon: Shield, label: 'Security', to: '/settings/security' },
        {
          id: 'settings.notifications',
          icon: Bell,
          label: 'Notifications',
          to: '/settings/notifications',
        },
      ],
    },
  ],
};
