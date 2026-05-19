import type { ReactNode } from 'react';
import { MainContent } from './main-content';
import { TopBar } from './top-bar';

interface AppShellProps {
  children: ReactNode;
  /** Forwarded to TopBar's right slot. */
  topBarRight?: ReactNode;
}

export function AppShell({ children, topBarRight }: AppShellProps) {
  return (
    <div className="flex min-h-screen flex-col bg-canvas text-ink">
      <TopBar right={topBarRight} />
      <MainContent>{children}</MainContent>
    </div>
  );
}
