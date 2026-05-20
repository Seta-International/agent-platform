import { useVirtualizer } from '@tanstack/react-virtual';
import { useRef } from 'react';

interface Opts {
  count: number;
  estimateSize?: number;
}

export function useVirtualizedBucket({ count, estimateSize = 84 }: Opts) {
  const parentRef = useRef<HTMLDivElement | null>(null);
  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize,
    overscan: 5,
  });
  return { parentRef, virtualizer };
}
