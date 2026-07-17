import { usePopover } from '@astryxdesign/core/Popover';
import { TopNav, TopNavHeading } from '@astryxdesign/core/TopNav';
import type { AppManifest } from '@seta/module-sdk';
import { ChevronRight, LayoutGrid, Menu, Sparkles } from 'lucide-react';
import type * as React from 'react';
import { SetaMark } from '../icons/seta-mark';
import { cn } from '../lib/cn';
import { Divider } from '../primitives/divider';
import { IconButton } from '../primitives/icon-button';
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
  /**
   * Content rendered in the app-launcher popover, typically an AppLauncher.
   * A render function so it can be given this popover's own `close`
   * callback (e.g. to close on selection) without TopBar owning AppLauncher
   * directly.
   */
  launcherContent?: (close: () => void) => React.ReactNode;
  className?: string;
}

const ICON_BTN =
  'inline-flex size-8 items-center justify-center rounded-md text-secondary transition-colors hover:bg-surface hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-bg';

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
  const launcher = usePopover({ dialogLabel: 'Apps' });

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
          {launcherContent && (
            <>
              <IconButton
                ref={launcher.triggerRef}
                icon={<LayoutGrid className="size-[18px]" aria-hidden />}
                label="Open app launcher"
                variant="ghost"
                size="sm"
                onClick={() => launcher.toggle()}
                {...launcher.triggerProps}
              />
              {launcher.render(launcherContent(launcher.hide), {
                placement: 'below',
                alignment: 'start',
              })}
            </>
          )}
          {activeApp && <AppCrumb app={activeApp} Link={Link} />}
        </>
      }
      endContent={
        // pr-2: the icon-only avatar trigger has no inline padding of its own,
        // so the wrapper keeps the avatar off the viewport edge. gap-3 is the
        // single spacing rhythm — the Divider must not add its own margins.
        <div className="flex items-center gap-3 pr-2">
          {!hideAgentButton && (
            <button
              type="button"
              onClick={onAgentToggle}
              aria-pressed={agentOpen}
              aria-label={agentOpen ? 'Hide agent panel' : 'Show agent panel'}
              title="Agent"
              className={cn(
                'group relative inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-base font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-bg focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
                agentOpen
                  ? 'border-violet-500/60 bg-gradient-to-r from-violet-500/20 to-fuchsia-500/20 text-primary'
                  : 'border-violet-500/30 bg-gradient-to-r from-violet-500/10 to-fuchsia-500/10 text-primary hover:border-violet-500/60 hover:from-violet-500/20 hover:to-fuchsia-500/20',
              )}
            >
              <Sparkles
                className="size-3.5 text-violet-500 transition-transform motion-safe:group-hover:scale-110"
                aria-hidden
              />
              <span className="hidden sm:inline">Agent</span>
              {agentAlert && (
                <span
                  className="absolute right-1 top-1 inline-block size-1.5 rounded-full bg-warning ring-2 ring-body"
                  aria-hidden
                />
              )}
            </button>
          )}
          {notificationPanel}
          {/* Height is explicit: a vertical Divider is height:100% over a
              flex-grow line, so it collapses without a definite parent height. */}
          <Divider orientation="vertical" style={{ height: 20 }} />
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
      <ChevronRight className="size-3.5 flex-none text-secondary" aria-hidden />
      <Link
        href={app.routeNamespace}
        title={`${app.label} home`}
        aria-current="page"
        className="flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-bg"
      >
        <Icon className="size-3.5 flex-none text-accent" aria-hidden />
        <span className="truncate text-base font-medium text-primary">{app.label}</span>
      </Link>
    </span>
  );
}
