import type { NavManifest } from '@seta/module-sdk';
import * as React from 'react';

import { cn } from '../lib/cn';
import { Sheet, SheetContent } from '../primitives/sheet';
import { CopilotPanel } from './copilot-panel';
import { LeftNav, type ShellLinkComponent } from './left-nav';
import { TopBar } from './top-bar';

export interface AppShellProps {
  workspace: string;
  onWorkspaceClick?: () => void;
  userMenu?: React.ReactNode;
  onSearchOpen?: () => void;

  modules: NavManifest[];
  activeItemId?: string;
  linkComponent?: ShellLinkComponent;
  sessionFooter?: React.ReactNode;
  defaultSidebarCollapsed?: boolean;

  copilotPanel?: React.ReactNode;
  copilotAlert?: boolean;
  defaultCopilotOpen?: boolean;
  hideCopilot?: boolean;
  notificationCount?: number;
  onBellClick?: () => void;

  children: React.ReactNode;
  className?: string;
}

export function AppShell({
  workspace,
  onWorkspaceClick,
  userMenu,
  onSearchOpen,
  modules,
  activeItemId,
  linkComponent,
  sessionFooter,
  defaultSidebarCollapsed = false,
  copilotPanel,
  copilotAlert = false,
  defaultCopilotOpen = false,
  hideCopilot = false,
  notificationCount = 0,
  onBellClick,
  children,
  className,
}: AppShellProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(defaultSidebarCollapsed);
  const [copilotOpen, setCopilotOpen] = React.useState(defaultCopilotOpen);
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      if (e.key === '\\') {
        if (hideCopilot) return;
        e.preventDefault();
        setCopilotOpen((o) => !o);
      } else if (e.key === 'b' || e.key === 'B') {
        if (e.shiftKey) return;
        e.preventDefault();
        setSidebarCollapsed((c) => !c);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hideCopilot]);

  return (
    <div
      className={cn(
        'flex h-screen w-screen flex-col overflow-hidden bg-canvas text-ink',
        className,
      )}
    >
      <TopBar
        workspace={workspace}
        onWorkspaceClick={onWorkspaceClick}
        userMenu={userMenu}
        onSearchOpen={onSearchOpen}
        copilotOpen={copilotOpen}
        copilotAlert={copilotAlert}
        onCopilotToggle={() => setCopilotOpen((o) => !o)}
        hideCopilotButton={hideCopilot}
        notificationCount={notificationCount}
        onBellClick={onBellClick}
        onMobileNavOpen={() => setMobileNavOpen(true)}
      />
      <div className="flex min-h-0 flex-1">
        <div className="hidden md:flex">
          <LeftNav
            modules={modules}
            activeItemId={activeItemId}
            linkComponent={linkComponent}
            collapsed={sidebarCollapsed}
            onCollapsedChange={setSidebarCollapsed}
            sessionFooter={sessionFooter}
          />
        </div>
        <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
          <SheetContent
            side="left"
            hideClose
            className="w-[260px] border-r border-hairline bg-surface-1 p-0 sm:max-w-none md:hidden"
          >
            <LeftNav
              modules={modules}
              activeItemId={activeItemId}
              linkComponent={linkComponent}
              collapsed={false}
              hideCollapse
              sessionFooter={sessionFooter}
              className="w-full border-r-0"
            />
          </SheetContent>
        </Sheet>
        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-auto bg-canvas">
          {children}
        </main>
        {!hideCopilot && copilotOpen && (
          <CopilotPanel onClose={() => setCopilotOpen(false)}>{copilotPanel}</CopilotPanel>
        )}
      </div>
    </div>
  );
}
