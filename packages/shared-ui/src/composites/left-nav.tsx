import type { AppManifest, NavBadgeTone, NavItem, NavSection } from '@seta/module-sdk';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import * as React from 'react';
import { cn } from '../lib/cn';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../primitives/tooltip';
import { DefaultShellLink, type ShellLinkComponent } from './shell-link';

const DOT_CLASS: Record<NavBadgeTone, string> = {
  primary: 'bg-primary',
  warning: 'bg-semantic-warning',
  danger: 'bg-destructive',
  success: 'bg-semantic-success',
  muted: 'bg-ink-subtle',
};

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
  const [collapsedInternal, setCollapsedInternal] = React.useState(collapsedProp ?? false);
  const collapsed = collapsedProp ?? collapsedInternal;
  const setCollapsed = (next: boolean) => {
    if (collapsedProp === undefined) setCollapsedInternal(next);
    onCollapsedChange?.(next);
  };

  const extensions = app.useNavExtensions();
  const sections: NavSection[] = [...app.nav, ...extensions].filter((s) => s.items.length > 0);

  if (collapsed) {
    return (
      <nav
        aria-label="Primary"
        className={cn(
          'flex h-full w-14 flex-none flex-col border-r border-hairline bg-surface-1',
          className,
        )}
      >
        <TooltipProvider delayDuration={200}>
          <div className="flex-1 overflow-y-auto py-2">
            {sections.map((section, i) => (
              <div key={`${app.id}:${section.label ?? i}`}>
                {i > 0 && <div className="mx-3 my-1.5 h-px bg-hairline" aria-hidden />}
                {section.items.map((item) => (
                  <RailItemRow
                    key={item.id}
                    item={item}
                    active={activeItemId === item.id}
                    Link={Link}
                  />
                ))}
              </div>
            ))}
          </div>
        </TooltipProvider>

        {!hideCollapse && (
          <div className="flex-none border-t border-hairline">
            <button
              type="button"
              onClick={() => setCollapsed(false)}
              title="Expand sidebar"
              aria-label="Expand sidebar"
              className="flex h-9 w-full items-center justify-center text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-focus"
            >
              <ChevronRight className="size-3.5" aria-hidden />
            </button>
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
      <div className="flex-1 overflow-y-auto py-2">
        {sections.map((section, i) => (
          <div key={`${app.id}:${section.label ?? i}`} className={i > 0 ? 'mt-3' : ''}>
            {section.label && (
              <div className="mt-1 mb-1 px-[20px] text-eyebrow uppercase tracking-[0.04em] text-ink-subtle">
                {section.label}
              </div>
            )}
            {section.items.map((item) => (
              <NavItemRow key={item.id} item={item} active={activeItemId === item.id} Link={Link} />
            ))}
          </div>
        ))}
      </div>

      {(sessionFooter || !hideCollapse) && (
        <div className="flex-none border-t border-hairline">
          {sessionFooter && <div className="p-2.5">{sessionFooter}</div>}
          {!hideCollapse && (
            <button
              type="button"
              onClick={() => setCollapsed(true)}
              aria-label="Collapse sidebar"
              className={cn(
                'flex h-9 w-full items-center gap-2 px-3.5 text-caption text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-focus',
                sessionFooter && 'border-t border-hairline',
              )}
            >
              <ChevronLeft className="size-3.5" aria-hidden />
              <span>Collapse</span>
            </button>
          )}
        </div>
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
        <Icon className={cn('size-4', active ? 'text-ink' : 'text-ink-muted')} aria-hidden />
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
    'group relative mx-1.5 mb-px flex h-8 items-center gap-2.5 rounded-md text-body-sm',
    active
      ? 'bg-surface-3 font-medium text-ink'
      : 'text-ink-muted hover:bg-surface-2 hover:text-ink',
    item.disabled && 'cursor-not-allowed opacity-55 hover:bg-transparent hover:text-ink-muted',
  );
  // Icon column matches the collapsed rail: row mx-1.5 (6px) + 14px = 20px icon-left,
  // so a 16px icon centers at x=28 in both states and never shifts on collapse/expand.
  const style: React.CSSProperties = { paddingLeft: 14 + indent * 14, paddingRight: 10 };
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

function RailItemRow({ item, active, Link }: NavItemRowProps) {
  const Icon = item.icon ?? null;
  const boxClass = cn(
    'flex size-9 items-center justify-center rounded-md transition-colors',
    active ? 'bg-surface-3 text-ink' : 'text-ink-muted hover:bg-surface-2 hover:text-ink',
    item.disabled && 'cursor-not-allowed opacity-55 hover:bg-transparent hover:text-ink-muted',
  );
  const glyph = Icon ? (
    <Icon className="size-4" aria-hidden />
  ) : (
    <span className="text-body-sm font-medium" aria-hidden>
      {item.label.charAt(0).toUpperCase()}
    </span>
  );
  const badge = item.badgeTone ? (
    <span
      className={cn(
        'absolute right-1 top-1 size-1.5 rounded-full ring-2 ring-surface-1',
        DOT_CLASS[item.badgeTone],
      )}
      aria-hidden
    />
  ) : null;

  const trigger =
    item.disabled || !item.to ? (
      <span className={boxClass} role="img" aria-label={item.label}>
        {glyph}
        {badge}
      </span>
    ) : (
      <Link
        href={item.to}
        className={boxClass}
        aria-label={item.label}
        aria-current={active ? 'page' : undefined}
      >
        {glyph}
        {badge}
      </Link>
    );

  return (
    <div className="relative px-2.5 py-0.5">
      {active && (
        <span className="absolute left-0 top-1 bottom-1 w-0.5 rounded bg-primary" aria-hidden />
      )}
      <Tooltip>
        <TooltipTrigger asChild>{trigger}</TooltipTrigger>
        <TooltipContent side="right">
          {item.disabled ? (item.disabledHint ?? item.label) : item.label}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
