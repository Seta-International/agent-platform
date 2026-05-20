import { Plus, Search } from 'lucide-react';
import { cn } from '../lib/cn';
import { KbdHint } from './kbd-hint';

export interface ThreadRailItem {
  id: string;
  title: string;
  updatedAtLabel: string;
  active?: boolean;
  hint?: string;
}

export interface ChatThreadRailProps {
  groups: Array<{ label: string; items: ThreadRailItem[] }>;
  activeId?: string;
  onSelect: (id: string) => void;
  onNewThread: () => void;
  searchValue: string;
  onSearchChange: (v: string) => void;
  className?: string;
}

export function ChatThreadRail({
  groups,
  activeId,
  onSelect,
  onNewThread,
  searchValue,
  onSearchChange,
  className,
}: ChatThreadRailProps) {
  return (
    <aside
      className={cn(
        'flex w-full flex-none flex-col border-r border-hairline bg-surface-1 lg:w-[260px]',
        className,
      )}
    >
      <div className="flex flex-col gap-2.5 px-3.5 pt-3.5 pb-2.5">
        <div className="flex items-center justify-between">
          <span className="text-body-sm font-semibold text-ink">Chat</span>
          <button
            type="button"
            onClick={onNewThread}
            className="inline-flex h-7 items-center gap-1.5 rounded-md bg-primary px-2.5 text-caption font-semibold text-white hover:bg-primary-hover"
          >
            <Plus className="size-3" aria-hidden /> New
          </button>
        </div>
        <div className="flex h-7 items-center gap-1.5 rounded-md border border-hairline bg-canvas px-2 text-caption">
          <Search className="size-3.5 text-ink-subtle" aria-hidden />
          <input
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search threads…"
            className="flex-1 bg-transparent text-body-sm placeholder:text-ink-subtle focus:outline-none"
          />
          <KbdHint keys={['⌘N']} />
        </div>
      </div>
      <div className="flex-1 overflow-auto pb-3">
        {groups.map((g, gi) => (
          <div key={g.label} className={cn(gi === 0 ? 'mt-1' : 'mt-4')}>
            <div className="px-4 pb-1.5 text-caption font-medium uppercase tracking-[0.06em] text-ink-subtle">
              {g.label}
            </div>
            {g.items.map((t) => {
              const isActive = t.id === activeId || t.active;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onSelect(t.id)}
                  className={cn(
                    'relative mx-2 mb-px w-[calc(100%-1rem)] cursor-pointer rounded-md px-2.5 py-2 text-left',
                    isActive ? 'bg-surface-3' : 'hover:bg-surface-2',
                  )}
                >
                  {isActive && (
                    <span
                      aria-hidden
                      className="absolute left-0 top-2 bottom-2 w-0.5 rounded-sm bg-primary"
                    />
                  )}
                  <div className="mb-0.5 flex items-center justify-between gap-2">
                    <span
                      className={cn(
                        'min-w-0 flex-1 truncate text-body-sm',
                        isActive && 'font-medium',
                      )}
                    >
                      {t.title}
                    </span>
                    <span className="shrink-0 whitespace-nowrap text-caption text-ink-subtle">
                      {t.updatedAtLabel}
                    </span>
                  </div>
                  {t.hint && (
                    <span className="inline-flex h-4 items-center rounded-sm bg-semantic-warning-tint px-1.5 text-[10px] font-semibold uppercase text-semantic-warning">
                      {t.hint}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </aside>
  );
}
