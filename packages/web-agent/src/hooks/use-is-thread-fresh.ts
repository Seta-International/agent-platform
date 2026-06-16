import { useSyncExternalStore } from 'react';
import {
  isThreadFresh as readIsThreadFresh,
  subscribeFreshThreads,
} from '../lib/fresh-thread-store';

/**
 * Subscribes to the fresh-thread store for a specific id. Returns `true` while
 * the id was minted client-side and the Mastra row hasn't been created yet,
 * `false` otherwise. Re-renders when the store mutates (either through the
 * mutation API or the cross-tab `storage` event).
 */
export function useIsThreadFresh(threadId: string | undefined): boolean {
  return useSyncExternalStore(
    subscribeFreshThreads,
    () => readIsThreadFresh(threadId),
    () => false,
  );
}
