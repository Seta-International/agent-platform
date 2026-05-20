import {
  AlertTriangle,
  Archive,
  Building2,
  ChevronLeft,
  ChevronRight,
  Hash,
  Inbox,
  LayoutDashboard,
  Link2,
  type LucideIcon,
  Search,
  Settings,
  Shield,
  Sparkles,
  Star,
  Users,
  Workflow,
} from 'lucide-react';
import * as React from 'react';

import { cn } from '../lib/cn';

export type ShellIconName =
  | 'sparkles'
  | 'board'
  | 'link'
  | 'building'
  | 'users'
  | 'cog'
  | 'inbox'
  | 'workflow'
  | 'star'
  | 'shield'
  | 'alert'
  | 'search'
  | 'archive'
  | 'hash';

export const SHELL_ICONS: Record<ShellIconName, LucideIcon> = {
  sparkles: Sparkles,
  board: LayoutDashboard,
  link: Link2,
  building: Building2,
  users: Users,
  cog: Settings,
  inbox: Inbox,
  workflow: Workflow,
  star: Star,
  shield: Shield,
  alert: AlertTriangle,
  search: Search,
  archive: Archive,
  hash: Hash,
};

export type ShellDotTone = 'primary' | 'warning' | 'danger' | 'success' | 'muted';

const DOT_CLASS: Record<ShellDotTone, string> = {
  primary: 'bg-primary',
  warning: 'bg-semantic-warning',
  danger: 'bg-destructive',
  success: 'bg-semantic-success',
  muted: 'bg-ink-subtle',
};

export interface ShellNavItem {
  id: string;
  label: string;
  icon?: ShellIconName;
  href?: string;
  disabled?: boolean;
  disabledHint?: string;
  badge?: string | number;
  badgeTone?: ShellDotTone;
  indent?: number;
}

export interface ShellNavModule {
  id: string;
  label: string;
  icon: ShellIconName;
  items: ShellNavItem[];
}

export interface ShellLinkProps {
  href: string;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
  title?: string;
  'aria-current'?: 'page' | undefined;
}
export type ShellLinkComponent = React.ComponentType<ShellLinkProps>;

const DefaultShellLink: ShellLinkComponent = ({ href, className, style, children, ...rest }) => (
  <a href={href} className={className} style={style} {...rest}>
    {children}
  </a>
);

export interface LeftNavProps {
  modules: ShellNavModule[];
  activeItemId?: string;
  linkComponent?: ShellLinkComponent;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  hideCollapse?: boolean;
  sessionFooter?: React.ReactNode;
  className?: string;
}

function moduleIdOfItem(modules: ShellNavModule[], itemId: string | undefined): string | null {
  if (!itemId) return null;
  for (const m of modules) {
    if (m.items.some((i) => i.id === itemId)) return m.id;
    if (itemId.startsWith(`${m.id}.`)) return m.id;
  }
  return null;
}

