import type * as React from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../primitives/sheet';
import {
  NotificationListItem,
  type NotificationListItemNotification,
} from './notification-list-item';

export interface NotificationDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: NotificationListItemNotification[];
  hasMore: boolean;
  unreadCount: number;
  onMarkAll: () => void;
  onLoadMore: () => void;
  onMarkRead: (id: string) => void;
  onDismiss: (id: string) => void;
  isLoadingMore?: boolean;
}

export function NotificationDrawer({
  open,
  onOpenChange,
  items,
  hasMore,
  unreadCount,
  onMarkAll,
  onLoadMore,
  onMarkRead,
  onDismiss,
  isLoadingMore = false,
}: NotificationDrawerProps): React.ReactElement {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[420px] max-w-full p-0">
        <SheetHeader className="flex flex-row items-center justify-between border-b border-hairline px-4 py-3">
          <SheetTitle className="text-body-sm font-semibold">Notifications</SheetTitle>
          <button
            type="button"
            disabled={unreadCount === 0}
            onClick={onMarkAll}
            className="text-caption text-ink-muted hover:text-ink disabled:cursor-not-allowed disabled:text-ink-subtle"
          >
            Mark all as read
          </button>
        </SheetHeader>
        <div className="flex h-[calc(100%-49px)] flex-col overflow-y-auto">
          {items.length === 0 ? (
            <div className="flex flex-1 items-center justify-center p-6 text-caption text-ink-muted">
              No notifications yet.
            </div>
          ) : (
            <>
              {items.map((n) => (
                <article key={n.id}>
                  <NotificationListItem
                    notification={n}
                    onMarkRead={onMarkRead}
                    onDismiss={onDismiss}
                  />
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
      </SheetContent>
    </Sheet>
  );
}
