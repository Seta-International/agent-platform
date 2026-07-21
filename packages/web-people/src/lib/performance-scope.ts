import type { PerformanceCapacity } from '../api/people-client.ts';

/** Scope tuple selected by the switcher — the value that lives in the URL. */
export type CapacityRef =
  | { kind: 'am'; account_id: string }
  | { kind: 'tl' | 'member'; project_id: string };

export interface PerformanceScope {
  capacity: CapacityRef;
  as_of_month: string;
}

export const PERFORMANCE_SECTIONS = [
  'dashboard',
  'scoring',
  'self-assessment',
  'morale',
  'history',
  'configuration',
  'audit',
] as const;
export type PerformanceSection = (typeof PERFORMANCE_SECTIONS)[number];

export function encodeCapacity(c: CapacityRef): string {
  return c.kind === 'am' ? `am:${c.account_id}` : `${c.kind}:${c.project_id}`;
}

export function decodeCapacity(raw: string | undefined): CapacityRef | null {
  if (!raw) return null;
  const idx = raw.indexOf(':');
  if (idx <= 0) return null;
  const kind = raw.slice(0, idx);
  const id = raw.slice(idx + 1);
  if (!id) return null;
  if (kind === 'am') return { kind, account_id: id };
  if (kind === 'tl' || kind === 'member') return { kind, project_id: id };
  return null;
}

function toRef(c: PerformanceCapacity): CapacityRef {
  return c.kind === 'am'
    ? { kind: 'am', account_id: c.account_id }
    : { kind: c.kind, project_id: c.project_id };
}

function sameRef(a: CapacityRef, b: CapacityRef): boolean {
  if (a.kind !== b.kind) return false;
  return a.kind === 'am'
    ? a.account_id === (b as { account_id: string }).account_id
    : a.project_id === (b as { project_id: string }).project_id;
}

/**
 * Resolve the scope tuple from URL search params against the entitled
 * capacities (FUT-692 context). The URL is the single source of context —
 * an entitled value wins; anything missing or unentitled falls back to the
 * deterministic default capacity. Null when the user has no capacities.
 */
export function resolveScope(
  search: { capacity?: string; month?: string },
  ctx: {
    capacities: PerformanceCapacity[];
    default_capacity_index: number;
    as_of_month: string;
  },
): PerformanceScope | null {
  if (ctx.capacities.length === 0 || ctx.default_capacity_index < 0) return null;
  const requested = decodeCapacity(search.capacity);
  const entitled =
    requested && ctx.capacities.some((c) => sameRef(toRef(c), requested)) ? requested : null;
  const fallback = ctx.capacities[ctx.default_capacity_index];
  if (!fallback) return null;
  return {
    capacity: entitled ?? toRef(fallback),
    as_of_month: search.month ?? ctx.as_of_month,
  };
}

/**
 * Section entitlement matrix (Story 1.2 MVP): capacity kinds grant the
 * capacity columns, RBAC role slugs grant the role columns; the user gets
 * the union. Affordance only — server-side RBAC stays authoritative (AC1).
 */
const CAPACITY_SECTIONS: Record<PerformanceCapacity['kind'], readonly PerformanceSection[]> = {
  member: ['dashboard', 'self-assessment', 'morale', 'history'],
  tl: ['dashboard', 'scoring', 'self-assessment', 'morale', 'history'],
  am: ['dashboard', 'scoring', 'self-assessment', 'morale', 'history'],
};

const ROLE_SECTIONS: Record<string, readonly PerformanceSection[]> = {
  'pm.pmo': ['dashboard', 'morale', 'history', 'audit'],
  'pm.bod': ['dashboard', 'morale', 'history', 'audit'],
  'people.manager': ['dashboard', 'morale', 'history', 'configuration', 'audit'],
};

export function entitledSections(ctx: {
  capacities: PerformanceCapacity[];
  role_slugs: string[];
}): Set<PerformanceSection> {
  const out = new Set<PerformanceSection>();
  for (const c of ctx.capacities) for (const s of CAPACITY_SECTIONS[c.kind]) out.add(s);
  for (const role of ctx.role_slugs) for (const s of ROLE_SECTIONS[role] ?? []) out.add(s);
  return out;
}
