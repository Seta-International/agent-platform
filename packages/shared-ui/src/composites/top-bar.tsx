import { TopNav, TopNavHeading } from '@astryxdesign/core/TopNav';
import type { AppManifest } from '@seta/module-sdk';
import { ChevronRight, Menu, Sparkles } from 'lucide-react';
import type * as React from 'react';
import { SetaMark } from '../icons/seta-mark';
import { cn } from '../lib/cn';
import { DefaultShellLink, type ShellLinkComponent } from './shell-link';

export interface TopBarProps {
  /** Active app — rendered as the breadcrumb tail next to the brand. */
  activeApp?: AppManifest;
  /** Routing link used by the breadcrumb crumbs; falls back to a plain anchor. */
  linkComponent?: ShellLinkComponent;
  /** Where the brand crumb points; defaults to the suite root. */
  homeHref?: string;
  userMenu?: React.ReactNode;
  agentOpen?: boolean;
  agentAlert?: boolean;
  onAgentToggle?: () => void;
  hideAgentButton?: boolean;
  /** Slot that replaces the default bell button. Pass a self-contained NotificationPopover here. */
  notificationPanel?: React.ReactNode;
  onMobileNavOpen?: () => void;
  /** Content rendered in the app-launcher popover, typically an AppLauncher. */
  launcherContent?: React.ReactNode;
  className?: string;
}

const ICON_BTN =
  'inline-flex size-8 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-focus';

export function TopBar({
  activeApp,
  linkComponent,
  homeHref = '/',
  userMenu,
  agentOpen = false,
  agentAlert = false,
  onAgentToggle,
  hideAgentButton = false,
  notificationPanel,
  onMobileNavOpen,
  launcherContent,
  className,
}: TopBarProps) {
  const Link = linkComponent ?? DefaultShellLink;

  return (
    <TopNav
      label="Main navigation"
      className={className}
      heading={
        <TopNavHeading
          as={Link}
          logo={<SetaMark size={20} />}
          heading="Seta"
          headingHref={homeHref}
          menu={launcherContent}
        />
      }
      startContent={
        <>
          {onMobileNavOpen && (
            <button
              type="button"
              onClick={onMobileNavOpen}
              aria-label="Open navigation"
              className={cn(ICON_BTN, 'md:hidden')}
            >
              <Menu className="size-4" aria-hidden />
            </button>
          )}
          {activeApp && <AppCrumb app={activeApp} Link={Link} />}
        </>
      }
      endContent={
        <div className="flex items-center gap-1">
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
      }
    />
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
