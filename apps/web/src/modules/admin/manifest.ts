import { type NavManifest, noNavExtensions } from '@seta/module-sdk';
import { Bell, FileClock, Mail, Settings, Shield, ShieldCheck, Sliders, Users } from 'lucide-react';

export const adminNavManifest: NavManifest = {
  id: 'admin',
  label: 'Admin',
  icon: Settings,
  requiredPermissions: ['identity.user.read.any'],
  useNavExtensions: noNavExtensions,
  nav: [
    {
      label: 'Identity & access',
      items: [
        {
          id: 'admin.users',
          icon: Users,
          label: 'Users',
          to: '/admin/users',
          requires: ['identity.user.read.any'],
        },
        {
          id: 'admin.sso',
          icon: Shield,
          label: 'SSO',
          to: '/admin/sso',
          requires: ['identity.sso.read'],
        },
        {
          id: 'admin.role-access',
          icon: ShieldCheck,
          label: 'Role access',
          to: '/admin/role-access',
          requires: ['identity.role.read'],
        },
      ],
    },
    {
      label: 'Communication',
      items: [
        {
          id: 'admin.mail-transport',
          icon: Mail,
          label: 'Mail transport',
          to: '/admin/mail',
          requires: ['integrations.mail.read'],
        },
        {
          id: 'admin.notifications',
          icon: Bell,
          label: 'Notifications',
          to: '/admin/notifications',
          requires: ['notifications.category.read'],
        },
      ],
    },
    {
      label: 'Workspace',
      items: [
        {
          id: 'admin.tenant',
          icon: Sliders,
          label: 'Organization',
          to: '/admin/tenant',
          requires: ['core.tenant.read'],
        },
        {
          id: 'admin.audit',
          icon: FileClock,
          label: 'Audit log',
          to: '/admin/audit',
          requires: ['core.audit.read'],
        },
      ],
    },
  ],
};
