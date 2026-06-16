import type { AppManifest, NavBadgeTone, NavItem, NavSection } from '@seta/module-sdk';
import { ChevronLeft } from 'lucide-react';
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
  app: AppManifest;
  activeItemId?: string;
  linkComponent?: ShellLinkComponent;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  hideCollapse?: boolean;
  sessionFooter?: React.ReactNode;
  className?: string;
}

export function LeftNav({
  app,
  activeItemId,
  linkComponent,
  collapsed: collapsedProp,
  onCollapsedChange,
  hideCollapse = false,
  sessionFooter,
  className,
}: LeftNavProps) {
  const Link = linkComponent ?? DefaultShellLink;
  const Icon = app.icon;
  const [collapsedInternal, setCollapsedInternal] = React.useState(collapsedProp ?? false);
  const collapsed = collapsedProp ?? collapsedInternal;
  const setCollapsed = (next: boolean) => {
    if (collapsedProp === undefined) setCollapsedInternal(next);
    onCollapsedChange?.(next);
  };

  const extensions = app.useNavExtensions();
  const sections: NavSection[] = [...app.nav, ...extensions];

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
            <Icon className="size-4" aria-hidden />
          </button>
        </div>
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
        <span className="flex items-center gap-2 text-body-sm font-semibold text-ink">
          <Icon className="size-4 text-primary" aria-hidden />
          {app.label}
        </span>
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
        {sections.map((section, i) =>
          section.items.length === 0 ? null : (
            <div key={`${app.id}:${section.label}`} className={i > 0 ? 'mt-2' : ''}>
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

      {sessionFooter && (
        <div className="flex-none border-t border-hairline p-2.5">{sessionFooter}</div>
      )}
    </nav>
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
