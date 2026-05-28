import {
  NotificationListItem,
  type NotificationListItemNotification,
  NotificationPopover,
} from '@seta/shared-ui';
import { useLocation } from '@tanstack/react-router';
import { Bell } from 'lucide-react';
import * as React from 'react';
import { useResolvePlannerNotification } from '../../planner/notifications/renderers';
import { useDismiss, useMarkAllRead, useMarkRead } from '../hooks/mutations';
import { useNotifications } from '../hooks/useNotifications';
import { useUnreadCount } from '../hooks/useUnreadCount';
import { useResolveAgentNotification } from '../renderers/agent-renderers';

export function NotificationPopoverContainer(): React.ReactElement {
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
      className="relative inline-flex size-6 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
      aria-label={count > 0 ? `Notifications (${count})` : 'Notifications'}
      title="Notifications"
    >
      <Bell className="size-3.5" aria-hidden />
      {count > 0 && (
        <span
          className="absolute -right-1 -top-1 flex min-w-[16px] items-center justify-center rounded-full bg-primary px-0.5 py-px text-[10px] font-bold leading-none text-white"
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
          onMarkRead={(id) => markRead.mutate(id)}
          onDismiss={(id) => dismiss.mutate(id)}
        />
      )}
    />
  );
}

function PopoverRow({
  notification,
  onMarkRead,
  onDismiss,
}: {
  notification: NotificationListItemNotification;
  onMarkRead: (id: string) => void;
  onDismiss: (id: string) => void;
}): React.ReactElement {
  const planner = useResolvePlannerNotification(notification);
  const agent = useResolveAgentNotification(notification);
  const { icon, onClick } = planner.icon ? planner : agent;
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
