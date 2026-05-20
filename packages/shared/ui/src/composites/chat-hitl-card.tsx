import { ShieldCheck } from 'lucide-react';
import * as React from 'react';
import { cn } from '../lib/cn';

export interface ChatHitlCardProps {
  title: string;
  toolName: string;
  /** Optional deadline. When omitted, the card never expires and shows no countdown. */
  expiresAt?: Date | null;
  permissionHint?: string;
  onApprove: () => void;
  onReject: (note?: string) => void;
  onEdit?: () => void;
  pending?: 'approve' | 'reject' | null;
  className?: string;
  children: React.ReactNode;
}

export function ChatHitlCard({
  title,
  toolName,
  expiresAt,
  permissionHint,
  onApprove,
  onReject,
  onEdit,
  pending,
  className,
  children,
}: ChatHitlCardProps) {
  const deadlineMs = expiresAt instanceof Date ? expiresAt.getTime() : 0;
  const hasDeadline = deadlineMs > 0;
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (!hasDeadline) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [hasDeadline]);
  const expired = hasDeadline && deadlineMs <= now;
  const remaining = hasDeadline ? Math.max(0, deadlineMs - now) : 0;
  const remainingLabel = !hasDeadline
    ? ''
    : expired
      ? 'expired'
      : `expires in ${Math.floor(remaining / 60_000)}m ${Math.floor((remaining % 60_000) / 1000)}s`;
  return (
    <div className={cn('ml-9', className)}>
      <div className="overflow-hidden rounded-xl border-[1.5px] border-primary-border shadow-[0_0_0_4px_var(--color-primary-tint)] bg-canvas">
        <div className="flex items-center gap-2 border-b border-primary-border bg-primary-tint px-3.5 py-2.5">
          <ShieldCheck className="size-3.5 text-primary" aria-hidden />
          <span className="text-body-sm font-semibold text-primary-ink">
            Confirm before running
          </span>
          {remainingLabel && (
            <span className="ml-auto text-caption text-primary-ink opacity-70">
              {remainingLabel}
            </span>
          )}
        </div>
        <div className="px-4 py-3.5">
          <div className="mb-2.5 flex items-start justify-between">
            <div>
              <div className="text-body font-semibold">{title}</div>
              <div className="mt-0.5 font-mono text-caption text-ink-subtle">{toolName}</div>
            </div>
          </div>
          {children}
          <div className="mt-3 flex items-center justify-between gap-3">
            {permissionHint ? (
              <div className="text-caption text-ink-subtle">{permissionHint}</div>
            ) : (
              <span />
            )}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onReject()}
                disabled={Boolean(pending)}
                className="rounded-md px-2.5 py-1.5 text-body-sm hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {pending === 'reject' ? 'Rejecting…' : 'Reject'}
              </button>
              {onEdit && (
                <button
                  type="button"
                  onClick={onEdit}
                  disabled={Boolean(pending)}
                  className="rounded-md border border-hairline px-2.5 py-1.5 text-body-sm disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Edit fields
                </button>
              )}
              <button
                type="button"
                onClick={onApprove}
                disabled={expired || Boolean(pending)}
                className="rounded-md bg-primary px-2.5 py-1.5 text-body-sm font-semibold text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                {pending === 'approve' ? 'Approving…' : 'Approve & run'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
