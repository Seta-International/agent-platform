import { useSyncExternalStore } from 'react';

// Minimal pub/sub so a tool renderer can signal "approval roundtrip done — please
// refresh your view of this thread". ChatPane subscribes and bumps a revision key,
// forcing a remount that lets useThreadMessages pull the resumed history.
export interface ApprovalResolvedEvent {
  /** Thread the approval belonged to, when the renderer can determine it. */
  threadId?: string;
  /** Monotonic counter so subscribers can detect distinct events. */
  revision: number;
}

type Listener = () => void;
const listeners = new Set<Listener>();
let latest: ApprovalResolvedEvent = { revision: 0 };

export function notifyApprovalResolved(opts: { threadId?: string } = {}) {
  latest = { revision: latest.revision + 1, threadId: opts.threadId };
  for (const l of listeners) l();
}

function subscribe(cb: Listener) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function getSnapshot(): ApprovalResolvedEvent {
  return latest;
}

export function useApprovalResolvedEvent(): ApprovalResolvedEvent {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
