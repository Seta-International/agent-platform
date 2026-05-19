import { SetaLogo, ThemeToggle } from '@seta/shared-ui';
import type { ReactNode } from 'react';

interface TopBarProps {
  /** Slot rendered to the right of ThemeToggle. Pass UserMenu for authenticated layouts. */
  right?: ReactNode;
}

export function TopBar({ right }: TopBarProps) {
  return (
    <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-hairline bg-canvas px-md">
      <a href="/" className="inline-flex items-center" aria-label="Seta home">
        <SetaLogo height={28} />
      </a>
      <div className="flex items-center gap-sm">
        <ThemeToggle />
        {right}
      </div>
    </header>
  );
}
