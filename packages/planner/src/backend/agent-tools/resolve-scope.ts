import type { SessionScope } from '@seta/core';
import { listPlans } from '../domain/list-plans.ts';
import { groupFilterFor, listMemberGroups } from '../read-helpers.ts';

export type ScopeResolveResult =
  | { ok: true; id: string; name: string }
  | { ambiguous: true; options: { id: string; name: string }[] }
  | { notFound: true };

function matchByName(
  items: { id: string; name: string }[],
  query: string,
): { id: string; name: string }[] {
  const lower = query.toLowerCase();
  return items.filter((item) => item.name.toLowerCase().includes(lower));
}

function fromList(items: { id: string; name: string }[]): ScopeResolveResult {
  if (items.length === 0) return { notFound: true };
  const first = items[0];
  if (items.length === 1 && first) return { ok: true, id: first.id, name: first.name };
  return { ambiguous: true, options: items };
}

export async function resolveGroupScope(
  session: SessionScope,
  opts: { groupId?: string; groupName?: string },
): Promise<ScopeResolveResult> {
  if (opts.groupId) {
    const filter = await groupFilterFor(session);
    if (filter === null) return { ok: true, id: opts.groupId, name: opts.groupId };
    if (!filter.includes(opts.groupId)) return { notFound: true };
    const groups = await listMemberGroups(session.user_id, session.tenant_id);
    const match = groups.find((g) => g.id === opts.groupId);
    return match
      ? { ok: true, id: match.id, name: match.name }
      : { ok: true, id: opts.groupId, name: opts.groupId };
  }

  const groups = await listMemberGroups(session.user_id, session.tenant_id);

  if (opts.groupName) {
    return fromList(matchByName(groups, opts.groupName));
  }

  return fromList(groups);
}

export async function resolvePlanScope(
  session: SessionScope,
  opts: { planId?: string; planName?: string },
): Promise<ScopeResolveResult> {
  const allPlans = await listPlans({ session });
  const planItems = allPlans.map((p) => ({ id: p.id, name: p.name }));

  if (opts.planId) {
    const match = planItems.find((p) => p.id === opts.planId);
    return match ? { ok: true, id: match.id, name: match.name } : { notFound: true };
  }

  if (opts.planName) {
    return fromList(matchByName(planItems, opts.planName));
  }

  return fromList(planItems);
}
