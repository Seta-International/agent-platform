import type { GroupActivityItem } from '@seta/planner';
import { Avatar, Button, formatRelative } from '@seta/shared-ui';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  ArrowLeftRight,
  Check,
  CheckCircle2,
  Columns3,
  FolderKanban,
  type LucideIcon,
  Pencil,
  Plus,
  RotateCcw,
  Tag,
  Trash2,
  UserMinus,
  UserPlus,
  Users,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useGroupActivityFeed } from '../hooks/queries/use-group-activity-feed';
import { useGroupActivityLive } from '../hooks/use-group-activity-live';
import { buildActivityLabel } from '../lib/build-activity-label';
import { absoluteActivityTime } from '../lib/format-activity-time';

interface Props {
  groupId: string;
}

// Map an event type to a category glyph + tint so the feed is scannable at a glance.
function eventVisual(eventType: string): { Icon: LucideIcon; tint: string } {
  if (eventType.endsWith('.completed')) return { Icon: CheckCircle2, tint: '#1f8a4c' };
  if (eventType.endsWith('.reopened') || eventType.endsWith('.restored'))
    return { Icon: RotateCcw, tint: '#b86e00' };
  if (eventType.endsWith('.deleted') || eventType.endsWith('.removed'))
    return { Icon: Trash2, tint: '#c53030' };
  if (eventType.endsWith('.created') || eventType.endsWith('.added'))
    return { Icon: Plus, tint: '#0047ff' };
  if (eventType.endsWith('.assigned')) return { Icon: UserPlus, tint: '#207087' };
  if (eventType.endsWith('.unassigned')) return { Icon: UserMinus, tint: '#7a2f7c' };
  if (eventType.endsWith('.moved')) return { Icon: ArrowLeftRight, tint: '#0047ff' };
  if (eventType.includes('.member.')) return { Icon: Users, tint: '#207087' };
  if (eventType.includes('.label.')) return { Icon: Tag, tint: '#c0367f' };
  if (eventType.includes('.bucket.')) return { Icon: Columns3, tint: '#7a2f7c' };
  if (eventType.includes('.plan.')) return { Icon: FolderKanban, tint: '#0047ff' };
  if (eventType.includes('.checklist.')) return { Icon: Check, tint: '#1f8a4c' };
  return { Icon: Pencil, tint: '#64748b' };
}

function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

const dayHeadingFmt = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
});

function dayLabel(iso: string): string {
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const key = dayKey(iso);
  if (key === dayKey(now.toISOString())) return 'Today';
  if (key === dayKey(yesterday.toISOString())) return 'Yesterday';
  return dayHeadingFmt.format(new Date(iso));
}

function ShimmerRow() {
  return (
    <div className="flex items-start gap-3 py-3 border-b border-border animate-pulse">
      <div className="size-9 rounded-full bg-surface shrink-0" />
      <div className="flex-1 space-y-2 pt-1">
        <div className="h-4 w-3/4 rounded bg-surface" />
        <div className="h-3 w-1/4 rounded bg-surface" />
      </div>
    </div>
  );
}

function DateDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 pt-5 pb-1 first:pt-1">
      <span className="text-xs font-semibold uppercase tracking-wide text-secondary">{label}</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

function ActivityRow({ item, dateHeader }: { item: GroupActivityItem; dateHeader: string | null }) {
  const actor = item.actor_display_name ?? 'Someone';
  const label = buildActivityLabel(item);
  const rest = label.startsWith(actor) ? label.slice(actor.length) : null;
  const { Icon, tint } = eventVisual(item.event_type);

  return (
    <>
      {dateHeader && <DateDivider label={dateHeader} />}
      <div className="flex items-start gap-3 py-3 border-b border-border">
        <div className="relative shrink-0">
          <Avatar name={item.actor_display_name ?? undefined} size={36} />
          <span
            className="absolute -bottom-1 -right-1 flex size-4 items-center justify-center rounded-full ring-2 ring-card"
            style={{ background: tint }}
            aria-hidden="true"
          >
            <Icon className="size-2.5 text-white" strokeWidth={2.5} />
          </span>
        </div>
        <div className="flex-1 min-w-0 pt-0.5">
          <p className="text-sm text-primary">
            {rest === null ? (
              label
            ) : (
              <>
                <span className="font-semibold">{actor}</span>
                {rest}
              </>
            )}
          </p>
          <p
            className="text-xs text-secondary mt-0.5"
            title={absoluteActivityTime(item.occurred_at)}
          >
            {formatRelative(item.occurred_at)}
          </p>
        </div>
      </div>
    </>
  );
}

