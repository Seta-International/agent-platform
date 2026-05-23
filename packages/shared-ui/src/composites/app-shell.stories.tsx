import { type NavManifest, noNavExtensions } from '@seta/module-sdk';
import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  AlertTriangle,
  Archive,
  Building2,
  Inbox,
  LayoutDashboard,
  Link2,
  Search,
  Settings,
  Shield,
  Sparkles,
  Star,
  Users,
  Workflow,
} from 'lucide-react';

import { Avatar, AvatarFallback } from '../primitives/avatar';
import { AppShell } from './app-shell';

const NAV_MODULES: NavManifest[] = [
  {
    id: 'copilot',
    label: 'Copilot',
    icon: Sparkles,
    requiredPermissions: [],
    useNavExtensions: noNavExtensions,
    nav: [
      { id: 'copilot.chat', icon: Inbox, label: 'Chat', to: '/copilot/chat' },
      {
        id: 'copilot.workflows',
        icon: Workflow,
        label: 'Workflows',
        to: '/copilot/workflows',
        badge: '12',
      },
    ],
  },
  {
    id: 'planner',
    label: 'Planner',
    icon: LayoutDashboard,
    requiredPermissions: [],
    useNavExtensions: noNavExtensions,
    nav: [
      { id: 'planner.groups', icon: Users, label: 'Groups', to: '/planner/groups' },
      { id: 'planner.plan.q3', label: 'Q3 Launch', to: '/planner/q3', indent: 1 },
      { id: 'planner.plan.rel', label: 'Platform reliability', to: '/planner/rel', indent: 1 },
      { id: 'planner.search', icon: Search, label: 'Search', to: '/planner/search' },
      { id: 'planner.trash', icon: Archive, label: 'Trash', to: '/planner/trash' },
    ],
  },
  {
    id: 'integrations',
    label: 'Integrations',
    icon: Link2,
    requiredPermissions: [],
    useNavExtensions: noNavExtensions,
    nav: [
      { id: 'integrations.bindings', icon: Link2, label: 'Bindings', to: '/integrations/bindings' },
      {
        id: 'integrations.conflicts',
        icon: AlertTriangle,
        label: 'Conflicts',
        to: '/integrations/conflicts',
        badge: '2',
        badgeTone: 'warning',
      },
      { id: 'integrations.health', icon: Shield, label: 'Health', to: '/integrations/health' },
    ],
  },
  {
    id: 'admin',
    label: 'Admin',
    icon: Building2,
    requiredPermissions: [],
    useNavExtensions: noNavExtensions,
    nav: [
      { id: 'admin.users', icon: Users, label: 'Users', to: '/admin/users' },
      { id: 'admin.projects', icon: Star, label: 'Projects', to: '/admin/projects', badge: '8' },
      { id: 'admin.idp', icon: Shield, label: 'IdP mappings', to: '/admin/idp' },
      { id: 'admin.audit', icon: Inbox, label: 'Audit log', to: '/admin/audit' },
      { id: 'admin.settings', icon: Settings, label: 'Tenant settings', to: '/admin/settings' },
    ],
  },
];

function SessionFooter() {
  return (
    <div className="flex items-center gap-2">
      <Avatar className="size-6">
        <AvatarFallback className="text-eyebrow font-semibold">JD</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="truncate text-caption font-medium text-ink">Jane Doe</div>
        <div className="truncate text-eyebrow text-ink-subtle">org.admin</div>
      </div>
    </div>
  );
}

function UserMenuDemo() {
  return (
    <Avatar className="size-6">
      <AvatarFallback className="text-eyebrow font-semibold">JD</AvatarFallback>
    </Avatar>
  );
}

const meta: Meta<typeof AppShell> = {
  title: 'Composites/AppShell',
  component: AppShell,
};

export default meta;

type Story = StoryObj<typeof AppShell>;

export const Default: Story = {
  args: {
    workspace: 'Acme · Engineering',
    modules: NAV_MODULES,
    activeItemId: 'admin.audit',
    userMenu: <UserMenuDemo />,
    sessionFooter: <SessionFooter />,
    children: (
      <div className="p-6">
        <h1 className="text-card-title font-semibold text-ink">Audit log</h1>
        <p className="mt-2 text-body-sm text-ink-muted">
          Page content goes here. The shell wires up the topbar, sidebar accordion, copilot toggle,
          and resizable copilot panel.
        </p>
      </div>
    ),
  },
};

export const PlannerActive: Story = {
  args: {
    ...Default.args,
    activeItemId: 'planner.plan.q3',
  },
};

export const CopilotOpen: Story = {
  args: {
    ...Default.args,
    defaultCopilotOpen: true,
    copilotAlert: true,
  },
};

export const SidebarCollapsed: Story = {
  args: {
    ...Default.args,
    defaultSidebarCollapsed: true,
  },
};
