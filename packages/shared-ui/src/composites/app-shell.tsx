import type { AppManifest } from '@seta/module-sdk';
import * as React from 'react';

import { cn } from '../lib/cn';
import { Sheet, SheetContent } from '../primitives/sheet';
import { AgentPanel } from './agent-panel';
import { AppLauncher } from './app-launcher';
import { LeftNav, type ShellLinkComponent } from './left-nav';
import { TopBar } from './top-bar';

export interface AppShellProps {
  userMenu?: React.ReactNode;
  onSearchOpen?: () => void;

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
  onSearchOpen,
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
  const [launcherOpen, setLauncherOpen] = React.useState(false);
  // No match → chrome-less (bare brand crumb, no left nav). Never silently
  // adopt the first app, which would mislabel global pages like Settings.
  const activeApp = apps.find((a) => a.id === activeAppId);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const target = e.target as HTMLElement;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target.isContentEditable
      )
        return;
      if (e.key === '\\') {
        if (hideAgent) return;
        e.preventDefault();
        setAgentOpen(!agentOpen);
      } else if (e.key === 'b' || e.key === 'B') {
        if (e.shiftKey) return;
        e.preventDefault();
        setSidebarCollapsed((c) => !c);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hideAgent, agentOpen, setAgentOpen]);

  return (
    <div
      className={cn(
        'flex h-screen w-screen flex-col overflow-hidden bg-canvas text-ink',
        className,
      )}
    >
      <TopBar
        activeApp={activeApp}
        linkComponent={linkComponent}
        userMenu={userMenu}
        onSearchOpen={onSearchOpen}
        agentOpen={agentOpen}
        agentAlert={agentAlert}
        onAgentToggle={() => setAgentOpen(!agentOpen)}
        hideAgentButton={hideAgent}
        notificationPanel={notificationPanel}
        onMobileNavOpen={() => setMobileNavOpen(true)}
        onLauncherOpen={() => setLauncherOpen((o) => !o)}
        launcherOpen={launcherOpen}
      />
      {launcherOpen && (
        <>
          <button
            type="button"
            aria-label="Close app launcher"
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setLauncherOpen(false)}
          />
          <div
            role="dialog"
            aria-label="App launcher"
            className="absolute left-2 top-14 z-50 w-[360px] overflow-hidden rounded-lg border border-hairline bg-surface-1 shadow-lg"
          >
            <div className="flex items-center justify-between border-b border-hairline px-4 py-2.5">
              <span className="text-body-sm font-semibold text-ink">Apps</span>
              <span className="text-eyebrow uppercase tracking-[0.04em] text-ink-subtle">
                Seta Suite
              </span>
            </div>
            <AppLauncher
              apps={apps}
              currentAppId={activeAppId}
              disabledAppIds={disabledAppIds}
              onSelect={(id) => {
                setLauncherOpen(false);
                onAppSelect(id);
              }}
            />
          </div>
        </>
      )}
      <div className="relative flex min-h-0 flex-1">
        {activeApp && (
          <div className="hidden md:flex">
            <LeftNav
              key={activeApp.id}
              app={activeApp}
              activeItemId={activeItemId}
              linkComponent={linkComponent}
              collapsed={sidebarCollapsed}
              onCollapsedChange={setSidebarCollapsed}
              sessionFooter={sessionFooter}
            />
          </div>
        )}
        <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
          <SheetContent
            side="left"
            hideClose
            className="w-[260px] border-r border-hairline bg-surface-1 p-0 sm:max-w-none md:hidden"
          >
            {activeApp && (
              <LeftNav
                key={activeApp.id}
                app={activeApp}
                activeItemId={activeItemId}
                linkComponent={linkComponent}
                collapsed={false}
                hideCollapse
                sessionFooter={sessionFooter}
                className="w-full border-r-0"
              />
            )}
          </SheetContent>
        </Sheet>
        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-auto bg-canvas">
          {children}
        </main>
        {!hideAgent && agentOpen && (
          <div className="absolute inset-y-0 right-0 z-20 hidden lg:flex">
            <AgentPanel className="shadow-lg">{agentPanel}</AgentPanel>
          </div>
        )}
      </div>
      {agentMobileSlot}
    </div>
  );
}
