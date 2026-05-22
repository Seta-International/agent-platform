import { ChevronRight } from 'lucide-react';
import * as React from 'react';
import { cn } from '../lib/cn';

export interface PageChromeProps {
  breadcrumb?: ReadonlyArray<string>;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  toolbar?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}

export function PageChrome({
  breadcrumb,
  title,
  subtitle,
  actions,
  toolbar,
  className,
  children,
}: PageChromeProps) {
  return (
    <div className={cn('flex min-h-0 flex-1 flex-col', className)}>
      <header className="flex h-14 flex-none items-center justify-between gap-4 border-b border-hairline bg-canvas px-6">
        <div className="flex min-w-0 flex-col gap-0.5">
          {breadcrumb && breadcrumb.length > 0 && (
            <nav
              aria-label="Breadcrumb"
              className="flex items-center gap-1.5 text-eyebrow uppercase tracking-[0.04em] text-ink-subtle"
            >
              {breadcrumb.map((crumb, i) => (
                <React.Fragment key={crumb}>
                  {i > 0 && <ChevronRight aria-hidden className="size-2.5 text-ink-tertiary" />}
                  <span>{crumb}</span>
                </React.Fragment>
              ))}
            </nav>
          )}
          <div className="flex items-baseline gap-3">
            <h1 className="text-card-title m-0 truncate font-semibold tracking-tight text-ink">
              {title}
            </h1>
            {subtitle && <span className="truncate text-body-sm text-ink-subtle">{subtitle}</span>}
          </div>
        </div>
        {actions && <div className="flex flex-none items-center gap-2">{actions}</div>}
      </header>
      {toolbar && (
        <div className="flex h-12 flex-none items-center justify-between gap-4 border-b border-hairline bg-canvas px-6">
          {toolbar}
        </div>
      )}
      {children && <div className="min-h-0 flex-1 overflow-auto">{children}</div>}
    </div>
  );
}

export interface PageChromeToolbarProps {
  left?: React.ReactNode;
  right?: React.ReactNode;
  className?: string;
}

export function PageChromeToolbar({ left, right, className }: PageChromeToolbarProps) {
  return (
    <div className={cn('flex w-full items-center justify-between gap-3', className)}>
      <div className="flex items-center gap-2">{left}</div>
      <div className="flex items-center gap-2">{right}</div>
    </div>
  );
}
