import {
  NotificationDrawer,
  NotificationListItem,
  type NotificationListItemNotification,
} from '@seta/shared-ui';
import type * as React from 'react';
import { useResolvePlannerNotification } from '../../planner/notifications/renderers';
import { useDismiss, useMarkAllRead, useMarkRead } from '../hooks/mutations';
import { useNotifications } from '../hooks/useNotifications';
import { useUnreadCount } from '../hooks/useUnreadCount';

export function NotificationDrawerContainer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}): React.ReactElement {
  const { items, hasNextPage, fetchNextPage, isFetchingNextPage } = useNotifications({
    unread: false,
  });
  const { count } = useUnreadCount();
  const markRead = useMarkRead();
  const markAll = useMarkAllRead();
  const dismiss = useDismiss();

  return (
    <NotificationDrawer
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
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
        <DrawerRow
          notification={n}
          onMarkRead={(id) => markRead.mutate(id)}
          onDismiss={(id) => dismiss.mutate(id)}
          onClose={onClose}
        />
      )}
    />
  );
}

function DrawerRow({
  notification,
  onMarkRead,
  onDismiss,
  onClose,
}: {
  notification: NotificationListItemNotification;
  onMarkRead: (id: string) => void;
  onDismiss: (id: string) => void;
  onClose: () => void;
}): React.ReactElement {
  const { icon, onClick } = useResolvePlannerNotification(notification);
  return (
    <NotificationListItem
      notification={notification}
      onMarkRead={onMarkRead}
      onDismiss={onDismiss}
      icon={icon}
      onClick={
        onClick
          ? () => {
              onClick();
              onClose();
            }
          : undefined
      }
    />
  );
}
