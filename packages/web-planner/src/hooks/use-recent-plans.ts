import { useCallback, useSyncExternalStore } from 'react';

export interface RecentPlan {
  planId: string;
  planName: string;
  visitedAt: number;
}

const MAX_RECENTS = 5;

const storageKey = (tenantId: string) => `planner.recents.${tenantId}`;

// Stable empty reference so getSnapshot never returns a fresh [] (which would
// make useSyncExternalStore loop).
const EMPTY: readonly RecentPlan[] = Object.freeze([]);

// ── Shared reactive store ────────────────────────────────────────────────────
// localStorage is the source of truth; every useRecentPlans instance subscribes
// to the same listener set, so a visit/rename recorded by one consumer (e.g. the
// plan board) is observed by the others (e.g. the sidebar's Recent list) without
// a remount/refresh. See FUT-26.

const listeners = new Set<() => void>();

// Memoize the parsed snapshot per tenant, keyed on the raw stored string, so
// getSnapshot returns a stable reference until the underlying value changes.
const snapshotMemo = new Map<string, { raw: string | null; value: RecentPlan[] }>();

function readRaw(tenantId: string): string | null {
  try {
    return localStorage.getItem(storageKey(tenantId));
  } catch {
    // localStorage unavailable (e.g. private-mode SecurityError) — degrade to empty.
    return null;
  }
}

function parse(raw: string | null): RecentPlan[] {
  if (!raw) return EMPTY as RecentPlan[];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return EMPTY as RecentPlan[];
    const valid = parsed.filter(
      (v): v is RecentPlan =>
        typeof v === 'object' &&
        v !== null &&
        typeof (v as RecentPlan).planId === 'string' &&
        typeof (v as RecentPlan).planName === 'string' &&
        typeof (v as RecentPlan).visitedAt === 'number',
    );
    return valid.length === 0 ? (EMPTY as RecentPlan[]) : valid;
  } catch {
    return EMPTY as RecentPlan[];
  }
}

function getSnapshot(tenantId: string): RecentPlan[] {
  const raw = readRaw(tenantId);
  const memo = snapshotMemo.get(tenantId);
  if (memo && memo.raw === raw) return memo.value;
  const value = parse(raw);
  snapshotMemo.set(tenantId, { raw, value });
  return value;
}

function persist(tenantId: string, recents: RecentPlan[]): void {
  try {
    if (recents.length === 0) {
      localStorage.removeItem(storageKey(tenantId));
      return;
    }
    localStorage.setItem(storageKey(tenantId), JSON.stringify(recents));
  } catch {
    // localStorage unavailable — silently skip persistence rather than crash.
  }
}

function commit(tenantId: string, next: RecentPlan[]): void {
  persist(tenantId, next);
  for (const listener of listeners) listener();
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

function recordVisitImpl(tenantId: string, planId: string, planName: string): void {
  const prev = getSnapshot(tenantId);
  const filtered = prev.filter((r) => r.planId !== planId);
  const next: RecentPlan[] = [{ planId, planName, visitedAt: Date.now() }, ...filtered].slice(
    0,
    MAX_RECENTS,
  );
  commit(tenantId, next);
}

function evictImpl(tenantId: string, planId: string): void {
  const prev = getSnapshot(tenantId);
  const next = prev.filter((r) => r.planId !== planId);
  if (next.length === prev.length) return; // nothing to evict — avoid a spurious notify
  commit(tenantId, next);
}

export interface UseRecentPlans {
  recents: RecentPlan[];
  recordVisit: (planId: string, planName: string) => void;
  evict: (planId: string) => void;
}

export function useRecentPlans(tenantId: string): UseRecentPlans {
  const recents = useSyncExternalStore(
    subscribe,
    () => getSnapshot(tenantId),
    () => EMPTY as RecentPlan[],
  );

  const recordVisit = useCallback(
    (planId: string, planName: string) => recordVisitImpl(tenantId, planId, planName),
    [tenantId],
  );

  const evict = useCallback((planId: string) => evictImpl(tenantId, planId), [tenantId]);

  return { recents, recordVisit, evict };
}
