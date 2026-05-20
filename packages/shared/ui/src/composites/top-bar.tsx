import { Bell, Building2, ChevronDown, Menu, Moon, Search, Sparkles, Sun } from 'lucide-react';
import type * as React from 'react';
import { SetaMark } from '../icons/seta-mark';
import { cn } from '../lib/cn';
import { useThemeOptional } from '../theme/theme-provider';
import { KbdHint } from './kbd-hint';

export interface TopBarProps {
  workspace: string;
  onWorkspaceClick?: () => void;
  userMenu?: React.ReactNode;
  onSearchOpen?: () => void;
  copilotOpen?: boolean;
  copilotAlert?: boolean;
  onCopilotToggle?: () => void;
  hideCopilotButton?: boolean;
  notificationCount?: number;
  onMobileNavOpen?: () => void;
  className?: string;
}

export function TopBar({
  workspace,
  onWorkspaceClick,
  userMenu,
  onSearchOpen,
  copilotOpen = false,
  copilotAlert = false,
  onCopilotToggle,
  hideCopilotButton = false,
  notificationCount = 0,
  onMobileNavOpen,
  className,
}: TopBarProps) {
  const theme = useThemeOptional();
  const isDark = theme ? theme.resolvedTheme === 'dark' : true;
  return (
    <header
      className={cn(
        'flex h-12 flex-none items-center justify-between border-b border-hairline bg-canvas px-4',
        className,
      )}
    >
      <div className="flex items-center gap-3">
        {onMobileNavOpen && (
          <button
            type="button"
            onClick={onMobileNavOpen}
            aria-label="Open navigation"
            className="-ml-1 inline-flex size-8 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-focus md:hidden"
          >
            <Menu className="size-4" aria-hidden />
          </button>
        )}
        <SetaMark size={20} />
        <span className="hidden text-body-sm font-semibold tracking-tight text-ink sm:inline">
          Seta
        </span>
        <span className="hidden h-[18px] w-px bg-hairline sm:inline-block" />
        <button
          type="button"
          onClick={onWorkspaceClick}
          className="inline-flex h-6 items-center gap-1.5 rounded-md px-2 text-caption text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
        >
          <Building2 className="size-3.5" aria-hidden />
          <span className="max-w-[12ch] truncate text-ink sm:max-w-none">{workspace}</span>
          <ChevronDown className="size-3 text-ink-subtle" aria-hidden />
        </button>
      </div>

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onSearchOpen}
          className="inline-flex h-6 items-center gap-2 rounded-md px-2 text-caption text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
          aria-label="Search or jump to"
        >
          <Search className="size-3.5" aria-hidden />
          <span className="hidden text-ink-subtle md:inline">Search or jump to…</span>
          <span className="hidden md:inline">
            <KbdHint keys={['⌘K']} />
          </span>
        </button>

        {theme && (
          <button
            type="button"
            onClick={() => theme.setTheme(isDark ? 'light' : 'dark')}
            className="inline-flex size-6 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
            aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
            title={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
          >
            {isDark ? (
              <Sun className="size-3.5" aria-hidden />
            ) : (
              <Moon className="size-3.5" aria-hidden />
            )}
          </button>
        )}

        <button
          type="button"
          className="relative inline-flex size-6 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
          aria-label={
            notificationCount > 0 ? `Notifications (${notificationCount})` : 'Notifications'
          }
          title="Notifications"
        >
          <Bell className="size-3.5" aria-hidden />
          {notificationCount > 0 && (
            <span
              className="absolute right-0.5 top-0.5 inline-block size-1.5 rounded-full bg-primary"
              aria-hidden
            />
          )}
        </button>

        {!hideCopilotButton && (
          <button
            type="button"
            onClick={onCopilotToggle}
            aria-pressed={copilotOpen}
            aria-label={copilotOpen ? 'Hide copilot panel' : 'Show copilot panel'}
            title={copilotOpen ? 'Hide copilot panel' : 'Show copilot panel'}
            className={cn(
              'relative inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-body-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
              copilotOpen
                ? 'border-primary-border bg-primary-tint text-primary-ink'
                : 'border-transparent text-ink-muted hover:bg-surface-2 hover:text-ink',
            )}
          >
            <Sparkles
              className={cn('size-3.5', copilotOpen ? 'text-primary' : 'text-ink-muted')}
              aria-hidden
            />
            <span className="hidden sm:inline">Copilot</span>
            {copilotAlert && (
              <span
                className="absolute right-1.5 top-1 inline-block size-1.5 rounded-full bg-semantic-warning ring-2 ring-canvas"
                aria-hidden
              />
            )}
            <span className="hidden sm:inline">
              <KbdHint keys={['⌘\\']} />
            </span>
          </button>
        )}

        <span className="mx-1 h-[18px] w-px bg-hairline" />

        {userMenu}
      </div>
    </header>
  );
}
