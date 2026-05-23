import { type NavManifest, noNavExtensions } from '@seta/module-sdk';
import { Bell, FileClock, Mail, Settings, Shield, Sliders, Users } from 'lucide-react';

export const consoleNavManifest: NavManifest = {
  id: 'console',
  label: 'Admin',
  icon: Settings,
  requiredPermissions: ['org.admin', 'identity.admin'],
  useNavExtensions: noNavExtensions,
  nav: [
    { id: 'console.users', icon: Users, label: 'Users', to: '/admin/users' },
    { id: 'console.sso', icon: Shield, label: 'SSO', to: '/admin/sso' },
    { id: 'console.audit', icon: FileClock, label: 'Audit', to: '/admin/audit' },
    { id: 'console.mail-transport', icon: Mail, label: 'Mail transport', to: '/admin/mail' },
    {
      id: 'console.notifications',
      icon: Bell,
      label: 'Notifications',
      to: '/admin/notifications',
    },
    { id: 'console.tenant', icon: Sliders, label: 'Tenant settings', to: '/admin/tenant' },
  ],
};