export function LeftNav({
  modules,
  activeItemId,
  linkComponent,
  collapsed: collapsedProp,
  onCollapsedChange,
  hideCollapse = false,
  sessionFooter,
  className,
}: LeftNavProps) {
  const Link = linkComponent ?? DefaultShellLink;

  const [collapsedInternal, setCollapsedInternal] = React.useState(collapsedProp ?? false);
  const collapsed = collapsedProp ?? collapsedInternal;
  const setCollapsed = (next: boolean) => {
    if (collapsedProp === undefined) setCollapsedInternal(next);
    onCollapsedChange?.(next);
  };

  const activeModuleId = moduleIdOfItem(modules, activeItemId);
  const [openModuleId, setOpenModuleId] = React.useState<string | null>(
    activeModuleId ?? modules[0]?.id ?? null,
  );

  React.useEffect(() => {
    if (activeModuleId) setOpenModuleId(activeModuleId);
  }, [activeModuleId]);

  if (collapsed) {
    return (
      <nav
        aria-label="Primary"
        className={cn(
          'flex h-full w-14 flex-none flex-col border-r border-hairline bg-surface-1',
          className,
        )}
      >
        <div className="flex h-[52px] items-center justify-center">
          <button
            type="button"
            onClick={() => setCollapsed(false)}
            title="Expand sidebar"
            aria-label="Expand sidebar"
            className="inline-flex size-8 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-focus"
          >
            <LayoutDashboard className="size-4" aria-hidden />
          </button>
        </div>
        <div className="mx-2 h-px bg-hairline" aria-hidden />
        <div className="flex flex-col gap-1 py-3">
          {modules.map((m) => {
            const Icon = SHELL_ICONS[m.icon];
            const isActive = openModuleId === m.id || activeModuleId === m.id;
            return (
              <button
                key={m.id}
                type="button"
                title={m.label}
                aria-label={m.label}
                aria-current={isActive ? 'page' : undefined}
                onClick={() => {
                  setOpenModuleId(m.id);
                  setCollapsed(false);
                }}
                className={cn(
                  'relative mx-auto inline-flex size-10 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-focus',
                  isActive
                    ? 'bg-primary-tint text-primary'
                    : 'text-ink-muted hover:bg-surface-2 hover:text-ink',
                )}
              >
                <Icon className="size-4" aria-hidden />
                {isActive && (
                  <span
                    className="absolute -left-2 top-2 bottom-2 w-0.5 rounded bg-primary"
                    aria-hidden
                  />
                )}
              </button>
            );
          })}
        </div>
        <div className="flex-1" />
        {sessionFooter && (
          <div className="flex h-14 items-center justify-center border-t border-hairline">
            {sessionFooter}
          </div>
        )}
      </nav>
    );
  }

  return (
    <nav
      aria-label="Primary"
      className={cn(
        'flex h-full w-60 flex-none flex-col overflow-hidden border-r border-hairline bg-surface-1',
        className,
      )}
    >
      <div className="flex h-10 flex-none items-center justify-between border-b border-hairline pl-3.5 pr-2">
        <span className="text-eyebrow uppercase text-ink-subtle">Workspace</span>
        {!hideCollapse && (
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            title="Collapse sidebar"
            aria-label="Collapse sidebar"
            className="inline-flex size-6 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-focus"
          >
            <ChevronLeft className="size-3.5" aria-hidden />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto py-1.5">
        {modules.map((m) => {
          const ModuleIcon = SHELL_ICONS[m.icon];
          const isOpen = openModuleId === m.id;
          const moduleActive = activeModuleId === m.id;
          return (
            <div key={m.id} className="mb-0.5">
              <button
                type="button"
                onClick={() => setOpenModuleId(isOpen ? null : m.id)}
                aria-expanded={isOpen}
                aria-controls={`shell-nav-module-${m.id}`}
                className="mx-1.5 flex h-[30px] w-[calc(100%-12px)] items-center gap-2 rounded-sm px-2 text-left text-body-sm font-semibold text-ink transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-focus"
              >
                <ChevronRight
                  className={cn(
                    'size-3 text-ink-subtle transition-transform duration-100',
                    isOpen && 'rotate-90',
                  )}
                  aria-hidden
                />
                <ModuleIcon
                  className={cn('size-3.5', moduleActive ? 'text-primary' : 'text-ink-muted')}
                  aria-hidden
                />
                <span className={cn('flex-1', moduleActive ? 'text-ink' : 'text-ink-muted')}>
                  {m.label}
                </span>
                {!isOpen && moduleActive && (
                  <span className="inline-block size-1.5 rounded-full bg-primary" aria-hidden />
                )}
              </button>

              {isOpen && (
                <div id={`shell-nav-module-${m.id}`} className="pb-1.5 pt-0.5">
                  {m.items.map((item) => (
                    <NavItem
                      key={item.id}
                      item={item}
                      active={activeItemId === item.id}
                      Link={Link}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {sessionFooter && (
        <div className="flex-none border-t border-hairline p-2.5">{sessionFooter}</div>
      )}
    </nav>
  );
}

interface NavItemProps {
  item: ShellNavItem;
  active: boolean;
  Link: ShellLinkComponent;
}

function NavItem({ item, active, Link }: NavItemProps) {
  const Icon = item.icon ? SHELL_ICONS[item.icon] : null;
  const indent = item.indent ?? 0;

  const inner = (
    <>
      {active && (
        <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded bg-primary" aria-hidden />
      )}
      {Icon && (
        <Icon className={cn('size-3.5', active ? 'text-ink' : 'text-ink-muted')} aria-hidden />
      )}
      <span className="flex-1 truncate">{item.label}</span>
      {item.badgeTone && (
        <span
          className={cn('inline-block size-1.5 rounded-full', DOT_CLASS[item.badgeTone])}
          aria-hidden
        />
      )}
      {item.badge != null && <span className="text-eyebrow text-ink-subtle">{item.badge}</span>}
    </>
  );

  const baseClass = cn(
    'group relative mx-1.5 mb-px flex h-7 items-center gap-2 rounded-sm text-body-sm',
    active
      ? 'bg-surface-3 font-medium text-ink'
      : 'text-ink-muted hover:bg-surface-2 hover:text-ink',
    item.disabled && 'cursor-not-allowed opacity-55 hover:bg-transparent hover:text-ink-muted',
  );

  const style: React.CSSProperties = { paddingLeft: 28 + indent * 14, paddingRight: 10 };

  if (item.disabled || !item.href) {
    return (
      <span
        className={baseClass}
        style={style}
        title={item.disabled ? (item.disabledHint ?? 'Coming soon') : undefined}
        aria-disabled={item.disabled || undefined}
      >
        {inner}
      </span>
    );
  }

  return (
    <Link
      href={item.href}
      className={baseClass}
      style={style}
      aria-current={active ? 'page' : undefined}
    >
      {inner}
    </Link>
  );
}
