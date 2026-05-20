import { useVirtualizer } from '@tanstack/react-virtual';
import { useRef } from 'react';

interface Opts {
  count: number;
  estimateSize?: number;
  enabled: boolean;
}

export function useVirtualizedBucket({ count, estimateSize = 84, enabled }: Opts) {
  const parentRef = useRef<HTMLDivElement | null>(null);
  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize,
    enabled,
    overscan: 5,
  });
  return { parentRef, virtualizer };
}
