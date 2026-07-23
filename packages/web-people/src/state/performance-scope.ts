import type { PerformanceCapacity } from '../api/people-client.ts';

export type PerformanceKind = PerformanceCapacity['kind'];

/** URL search params for the Performance capacity scope (FE-AD-13). */
export type PerformanceScopeSearch = {
  kind?: PerformanceKind;
  account?: string;
  project?: string;
  month?: string;
};

export type ResolvedPerformanceScope =
  | { mode: 'organization'; month: string; capacity: null }
  | { mode: 'capacity'; month: string; capacity: PerformanceCapacity };

const KINDS = new Set<PerformanceKind>(['am', 'tl', 'member']);

/** Stable switcher option id — unique per capacity. */
export function capacityOptionId(c: PerformanceCapacity): string {
  return c.kind === 'am' ? `am:${c.account_id}` : `${c.kind}:${c.project_id}`;
}

/** Display label for the switcher control (always shows role + project/account). */
export function capacityLabel(c: PerformanceCapacity): string {
  const role = c.kind === 'am' ? 'AM' : c.kind === 'tl' ? 'TL' : 'Member';
  return `${role} · ${c.label}`;
}

export function parsePerformanceSearch(s: Record<string, unknown>): PerformanceScopeSearch {
  const kindRaw = typeof s.kind === 'string' ? s.kind : undefined;
  const kind =
    kindRaw && KINDS.has(kindRaw as PerformanceKind) ? (kindRaw as PerformanceKind) : undefined;
  const account = typeof s.account === 'string' && s.account.length > 0 ? s.account : undefined;
  const project = typeof s.project === 'string' && s.project.length > 0 ? s.project : undefined;
  const month =
    typeof s.month === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(s.month) ? s.month : undefined;
  return { kind, account, project, month };
}

/** True when the URL carries an explicit capacity/month context (not a bare path). */
export function hasExplicitScope(search: PerformanceScopeSearch): boolean {
  return (
    search.kind !== undefined ||
    search.account !== undefined ||
    search.project !== undefined ||
    search.month !== undefined
  );
}

export function capacityMatchesSearch(
  c: PerformanceCapacity,
  search: PerformanceScopeSearch,
): boolean {
  if (search.kind !== undefined && c.kind !== search.kind) return false;
  if (c.kind === 'am') {
    return search.account === undefined || search.account === c.account_id;
  }
  if (search.project !== undefined && search.project !== c.project_id) return false;
  if (search.account !== undefined && search.account !== c.account_id) return false;
  return search.kind === undefined || search.kind === c.kind;
}

export function searchFromCapacity(
  c: PerformanceCapacity,
  month: string,
): Required<Pick<PerformanceScopeSearch, 'kind' | 'month'>> & PerformanceScopeSearch {
  if (c.kind === 'am') {
    return { kind: 'am', account: c.account_id, project: undefined, month };
  }
  return {
    kind: c.kind,
    project: c.project_id,
    account: c.account_id,
    month,
  };
}

/**
 * Resolve URL search against the EmployeePort capacities.
 * Invalid / forged tuples fall back to default_capacity_index (or organization mode).
 */
export function resolvePerformanceScope(input: {
  search: PerformanceScopeSearch;
  capacities: readonly PerformanceCapacity[];
  default_capacity_index: number;
  as_of_month: string;
}): { resolved: ResolvedPerformanceScope; search: PerformanceScopeSearch; corrected: boolean } {
  const month = input.search.month ?? input.as_of_month;

  if (input.capacities.length === 0) {
    const search: PerformanceScopeSearch = { month };
    return {
      resolved: { mode: 'organization', month, capacity: null },
      search,
      corrected:
        hasExplicitScope(input.search) &&
        (input.search.kind !== undefined ||
          input.search.project !== undefined ||
          input.search.account !== undefined),
    };
  }

  const fromUrl =
    input.search.kind !== undefined
      ? input.capacities.find((c) => capacityMatchesSearch(c, input.search))
      : undefined;

  if (fromUrl) {
    const search = searchFromCapacity(fromUrl, month);
    const corrected =
      input.search.kind !== search.kind ||
      input.search.account !== search.account ||
      input.search.project !== search.project ||
      input.search.month !== search.month;
    return {
      resolved: { mode: 'capacity', month, capacity: fromUrl },
      search,
      corrected,
    };
  }

  const idx =
    input.default_capacity_index >= 0 && input.default_capacity_index < input.capacities.length
      ? input.default_capacity_index
      : 0;
  const fallback = input.capacities[idx];
  if (!fallback) {
    const search: PerformanceScopeSearch = { month };
    return {
      resolved: { mode: 'organization', month, capacity: null },
      search,
      corrected: true,
    };
  }
  const search = searchFromCapacity(fallback, month);
  return {
    resolved: { mode: 'capacity', month, capacity: fallback },
    search,
    corrected: true,
  };
}

/** Scope tuple used as the cache-keying dimension (AD-3 / FE-AD-8). */
export function scopeTuple(resolved: ResolvedPerformanceScope): {
  kind: PerformanceKind | 'organization';
  account?: string;
  project?: string;
  month: string;
} {
  if (resolved.mode === 'organization' || !resolved.capacity) {
    return { kind: 'organization', month: resolved.month };
  }
  const c = resolved.capacity;
  if (c.kind === 'am') {
    return { kind: 'am', account: c.account_id, month: resolved.month };
  }
  return {
    kind: c.kind,
    project: c.project_id,
    account: c.account_id,
    month: resolved.month,
  };
}
