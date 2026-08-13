import type { TablePlugin } from '@astryxdesign/core/Table';
import { useEffect, useMemo, useRef, useState } from 'react';

export interface SyncScrollbarProps {
  /** The scrollable element to sync with (e.g. KanbanBoard or Table container). */
  scrollEl: HTMLElement | null;
  /** Optional custom class name. */
  className?: string;
}

/**
 * A sticky-bottom scrollbar synced to a scrollable element's horizontal scroll.
 * Remains accessible at the viewport bottom when content overflows horizontally,
 * so users do not need to scroll all the way down to reach the horizontal scrollbar.
 * Automatically hides when no horizontal overflow exists (`scrollWidth <= clientWidth`).
 */
export function SyncScrollbar({ scrollEl, className = '' }: SyncScrollbarProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const spacerRef = useRef<HTMLDivElement>(null);
  const syncing = useRef(false);
  const [isOverflowing, setIsOverflowing] = useState(false);

  // 1. Monitor horizontal overflow of scrollEl
  useEffect(() => {
    const el = scrollEl;
    if (!el) {
      setIsOverflowing(false);
      return;
    }

    const checkOverflow = () => {
      setIsOverflowing(el.scrollWidth > el.clientWidth);
    };

    checkOverflow();
    const ro = new ResizeObserver(checkOverflow);
    ro.observe(el);

    return () => {
      ro.disconnect();
    };
  }, [scrollEl]);

  // 2. Synchronize scroll positions once mounted & overflowing
  useEffect(() => {
    const el = scrollEl;
    const bar = barRef.current;
    if (!el || !bar || !isOverflowing) return;

    if (spacerRef.current) {
      spacerRef.current.style.width = `${el.scrollWidth}px`;
    }

    const onElScroll = () => {
      if (syncing.current) return;
      syncing.current = true;
      bar.scrollLeft = el.scrollLeft;
      syncing.current = false;
    };

    const onBarScroll = () => {
      if (syncing.current) return;
      syncing.current = true;
      el.scrollLeft = bar.scrollLeft;
      syncing.current = false;
    };

    el.addEventListener('scroll', onElScroll, { passive: true });
    bar.addEventListener('scroll', onBarScroll, { passive: true });

    return () => {
      el.removeEventListener('scroll', onElScroll);
      bar.removeEventListener('scroll', onBarScroll);
    };
  }, [scrollEl, isOverflowing]);

  if (!scrollEl || !isOverflowing) return null;

  return (
    <div
      ref={barRef}
      role="presentation"
      className={`sticky bottom-0 z-10 overflow-x-auto border-t border-border ${className}`}
      style={{ background: 'var(--color-surface-raised)' }}
    >
      <div ref={spacerRef} className="h-2.5" />
    </div>
  );
}

/**
 * Astryx Table plugin that exposes the table's inner scroll container ref
 * and optionally hides its native scrollbar for use with SyncScrollbar.
 */
export function useTableScrollSync<T extends Record<string, unknown>>(
  onScrollEl: (el: HTMLDivElement | null) => void,
  hideNativeScrollbar = true,
): TablePlugin<T> {
  return useMemo(
    () => ({
      transformScrollWrapper: (props) => ({
        ...props,
        htmlProps: {
          ...props.htmlProps,
          ref: onScrollEl,
          style: {
            ...props.htmlProps?.style,
            ...(hideNativeScrollbar ? { scrollbarWidth: 'none' } : {}),
          },
        },
      }),
    }),
    [onScrollEl, hideNativeScrollbar],
  );
}
