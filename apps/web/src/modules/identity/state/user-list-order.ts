import { useSyncExternalStore } from 'react';

let ids: ReadonlyArray<string> = [];
const subscribers = new Set<() => void>();

function subscribe(cb: () => void): () => void {
  subscribers.add(cb);
  return () => {
    subscribers.delete(cb);
  };
}

function snapshot(): ReadonlyArray<string> {
  return ids;
}

export function setUserListOrder(next: ReadonlyArray<string>): void {
  ids = next;
  for (const cb of subscribers) cb();
}

export function getNeighbors(userId: string): { prev: string | null; next: string | null } {
  const i = ids.indexOf(userId);
  if (i < 0) return { prev: null, next: null };
  return {
    prev: i > 0 ? (ids[i - 1] ?? null) : null,
    next: i < ids.length - 1 ? (ids[i + 1] ?? null) : null,
  };
}

export function useUserListOrder(): ReadonlyArray<string> {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

// Test-only — never call from app code.
export function _resetForTests(): void {
  ids = [];
}
