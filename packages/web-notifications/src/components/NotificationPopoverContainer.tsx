import {
  NotificationListItem,
  type NotificationListItemNotification,
  NotificationPopover,
} from '@seta/shared-ui';
import { useLocation } from '@tanstack/react-router';
import { Bell } from 'lucide-react';
import * as React from 'react';
import { useDismiss, useMarkAllRead, useMarkRead } from '../hooks/mutations.ts';
import { useNotifications } from '../hooks/useNotifications.ts';
import { useUnreadCount } from '../hooks/useUnreadCount.ts';

export interface NotificationResolution {
  icon?: React.ReactNode;
  onClick?: () => void;
}

/**
 * A resolver is a React hook mapping a notification to an optional icon + click
 * handler. Feature modules supply their own; the popover calls them in fixed
 * array order (Rules-of-Hooks safe because the array is static) and uses the
 * first result whose `icon` is set.
 */
export type NotificationResolver = (
  notification: NotificationListItemNotification,
) => NotificationResolution;

export function NotificationPopoverContainer({
  resolvers = [],
}: {
  resolvers?: readonly NotificationResolver[];
}): React.ReactElement {
  const [filter, setFilter] = React.useState<'all' | 'unread'>('all');
  const { items, hasNextPage, fetchNextPage, isFetchingNextPage } = useNotifications({
    unread: filter === 'unread',
  });
  const { count } = useUnreadCount();
  const markRead = useMarkRead();
  const markAll = useMarkAllRead();
  const dismiss = useDismiss();
  const [open, setOpen] = React.useState(false);
  const location = useLocation();

  // Close when the user navigates to a different page
  const pathname = location.pathname;
  const prevPathname = React.useRef(pathname);
  React.useEffect(() => {
    if (prevPathname.current !== pathname) {
      prevPathname.current = pathname;
      setOpen(false);
    }
  }, [pathname]);

  const trigger = (
    <button
      type="button"
      className="relative inline-flex size-8 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
      aria-label={count > 0 ? `Notifications (${count})` : 'Notifications'}
      title="Notifications"
    >
      <Bell className="size-4" aria-hidden />
      {count > 0 && (
        <span
          className="absolute right-0.5 top-0.5 flex min-w-[16px] items-center justify-center rounded-full bg-primary px-0.5 py-px text-[10px] font-bold leading-none text-white ring-2 ring-canvas"
          aria-hidden
        >
          {count > 9 ? '9+' : count}
        </span>
      )}
    </button>
  );

  return (
    <NotificationPopover
      open={open}
      onOpenChange={setOpen}
      filter={filter}
      onFilterChange={setFilter}
      trigger={trigger}
      items={items}
      hasMore={hasNextPage}
      isLoadingMore={isFetchingNextPage}
      unreadCount={count}
      onMarkAll={() => markAll.mutate()}
      onLoadMore={() => {
        void fetchNextPage();
      }}
      onMarkRead={(id) => markRead.mutate(id)}
      onDismiss={(id) => dismiss.mutate(id)}
      renderItem={(n) => (
        <PopoverRow
          notification={n}
          resolvers={resolvers}
          onMarkRead={(id) => markRead.mutate(id)}
          onDismiss={(id) => dismiss.mutate(id)}
        />
      )}
    />
  );
}

function PopoverRow({
  notification,
  resolvers,
  onMarkRead,
  onDismiss,
}: {
  notification: NotificationListItemNotification;
  resolvers: readonly NotificationResolver[];
  onMarkRead: (id: string) => void;
  onDismiss: (id: string) => void;
}): React.ReactElement {
  // Static array => the hook count is stable across renders (Rules-of-Hooks safe).
  // First resolver that produces an icon wins, preserving caller-defined precedence.
  const resolved = resolvers.map((resolve) => resolve(notification));
  const { icon, onClick } = resolved.find((r) => r.icon) ?? {};
  return (
    <NotificationListItem
      notification={notification}
      onMarkRead={onMarkRead}
      onDismiss={onDismiss}
      icon={icon}
      onClick={onClick}
    />
  );
}
