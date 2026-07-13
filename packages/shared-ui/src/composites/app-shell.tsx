import { AppShell as AstryxAppShell } from '@astryxdesign/core/AppShell';
import { MobileNav } from '@astryxdesign/core/MobileNav';
import type { AppManifest } from '@seta/module-sdk';
import * as React from 'react';
import { cn } from '../lib/cn';
import { AgentPanel } from './agent-panel';
import { AppLauncher } from './app-launcher';
import { LeftNav } from './left-nav';
import { toSideNavSections } from './nav-sections';
import { DefaultShellLink, type ShellLinkComponent } from './shell-link';
import { TopBar } from './top-bar';

export interface AppShellProps {
  userMenu?: React.ReactNode;

  apps: AppManifest[];
  activeAppId: string;
  activeItemId?: string;
  disabledAppIds?: string[];
  onAppSelect: (appId: string) => void;
  linkComponent?: ShellLinkComponent;
  sessionFooter?: React.ReactNode;
  defaultSidebarCollapsed?: boolean;

  agentPanel?: React.ReactNode;
  agentAlert?: boolean;
  defaultAgentOpen?: boolean;
  /** When provided, AppShell becomes controlled for the agent panel. */
  agentOpen?: boolean;
  onAgentOpenChange?: (open: boolean) => void;
  /** Slot rendered outside the desktop aside, used by the mobile FAB. */
  agentMobileSlot?: React.ReactNode;
  hideAgent?: boolean;
  /** Slot rendered in the top bar where the bell button was. Pass a self-contained NotificationPopover here. */
  notificationPanel?: React.ReactNode;

  children: React.ReactNode;
  className?: string;
}

export function AppShell({
  userMenu,
  apps,
  activeAppId,
  activeItemId,
  disabledAppIds,
  onAppSelect,
  linkComponent,
  sessionFooter,
  defaultSidebarCollapsed = false,
  agentPanel,
  agentAlert = false,
  defaultAgentOpen = false,
  agentOpen: controlledAgentOpen,
  onAgentOpenChange,
  agentMobileSlot,
  hideAgent = false,
  notificationPanel,
  children,
  className,
}: AppShellProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(defaultSidebarCollapsed);
  const [internalAgentOpen, setInternalAgentOpen] = React.useState(defaultAgentOpen);
  const agentOpen = controlledAgentOpen ?? internalAgentOpen;
  const setAgentOpen = React.useCallback(
    (next: boolean) => {
      if (controlledAgentOpen === undefined) setInternalAgentOpen(next);
      onAgentOpenChange?.(next);
    },
    [controlledAgentOpen, onAgentOpenChange],
  );
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false);
  const Link = linkComponent ?? DefaultShellLink;
  // No match → chrome-less (bare brand crumb, no left nav). Never silently
  // adopt the first app, which would mislabel global pages like Settings.
  const activeApp = apps.find((a) => a.id === activeAppId);

  const sideNavContent = activeApp ? (
    <LeftNav
      key={activeApp.id}
      app={activeApp}
      activeItemId={activeItemId}
      linkComponent={linkComponent}
      collapsed={sidebarCollapsed}
      onCollapsedChange={setSidebarCollapsed}
      sessionFooter={sessionFooter}
    />
  ) : undefined;

  return (
    <div className={cn('relative flex h-screen w-screen', className)}>
      <AstryxAppShell
        height="fill"
        topNav={
          <TopBar
            activeApp={activeApp}
            linkComponent={linkComponent}
            userMenu={userMenu}
            agentOpen={agentOpen}
            agentAlert={agentAlert}
            onAgentToggle={() => setAgentOpen(!agentOpen)}
            hideAgentButton={hideAgent}
            notificationPanel={notificationPanel}
            onMobileNavOpen={() => setMobileNavOpen(true)}
            launcherContent={
              <AppLauncher
                apps={apps}
                currentAppId={activeAppId}
                disabledAppIds={disabledAppIds}
                onSelect={onAppSelect}
              />
            }
          />
        }
        sideNav={sideNavContent}
        mobileNav={
          <MobileNav isOpen={mobileNavOpen} onOpenChange={setMobileNavOpen} header="Navigation">
            {activeApp && toSideNavSections(activeApp.nav, activeItemId, Link)}
          </MobileNav>
        }
      >
        {children}
      </AstryxAppShell>
      {!hideAgent && agentOpen && (
        <div className="absolute inset-y-0 right-0 z-20 hidden lg:flex">
          <AgentPanel className="shadow-lg">{agentPanel}</AgentPanel>
        </div>
      )}
      {agentMobileSlot}
    </div>
  );
}
