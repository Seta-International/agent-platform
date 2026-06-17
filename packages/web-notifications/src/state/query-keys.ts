export const notificationKeys = {
  all: ['notifications'] as const,
  list: (opts: { unread?: boolean }) =>
    [...notificationKeys.all, 'list', opts.unread === true ? 'unread' : 'all'] as const,
  unreadCount: () => [...notificationKeys.all, 'unread-count'] as const,
  prefs: () => [...notificationKeys.all, 'prefs'] as const,
} as const;
