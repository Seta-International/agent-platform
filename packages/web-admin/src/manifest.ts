import { type AppManifest, noNavExtensions } from '@seta/module-sdk';
import {
  Bell,
  BookOpen,
  FileClock,
  Mail,
  RefreshCw,
  Settings,
  Shield,
  ShieldCheck,
  Sliders,
  Users,
  UsersRound,
} from 'lucide-react';

export const adminAppManifest: AppManifest = {
  id: 'admin',
  routeNamespace: '/admin',
  label: 'Admin',
  icon: Settings,
  color: '#8a8f98',
  requiredPermissions: ['identity.user.list'],
  useNavExtensions: noNavExtensions,
  nav: [
    {
      label: 'Workspace',
      items: [
        {
          id: 'admin.tenant',
          icon: Sliders,
          label: 'General',
          to: '/admin/tenant',
          requires: ['core.tenant.read'],
        },
        {
          id: 'admin.mail-transport',
          icon: Mail,
          label: 'Mail',
          to: '/admin/mail',
          requires: ['integrations.mail.read'],
        },
        {
          id: 'admin.m365-directory',
          icon: RefreshCw,
          label: 'Directory sync',
          to: '/admin/m365-directory',
          requires: ['integrations.m365.read'],
        },
        {
          id: 'admin.notifications',
          icon: Bell,
          label: 'Notifications',
          to: '/admin/notifications',
          requires: ['notifications.category.read'],
        },
        {
          id: 'admin.skills',
          icon: BookOpen,
          label: 'Skills catalog',
          to: '/admin/skills',
          requires: ['core.skill.read'],
        },
      ],
    },
    {
      label: 'Access control',
      items: [
        {
          id: 'admin.users',
          icon: Users,
          label: 'Directory',
          to: '/admin/users',
          requires: ['identity.user.list'],
        },
        {
          id: 'admin.groups',
          icon: UsersRound,
          label: 'Groups',
          to: '/admin/groups',
          requires: ['identity.group.read'],
        },
        {
          id: 'admin.role-access',
          icon: ShieldCheck,
          label: 'Role access',
          to: '/admin/role-access',
          requires: ['identity.role.read'],
        },
        {
          id: 'admin.sso',
          icon: Shield,
          label: 'Sign-in & SSO',
          to: '/admin/sso',
          requires: ['identity.sso.read'],
        },
      ],
    },
    {
      label: 'Activity',
      items: [
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
