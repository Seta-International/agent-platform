import { useCallback, useEffect, useState } from 'react';

export interface RecentPlan {
  planId: string;
  planName: string;
  visitedAt: number;
}

const MAX_RECENTS = 5;

const storageKey = (tenantId: string) => `planner.recents.${tenantId}`;

function read(tenantId: string): RecentPlan[] {
  try {
    const raw = localStorage.getItem(storageKey(tenantId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (v): v is RecentPlan =>
        typeof v === 'object' &&
        v !== null &&
        typeof (v as RecentPlan).planId === 'string' &&
        typeof (v as RecentPlan).planName === 'string' &&
        typeof (v as RecentPlan).visitedAt === 'number',
    );
  } catch {
    // localStorage unavailable (e.g. private-mode SecurityError) — degrade to empty.
    return [];
  }
}

function write(tenantId: string, recents: RecentPlan[]): void {
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

export interface UseRecentPlans {
  recents: RecentPlan[];
  recordVisit: (planId: string, planName: string) => void;
  evict: (planId: string) => void;
}

export function useRecentPlans(tenantId: string): UseRecentPlans {
  const [recents, setRecents] = useState<RecentPlan[]>(() => read(tenantId));

  useEffect(() => {
    write(tenantId, recents);
  }, [tenantId, recents]);

  const recordVisit = useCallback((planId: string, planName: string) => {
    setRecents((prev) => {
      const filtered = prev.filter((r) => r.planId !== planId);
      const next: RecentPlan[] = [{ planId, planName, visitedAt: Date.now() }, ...filtered];
      return next.slice(0, MAX_RECENTS);
    });
  }, []);

  const evict = useCallback((planId: string) => {
    setRecents((prev) => prev.filter((r) => r.planId !== planId));
  }, []);

  return { recents, recordVisit, evict };
}
