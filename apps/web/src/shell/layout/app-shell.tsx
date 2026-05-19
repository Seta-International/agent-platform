import type { ReactNode } from 'react';
import { MainContent } from './main-content';
import { TopBar } from './top-bar';

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-canvas text-ink">
      <TopBar />
      <MainContent>{children}</MainContent>
    </div>
  );
}
