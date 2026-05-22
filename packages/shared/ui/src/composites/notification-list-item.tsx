import { Check, X } from 'lucide-react';
import type * as React from 'react';
import { cn } from '../lib/cn';
import { formatRelative } from '../lib/format-relative';

export interface NotificationListItemNotification {
  id: string;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: string;
  read_at: string | null;
}

export interface NotificationListItemProps {
  notification: NotificationListItemNotification;
  onMarkRead?: (id: string) => void;
  onDismiss?: (id: string) => void;
  onClick?: () => void;
  icon?: React.ReactNode;
  className?: string;
}

function pickString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export function NotificationListItem({
  notification,
  onMarkRead,
  onDismiss,
  onClick,
  icon,
  className,
}: NotificationListItemProps): React.ReactElement {
  const title = pickString(notification.payload?.title) ?? notification.event_type;
  const body = pickString(notification.payload?.body);
  const isUnread = notification.read_at === null;

  const middleContent = (
    <>
      <div className="truncate text-body-sm font-medium text-ink">{title}</div>
      {body && <div className="line-clamp-2 text-caption text-ink-muted">{body}</div>}
      <div className="mt-1 text-caption text-ink-subtle">
        {formatRelative(new Date(notification.created_at))}
      </div>
    </>
  );

  return (
    <div
      className={cn(
        'group relative flex items-start gap-3 border-b border-hairline px-4 py-3',
        isUnread && 'bg-surface-2',
        className,
      )}
    >
      {isUnread && (
        <span
          data-testid="notification-unread-indicator"
          className="absolute left-0 top-0 h-full w-0.5 bg-primary"
          aria-hidden
        />
      )}
      {icon && <div className="shrink-0 text-ink-muted">{icon}</div>}
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          className="min-w-0 flex-1 cursor-pointer rounded-md text-left hover:bg-surface-3 focus:outline-none focus:ring-1 focus:ring-primary"
        >
          {middleContent}
        </button>
      ) : (
        <div className="min-w-0 flex-1">{middleContent}</div>
      )}
      <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        {isUnread && onMarkRead && (
          <button
            type="button"
            aria-label="Mark as read"
            title="Mark as read"
            onClick={() => onMarkRead(notification.id)}
            className="inline-flex size-6 items-center justify-center rounded-md text-ink-muted hover:bg-surface-3 hover:text-ink"
          >
            <Check className="size-3.5" aria-hidden />
          </button>
        )}
        {onDismiss && (
          <button
            type="button"
            aria-label="Dismiss"
            title="Dismiss"
            onClick={() => onDismiss(notification.id)}
            className="inline-flex size-6 items-center justify-center rounded-md text-ink-muted hover:bg-surface-3 hover:text-ink"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        )}
      </div>
    </div>
  );
}
