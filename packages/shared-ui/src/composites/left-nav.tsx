import type { NavBadgeTone, NavItem, NavManifest, NavSection } from '@seta/module-sdk';
import { ChevronLeft, ChevronRight, LayoutDashboard } from 'lucide-react';
import * as React from 'react';

import { cn } from '../lib/cn';

const DOT_CLASS: Record<NavBadgeTone, string> = {
  primary: 'bg-primary',
  warning: 'bg-semantic-warning',
  danger: 'bg-destructive',
  success: 'bg-semantic-success',
  muted: 'bg-ink-subtle',
};

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
  modules: NavManifest[];
  activeItemId?: string;
  linkComponent?: ShellLinkComponent;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  hideCollapse?: boolean;
  sessionFooter?: React.ReactNode;
  className?: string;
}

function moduleIdOfItem(modules: NavManifest[], itemId: string | undefined): string | null {
  if (!itemId) return null;
  for (const m of modules) {
    if (itemId === m.id || itemId.startsWith(`${m.id}.`)) return m.id;
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
            const Icon = m.icon;
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
        {modules.map((m) => (
          <ModuleSection
            key={m.id}
            manifest={m}
            isOpen={openModuleId === m.id}
            moduleActive={activeModuleId === m.id}
            activeItemId={activeItemId}
            onToggle={() => setOpenModuleId(openModuleId === m.id ? null : m.id)}
            Link={Link}
          />
        ))}
      </div>

      {sessionFooter && (
        <div className="flex-none border-t border-hairline p-2.5">{sessionFooter}</div>
      )}
    </nav>
  );
}

interface ModuleSectionProps {
  manifest: NavManifest;
  isOpen: boolean;
  moduleActive: boolean;
  activeItemId: string | undefined;
  onToggle: () => void;
  Link: ShellLinkComponent;
}

function ModuleSection({
  manifest,
  isOpen,
  moduleActive,
  activeItemId,
  onToggle,
  Link,
}: ModuleSectionProps) {
  const extensions = manifest.useNavExtensions();
  const sections: NavSection[] = [...manifest.nav, ...extensions];
  const ModuleIcon = manifest.icon;

  return (
    <div className="mb-0.5">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-controls={`shell-nav-module-${manifest.id}`}
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
          {manifest.label}
        </span>
        {!isOpen && moduleActive && (
          <span className="inline-block size-1.5 rounded-full bg-primary" aria-hidden />
        )}
      </button>

      {isOpen && (
        <div id={`shell-nav-module-${manifest.id}`} className="pb-1.5 pt-0.5">
          {sections.map((section, sectionIdx) =>
            section.items.length === 0 ? null : (
              <div key={`${manifest.id}:${section.label}`} className={sectionIdx > 0 ? 'mt-2' : ''}>
                <div className="mt-1 mb-0.5 px-[28px] text-eyebrow uppercase tracking-[0.04em] text-ink-subtle">
                  {section.label}
                </div>
                {section.items.map((item) => (
                  <NavItemRow
                    key={item.id}
                    item={item}
                    active={activeItemId === item.id}
                    Link={Link}
                  />
                ))}
              </div>
            ),
          )}
        </div>
      )}
    </div>
  );
}

interface NavItemRowProps {
  item: NavItem;
  active: boolean;
  Link: ShellLinkComponent;
}

function NavItemRow({ item, active, Link }: NavItemRowProps) {
  const Icon = item.icon ?? null;
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

  if (item.disabled || !item.to) {
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
      href={item.to}
      className={baseClass}
      style={style}
      aria-current={active ? 'page' : undefined}
    >
      {inner}
    </Link>
  );
}
