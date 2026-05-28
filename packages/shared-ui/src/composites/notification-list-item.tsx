import { ChevronRight, X } from 'lucide-react';
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
      <div className="line-clamp-2 text-body-sm font-medium text-ink">{title}</div>
      {body && <div className="line-clamp-2 text-caption text-ink-muted">{body}</div>}
      <div className="mt-1 text-caption text-ink-subtle">
        {formatRelative(new Date(notification.created_at))}
      </div>
    </>
  );

  return (
    <div
      className={cn(
        'group relative flex items-start gap-3 border-b border-hairline px-4 py-3 transition-colors',
        isUnread && 'bg-surface-2',
        onClick && 'cursor-pointer hover:bg-surface-1',
        className,
      )}
    >
      {/* Unread accent bar */}
      {isUnread && (
        <span
          data-testid="notification-unread-indicator"
          className="absolute left-0 top-0 h-full w-0.5 bg-primary"
          aria-hidden
        />
      )}

      {/* Icon slot */}
      {icon && <div className="mt-0.5 shrink-0 text-ink-muted">{icon}</div>}

      {/* Body — clickable when onClick is provided */}
      {onClick ? (
        <button
          type="button"
          onClick={() => {
            if (isUnread) onMarkRead?.(notification.id);
            onClick();
          }}
          className="group/body min-w-0 flex-1 cursor-pointer text-left focus:outline-none focus:ring-1 focus:ring-primary focus:rounded-sm"
        >
          {middleContent}
          <div className="mt-1 flex items-center gap-0.5 text-caption text-primary opacity-0 transition-opacity group-hover/body:opacity-100">
            <span>View</span>
            <ChevronRight className="size-3" aria-hidden />
          </div>
        </button>
      ) : (
        <div className="min-w-0 flex-1">{middleContent}</div>
      )}

      {/* Right-side controls */}
      <div className="flex shrink-0 flex-col items-center gap-1.5 self-stretch justify-start pt-0.5">
        {/* Unread dot — always visible for unread, click marks as read */}
        {isUnread && onMarkRead ? (
          <button
            type="button"
            aria-label="Mark as read"
            title="Mark as read"
            onClick={() => onMarkRead(notification.id)}
            className="size-2 rounded-full bg-primary transition-opacity hover:opacity-70 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1"
          />
        ) : (
          <span className="size-2" aria-hidden />
        )}

        {/* Dismiss — appears on hover */}
        {onDismiss && (
          <button
            type="button"
            aria-label="Dismiss"
            title="Dismiss"
            onClick={() => onDismiss(notification.id)}
            className="inline-flex size-5 items-center justify-center rounded text-ink-subtle opacity-0 transition-opacity hover:bg-surface-3 hover:text-ink group-hover:opacity-100 focus:opacity-100 focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <X className="size-3" aria-hidden />
          </button>
        )}
      </div>
    </div>
  );
}
