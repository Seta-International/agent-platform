import type { SessionScope } from '@seta/core';
import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { plannerDb } from '../db/index.ts';
import { assigneeProjection } from '../db/schema.ts';
import { listPlans } from '../domain/list-plans.ts';
import { groupFilterFor, listMemberGroups } from '../read-helpers.ts';

export type ScopeResolveResult =
  | { ok: true; id: string; name: string }
  | { ambiguous: true; options: { id: string; name: string }[] }
  | { notFound: true };

/**
 * Declares the recoverable `{ error }` branch a scope-resolving tool returns
 * instead of its payload when the plan/group can't be resolved (not found /
 * ambiguous) — a message the agent relays to the user, NOT an exception, so it
 * neither throws nor trips the tool circuit breaker. Mastra validates tool
 * output against this schema and, since 1.52, hands the model a validation
 * error rather than throwing, so that branch has to be schema-legal: every
 * payload key becomes optional because it is absent on the error branch.
 */
export function withScopeError<T extends z.ZodRawShape>(payload: z.ZodObject<T>) {
  return payload.partial().extend({ error: z.string().optional() });
}

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

/**
 * Resolve a tenant member referenced by explicit UUID or a name/email fragment
 * into a { userId, displayName } pair. Mirrors resolveGroupScope/resolvePlanScope
 * so name-based lookup lives inside a tool instead of forcing a separate
 * planner_resolveMember round-trip. Scoped to the caller's tenant and active
 * (non-deactivated) members. `id` is the userId; `name` is the display name.
 */
export async function resolveMemberScope(
  session: SessionScope,
  opts: { userId?: string; userName?: string },
): Promise<ScopeResolveResult> {
  const rows = await plannerDb()
    .select({
      id: assigneeProjection.user_id,
      name: assigneeProjection.display_name,
      email: assigneeProjection.email,
    })
    .from(assigneeProjection)
    .where(
      and(
        eq(assigneeProjection.tenant_id, session.tenant_id),
        isNull(assigneeProjection.deactivated_at),
      ),
    );

  if (opts.userId) {
    const match = rows.find((r) => r.id === opts.userId);
    return match ? { ok: true, id: match.id, name: match.name } : { notFound: true };
  }

  if (opts.userName) {
    const lower = opts.userName.toLowerCase();
    const matched = rows
      .filter((r) => r.name.toLowerCase().includes(lower) || r.email.toLowerCase().includes(lower))
      .map((r) => ({ id: r.id, name: r.name }));
    return fromList(matched);
  }

  return { notFound: true };
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
