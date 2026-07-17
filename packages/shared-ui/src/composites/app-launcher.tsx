import type { AppManifest } from '@seta/module-sdk';
import { cn } from '../lib/cn';
import { Badge } from '../primitives/badge';

export interface AppLauncherProps {
  apps: AppManifest[];
  currentAppId?: string;
  /** App ids shown but not selectable (future modules). */
  disabledAppIds?: string[];
  onSelect: (appId: string) => void;
  /** Called after a selection is made, e.g. to close an enclosing popover. */
  onClose?: () => void;
  className?: string;
}

export function AppLauncher({
  apps,
  currentAppId,
  disabledAppIds = [],
  onSelect,
  onClose,
  className,
}: AppLauncherProps) {
  const disabled = new Set(disabledAppIds);

  return (
    <fieldset className={cn('grid grid-cols-3 gap-2 p-4', className)}>
      <legend className="sr-only">Apps</legend>
      {apps
        .filter((app) => !app.hideInLauncher)
        .map((app) => {
          const Icon = app.icon;
          const isDisabled = disabled.has(app.id);
          const isCurrent = app.id === currentAppId;
          return (
            <button
              key={app.id}
              type="button"
              disabled={isDisabled}
              aria-current={isCurrent ? 'true' : undefined}
              onClick={() => {
                if (isDisabled) return;
                onSelect(app.id);
                onClose?.();
              }}
              className={cn(
                'relative flex flex-col items-center gap-2 rounded-md border border-transparent px-2 pb-3 pt-4 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-bg',
                isCurrent && 'border-accent-bg bg-accent-muted',
                isDisabled ? 'opacity-55' : 'hover:border-border hover:bg-surface',
              )}
            >
              {isDisabled && (
                <span className="absolute right-2 top-1.5">
                  <Badge variant="warning" label="Soon" />
                </span>
              )}
              <span
                className="grid size-10 place-items-center rounded-lg text-white"
                style={{ background: app.color ?? 'var(--color-accent, #0047FF)' }}
              >
                <Icon className="size-5" aria-hidden />
              </span>
              <span className="text-body-sm font-medium text-primary">{app.label}</span>
            </button>
          );
        })}
    </fieldset>
  );
}
