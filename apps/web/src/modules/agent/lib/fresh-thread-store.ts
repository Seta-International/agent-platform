/**
 * Tracks thread ids that were minted by the client and don't yet have a Mastra
 * row on the server. Backed by `sessionStorage` so the route's `beforeLoad`
 * redirect and the AgentProvider observe the same set without sharing React
 * state across the route → provider boundary.
 *
 * Subscribers (typically via `useSyncExternalStore` in
 * `useIsThreadFresh`) are notified whenever the set mutates — both via the
 * mutation API in this module and via the cross-tab `storage` event.
 *
 * The set is session-scoped: on a page reload, a uuid that was never sent is
 * no longer in the set, so the messages query falls back to the 404 path on
 * the server and the mastra-thread-list-adapter synthesizes empty metadata.
 */
const STORAGE_KEY = 'seta.agent.freshThreadIds';

type Listener = () => void;
const listeners = new Set<Listener>();

function read(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((v): v is string => typeof v === 'string'));
  } catch {
    return new Set();
  }
}

function write(set: Set<string>): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
  } catch {
    // Storage quota / disabled storage — drop the change silently; the 404
    // fallback on the messages query still produces correct behavior.
  }
}

function notify(): void {
  for (const l of listeners) l();
}

// Cross-tab consistency: another tab marking an id fresh/known should update
// every subscriber here too.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY) notify();
  });
}

export function markThreadFresh(id: string): void {
  const set = read();
  if (set.has(id)) return;
  set.add(id);
  write(set);
  notify();
}

export function markThreadKnown(id: string): void {
  const set = read();
  if (!set.delete(id)) return;
  write(set);
  notify();
}

export function isThreadFresh(id: string | undefined): boolean {
  if (!id || typeof window === 'undefined') return false;
  return read().has(id);
}

export function subscribeFreshThreads(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function snapshotFreshThreadIds(): ReadonlySet<string> {
  return read();
}
