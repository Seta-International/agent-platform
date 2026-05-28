import { Bell } from 'lucide-react';
import type * as React from 'react';
import { Button } from '../primitives/button';
import { Popover, PopoverContent, PopoverTrigger } from '../primitives/popover';
import {
  NotificationListItem,
  type NotificationListItemNotification,
} from './notification-list-item';

export type NotificationFilter = 'all' | 'unread';

export interface NotificationPopoverProps {
  /** The element that triggers the popover (e.g. the bell button). */
  trigger: React.ReactNode;
  items: NotificationListItemNotification[];
  hasMore: boolean;
  unreadCount: number;
  onMarkAll: () => void;
  onLoadMore: () => void;
  onMarkRead: (id: string) => void;
  onDismiss: (id: string) => void;
  isLoadingMore?: boolean;
  renderItem?: (n: NotificationListItemNotification) => React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  filter?: NotificationFilter;
  onFilterChange?: (filter: NotificationFilter) => void;
}

export function NotificationPopover({
  trigger,
  items,
  hasMore,
  unreadCount,
  onMarkAll,
  onLoadMore,
  onMarkRead,
  onDismiss,
  isLoadingMore = false,
  renderItem,
  open,
  onOpenChange,
  filter = 'all',
  onFilterChange,
}: NotificationPopoverProps): React.ReactElement {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        collisionPadding={8}
        className="flex w-[calc(100vw-16px)] flex-col p-0 sm:w-[400px]"
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-hairline px-4 py-2">
          <Bell className="size-4 shrink-0 text-ink-muted" aria-hidden />
          <div className="flex items-center gap-0.5">
            {(['all', 'unread'] as const).map((f) => (
              <Button
                key={f}
                type="button"
                size="sm"
                variant={filter === f ? 'secondary' : 'ghost'}
                onClick={() => onFilterChange?.(f)}
              >
                {f === 'all' ? 'All' : 'Unread'}
                {f === 'unread' && unreadCount > 0 && (
                  <span className="ml-0.5 rounded-full bg-primary px-1.5 py-px text-[10px] font-bold leading-none text-white">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </Button>
            ))}
          </div>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={unreadCount === 0}
            onClick={onMarkAll}
            className="ml-auto text-ink-muted"
          >
            Mark all read
          </Button>
        </div>
        <div
          className="min-h-[160px] overflow-y-auto overscroll-contain"
          style={{ maxHeight: 'min(480px, 60svh)' }}
        >
          {items.length === 0 ? (
            <div className="flex h-[160px] items-center justify-center text-caption text-ink-muted">
              No notifications yet.
            </div>
          ) : (
            <>
              {items.map((n) => (
                <article key={n.id}>
                  {renderItem ? (
                    renderItem(n)
                  ) : (
                    <NotificationListItem
                      notification={n}
                      onMarkRead={onMarkRead}
                      onDismiss={onDismiss}
                    />
                  )}
                </article>
              ))}
              {hasMore && (
                <div className="flex justify-center p-3">
                  <button
                    type="button"
                    onClick={onLoadMore}
                    disabled={isLoadingMore}
                    className="text-caption text-ink-muted hover:text-ink disabled:text-ink-subtle"
                  >
                    {isLoadingMore ? 'Loading…' : 'Load more'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
