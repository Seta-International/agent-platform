import type { Meta, StoryObj } from '@storybook/react-vite';

import { Avatar, AvatarFallback } from '../primitives/avatar';
import { AppShell } from './app-shell';
import type { ShellNavModule } from './left-nav';

const NAV_MODULES: ShellNavModule[] = [
  {
    id: 'copilot',
    label: 'Copilot',
    icon: 'sparkles',
    items: [
      { id: 'copilot.chat', icon: 'inbox', label: 'Chat', href: '/copilot/chat' },
      {
        id: 'copilot.workflows',
        icon: 'workflow',
        label: 'Workflows',
        href: '/copilot/workflows',
        badge: '12',
      },
    ],
  },
  {
    id: 'planner',
    label: 'Planner',
    icon: 'board',
    items: [
      { id: 'planner.groups', icon: 'users', label: 'Groups', href: '/planner/groups' },
      { id: 'planner.plan.q3', label: 'Q3 Launch', href: '/planner/q3', indent: 1 },
      {
        id: 'planner.plan.rel',
        label: 'Platform reliability',
        href: '/planner/rel',
        indent: 1,
      },
      { id: 'planner.search', icon: 'search', label: 'Search', href: '/planner/search' },
      { id: 'planner.trash', icon: 'archive', label: 'Trash', href: '/planner/trash' },
    ],
  },
  {
    id: 'integrations',
    label: 'Integrations',
    icon: 'link',
    items: [
      {
        id: 'integrations.bindings',
        icon: 'link',
        label: 'Bindings',
        href: '/integrations/bindings',
      },
      {
        id: 'integrations.conflicts',
        icon: 'alert',
        label: 'Conflicts',
        href: '/integrations/conflicts',
        badge: '2',
        badgeTone: 'warning',
      },
      {
        id: 'integrations.health',
        icon: 'shield',
        label: 'Health',
        href: '/integrations/health',
      },
    ],
  },
  {
    id: 'admin',
    label: 'Admin',
    icon: 'building',
    items: [
      { id: 'admin.users', icon: 'users', label: 'Users', href: '/admin/users' },
      {
        id: 'admin.projects',
        icon: 'star',
        label: 'Projects',
        href: '/admin/projects',
        badge: '8',
      },
      { id: 'admin.idp', icon: 'shield', label: 'IdP mappings', href: '/admin/idp' },
      { id: 'admin.audit', icon: 'inbox', label: 'Audit log', href: '/admin/audit' },
      { id: 'admin.settings', icon: 'cog', label: 'Tenant settings', href: '/admin/settings' },
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
