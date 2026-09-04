import type { SessionScope } from '@seta/core';
import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { plannerDb } from '../db/index.ts';
import { assigneeProjection } from '../db/schema.ts';
import { listPlans } from '../domain/list-plans.ts';
import {
  getGroupState,
  groupFilterFor,
  listMemberGroupsWithState,
  type MemberGroupWithState,
} from '../read-helpers.ts';

export type ScopeResolveResult =
  | { ok: true; id: string; name: string }
  | { archived: true; id: string; name: string }
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

function matchByName<T extends { name: string }>(items: T[], query: string): T[] {
  const lower = query.toLowerCase();
  return items.filter((item) => item.name.toLowerCase().includes(lower));
}

function fromList(items: { id: string; name: string }[]): ScopeResolveResult {
  if (items.length === 0) return { notFound: true };
  const first = items[0];
  if (items.length === 1 && first) return { ok: true, id: first.id, name: first.name };
  return { ambiguous: true, options: items.map((i) => ({ id: i.id, name: i.name })) };
}

/**
 * Reached only when no live group matched: a single archived hit is reported as
 * archived so the caller can say so, several stay ambiguous so the user picks
 * one and the follow-up by id lands on the archived branch.
 */
function fromArchivedList(items: { id: string; name: string }[]): ScopeResolveResult {
  if (items.length === 0) return { notFound: true };
  const first = items[0];
  if (items.length === 1 && first) return { archived: true, id: first.id, name: first.name };
  return { ambiguous: true, options: items.map((i) => ({ id: i.id, name: i.name })) };
}

/**
 * The message a tool relays when the user named a group that has been archived.
 * Naming the group is the point of AC3 — a bare "not found" reads as a typo.
 */
export function archivedGroupError(name: string): string {
  return (
    `Group "${name}" is archived, so it is outside active work. Tell the user the group is ` +
    'archived rather than reporting its data, and only read it if they ask for archived groups.'
  );
}

function fromState(state: MemberGroupWithState): ScopeResolveResult {
  return state.archived
    ? { archived: true, id: state.id, name: state.name }
    : { ok: true, id: state.id, name: state.name };
}

export async function resolveGroupScope(
  session: SessionScope,
  opts: { groupId?: string; groupName?: string },
): Promise<ScopeResolveResult> {
  if (opts.groupId) {
    const filter = await groupFilterFor(session);
    if (filter === null) {
      const state = await getGroupState(session.tenant_id, opts.groupId);
      return state ? fromState(state) : { notFound: true };
    }
    // groupFilterFor is the caller's live-membership set, so anything it holds
    // is a live membership row; the archived ones only surface via the state list.
    const membership = await listMemberGroupsWithState(session.user_id, session.tenant_id);
    const match = membership.find((g) => g.id === opts.groupId);
    return match ? fromState(match) : { notFound: true };
  }

  const groups = await listMemberGroupsWithState(session.user_id, session.tenant_id);
  const active = groups.filter((g) => !g.archived);

  if (opts.groupName) {
    const matched = matchByName(groups, opts.groupName);
    const activeMatches = matched.filter((g) => !g.archived);
    return activeMatches.length > 0 ? fromList(activeMatches) : fromArchivedList(matched);
  }

  return fromList(active);
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