export function ActivityFeedTab({ groupId }: Props) {
  const { data, isLoading, isError, refetch, hasNextPage, isFetchingNextPage, fetchNextPage } =
    useGroupActivityFeed(groupId);

  const containerRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const { pendingCount, flush } = useGroupActivityLive(groupId);
  const [scrollEl, setScrollEl] = useState<HTMLElement | null>(null);
  const [atTop, setAtTop] = useState(true);

  // Resolve the scroll-owning ancestor (the tab panel) once the feed mounts. Used for
  // at-top detection and "jump to top" — the virtualizer keeps its own scroll element.
  const rootRef = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    let el: HTMLElement | null = node.parentElement;
    while (el) {
      const oy = getComputedStyle(el).overflowY;
      if (oy === 'auto' || oy === 'scroll') break;
      el = el.parentElement;
    }
    setScrollEl(el);
  }, []);

  useEffect(() => {
    if (!scrollEl) return;
    const onScroll = () => setAtTop(scrollEl.scrollTop <= 8);
    scrollEl.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => scrollEl.removeEventListener('scroll', onScroll);
  }, [scrollEl]);

  // At the top, apply new events immediately (prepend); otherwise the pill collects them.
  useEffect(() => {
    if (pendingCount > 0 && atTop) flush();
  }, [pendingCount, atTop, flush]);

  const items = data?.pages.flatMap((p) => p.items) ?? [];

  const rowVirtualizer = useVirtualizer({
    count: items.length + 1, // +1 for sentinel / shimmer row
    getScrollElement: () => containerRef.current,
    estimateSize: () => 72,
    overscan: 5,
  });

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          void fetchNextPage();
        }
      },
      { threshold: 0.1 },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (isLoading) {
    return (
      <div className="py-2">
        {Array.from({ length: 5 }).map((_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static shimmer list
          <ShimmerRow key={i} />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3" role="alert">
        <p className="text-base text-secondary">Failed to load activity.</p>
        <Button size="sm" variant="secondary" label="Try again" onClick={() => void refetch()} />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-1 py-16 text-center">
        <p className="text-base text-primary">No activity yet in this group.</p>
        <p className="text-sm text-secondary">
          Plan, task, and membership changes will show up here as they happen.
        </p>
      </div>
    );
  }

  const virtualItems = rowVirtualizer.getVirtualItems();

  return (
    <div ref={rootRef} className="flex flex-col gap-1 pb-2">
      {pendingCount > 0 && !atTop ? (
        <Button
          size="sm"
          label={`${pendingCount} new ${pendingCount === 1 ? 'activity' : 'activities'} — jump to top`}
          onClick={() => {
            scrollEl?.scrollTo({ top: 0, behavior: 'smooth' });
            flush();
          }}
          className="sticky top-2 z-10 mx-auto rounded-full shadow-sm"
        />
      ) : (
        <div className="flex items-center gap-2 pb-1 text-xs font-medium text-secondary">
          <span className="relative flex size-2" aria-hidden="true">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
            <span className="relative inline-flex size-2 rounded-full bg-success" />
          </span>
          Live · updates automatically
        </div>
      )}

      <div
        ref={containerRef}
        style={{ height: rowVirtualizer.getTotalSize(), position: 'relative' }}
      >
        {virtualItems.map((virtualRow) => {
          const isLast = virtualRow.index === items.length;
          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={rowVirtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              {isLast ? (
                <div ref={sentinelRef} aria-hidden="true">
                  {isFetchingNextPage && (
                    <>
                      <ShimmerRow />
                      <ShimmerRow />
                    </>
                  )}
                </div>
              ) : (
                (() => {
                  const item = items[virtualRow.index] as GroupActivityItem;
                  const prev = items[virtualRow.index - 1];
                  const dateHeader =
                    !prev || dayKey(prev.occurred_at) !== dayKey(item.occurred_at)
                      ? dayLabel(item.occurred_at)
                      : null;
                  return <ActivityRow item={item} dateHeader={dateHeader} />;
                })()
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
