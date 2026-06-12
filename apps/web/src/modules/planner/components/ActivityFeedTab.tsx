import type { GroupActivityItem } from '@seta/planner';
import { Button, formatRelative } from '@seta/shared-ui';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useGroupActivityFeed } from '../hooks/queries/use-group-activity-feed';
import { useGroupActivityLive } from '../hooks/use-group-activity-live';
import { buildActivityLabel } from '../lib/build-activity-label';
import { absoluteActivityTime } from '../lib/format-activity-time';

interface Props {
  groupId: string;
}

function ShimmerRow() {
  return (
    <div className="flex items-start gap-3 py-4 border-b border-hairline animate-pulse">
      <div className="h-8 w-8 rounded-full bg-surface-2 shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-4 w-3/4 rounded bg-surface-2" />
        <div className="h-3 w-1/4 rounded bg-surface-2" />
      </div>
    </div>
  );
}

function ActivityRow({ item }: { item: GroupActivityItem }) {
  const initials = item.actor_display_name
    ? item.actor_display_name
        .split(' ')
        .map((p) => p[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : '?';

  return (
    <div className="flex items-start gap-3 py-4 border-b border-hairline">
      <div
        className="h-8 w-8 rounded-full bg-primary-tint text-primary-ink flex items-center justify-center text-xs font-semibold shrink-0"
        aria-hidden="true"
      >
        {initials}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-body-sm text-ink">{buildActivityLabel(item)}</p>
        <p
          className="text-caption text-ink-subtle mt-0.5"
          title={absoluteActivityTime(item.occurred_at)}
        >
          {formatRelative(item.occurred_at)}
        </p>
      </div>
    </div>
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
        <p className="text-body-sm text-ink-subtle">Failed to load activity.</p>
        <button
          type="button"
          onClick={() => void refetch()}
          className="text-sm text-primary underline hover:no-underline"
        >
          Try again
        </button>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-body-sm text-ink-subtle">No activity yet in this group.</p>
      </div>
    );
  }

  const virtualItems = rowVirtualizer.getVirtualItems();

  return (
    <div ref={rootRef} className="flex flex-col gap-1 pb-2">
      {pendingCount > 0 && !atTop ? (
        <Button
          size="sm"
          onClick={() => {
            scrollEl?.scrollTo({ top: 0, behavior: 'smooth' });
            flush();
          }}
          className="sticky top-2 z-10 mx-auto rounded-full shadow-sm"
        >
          {pendingCount} new {pendingCount === 1 ? 'activity' : 'activities'} — jump to top
        </Button>
      ) : (
        <p className="text-caption text-ink-subtle">All events · live</p>
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
                <ActivityRow item={items[virtualRow.index] as GroupActivityItem} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
