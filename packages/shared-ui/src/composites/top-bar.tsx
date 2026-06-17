import type { AppManifest } from '@seta/module-sdk';
import { ChevronRight, Menu, Search, Sparkles } from 'lucide-react';
import type * as React from 'react';
import { AppGrid } from '../icons/app-grid';
import { SetaMark } from '../icons/seta-mark';
import { cn } from '../lib/cn';
import { KbdHint } from './kbd-hint';
import type { ShellLinkComponent } from './left-nav';

const DefaultShellLink: ShellLinkComponent = ({ href, className, style, children, ...rest }) => (
  <a href={href} className={className} style={style} {...rest}>
    {children}
  </a>
);

export interface TopBarProps {
  /** Active app — rendered as the breadcrumb tail next to the brand. */
  activeApp?: AppManifest;
  /** Routing link used by the breadcrumb crumbs; falls back to a plain anchor. */
  linkComponent?: ShellLinkComponent;
  /** Where the brand crumb points; defaults to the suite root. */
  homeHref?: string;
  userMenu?: React.ReactNode;
  onSearchOpen?: () => void;
  agentOpen?: boolean;
  agentAlert?: boolean;
  onAgentToggle?: () => void;
  hideAgentButton?: boolean;
  /** Slot that replaces the default bell button. Pass a self-contained NotificationPopover here. */
  notificationPanel?: React.ReactNode;
  onMobileNavOpen?: () => void;
  onLauncherOpen?: () => void;
  launcherOpen?: boolean;
  className?: string;
}

const ICON_BTN =
  'inline-flex size-8 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-focus';

export function TopBar({
  activeApp,
  linkComponent,
  homeHref = '/',
  userMenu,
  onSearchOpen,
  agentOpen = false,
  agentAlert = false,
  onAgentToggle,
  hideAgentButton = false,
  notificationPanel,
  onMobileNavOpen,
  onLauncherOpen,
  launcherOpen,
  className,
}: TopBarProps) {
  return (
    <header
      className={cn(
        'relative flex h-12 flex-none items-center justify-between gap-2 border-b border-hairline bg-canvas px-3 sm:px-4',
        className,
      )}
    >
      {/* Left zone: launcher + brand breadcrumb */}
      <div className="flex min-w-0 items-center gap-2">
        {onLauncherOpen && (
          <button
            type="button"
            onClick={onLauncherOpen}
            aria-label="Open app launcher"
            aria-expanded={launcherOpen ?? false}
            title="Apps"
            className={cn(ICON_BTN, '-ml-1')}
          >
            <AppGrid className="size-[18px]" />
          </button>
        )}
        {onMobileNavOpen && (
          <button
            type="button"
            onClick={onMobileNavOpen}
            aria-label="Open navigation"
            className={cn(ICON_BTN, '-ml-1 md:hidden')}
          >
            <Menu className="size-4" aria-hidden />
          </button>
        )}
        <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-0.5">
          {(() => {
            const Link = linkComponent ?? DefaultShellLink;
            return (
              <>
                <Link
                  href={homeHref}
                  title="Home"
                  className="flex items-center gap-1.5 rounded-md px-1 py-1 transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-focus"
                >
                  <SetaMark size={20} />
                  <span className="hidden text-body-sm font-semibold tracking-tight text-ink sm:inline">
                    Seta
                  </span>
                </Link>
                {activeApp && <AppCrumb app={activeApp} Link={Link} />}
              </>
            );
          })()}
        </nav>
      </div>

      {/* Center zone: global search (the focal command trigger) */}
      <div className="pointer-events-none absolute left-1/2 hidden w-[clamp(240px,38vw,520px)] -translate-x-1/2 md:block">
        <button
          type="button"
          onClick={onSearchOpen}
          aria-label="Search or jump to"
          className="pointer-events-auto flex h-8 w-full items-center gap-2 rounded-md border border-hairline bg-surface-1 px-3 text-caption text-ink-subtle transition-colors hover:border-hairline-strong hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
        >
          <Search className="size-3.5 flex-none" aria-hidden />
          <span className="flex-1 truncate text-left">Search across Seta…</span>
          <KbdHint keys={['⌘K']} />
        </button>
      </div>

      {/* Right zone: app actions · account */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onSearchOpen}
          aria-label="Search"
          className={cn(ICON_BTN, 'md:hidden')}
        >
          <Search className="size-4" aria-hidden />
        </button>

        {!hideAgentButton && (
          <button
            type="button"
            onClick={onAgentToggle}
            aria-pressed={agentOpen}
            aria-label={agentOpen ? 'Hide agent panel' : 'Show agent panel'}
            title="Agent"
            className={cn(
              'relative inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-body-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
              agentOpen
                ? 'border-primary-border bg-primary-tint text-ink'
                : 'border-hairline text-ink-muted hover:bg-surface-2 hover:text-ink',
            )}
          >
            <Sparkles className="size-3.5 text-violet-500" aria-hidden />
            <span className="hidden sm:inline">Agent</span>
            {agentAlert && (
              <span
                className="absolute right-1 top-1 inline-block size-1.5 rounded-full bg-semantic-warning ring-2 ring-canvas"
                aria-hidden
              />
            )}
          </button>
        )}

        {notificationPanel}

        <span className="mx-1 h-5 w-px bg-hairline" />

        {userMenu}
      </div>
    </header>
  );
}

function AppCrumb({ app, Link }: { app: AppManifest; Link: ShellLinkComponent }) {
  const Icon = app.icon;
  return (
    <span className="flex min-w-0 items-center gap-0.5">
      <ChevronRight className="size-3.5 flex-none text-ink-subtle" aria-hidden />
      <Link
        href={app.routeNamespace}
        title={`${app.label} home`}
        aria-current="page"
        className="flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-focus"
      >
        <Icon className="size-3.5 flex-none text-primary" aria-hidden />
        <span className="truncate text-body-sm font-medium text-ink">{app.label}</span>
      </Link>
    </span>
  );
}
