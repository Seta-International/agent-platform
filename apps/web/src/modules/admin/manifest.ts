import { type NavManifest, noNavExtensions } from '@seta/module-sdk';
import { Bell, FileClock, Mail, Settings, Shield, Sliders, Users } from 'lucide-react';

export const adminNavManifest: NavManifest = {
  id: 'admin',
  label: 'Admin',
  icon: Settings,
  requiredPermissions: ['org.admin', 'identity.admin'],
  useNavExtensions: noNavExtensions,
  nav: [
    {
      label: 'Identity & access',
      items: [
        { id: 'admin.users', icon: Users, label: 'Users', to: '/admin/users' },
        { id: 'admin.sso', icon: Shield, label: 'SSO', to: '/admin/sso' },
      ],
    },
    {
      label: 'Communication',
      items: [
        { id: 'admin.mail-transport', icon: Mail, label: 'Mail transport', to: '/admin/mail' },
        {
          id: 'admin.notifications',
          icon: Bell,
          label: 'Notifications',
          to: '/admin/notifications',
        },
      ],
    },
    {
      label: 'Workspace',
      items: [
        { id: 'admin.tenant', icon: Sliders, label: 'Organization', to: '/admin/tenant' },
        { id: 'admin.audit', icon: FileClock, label: 'Audit log', to: '/admin/audit' },
      ],
    },
  ],
};
