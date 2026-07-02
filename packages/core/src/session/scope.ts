import { createHash } from 'node:crypto';
import { PRODUCT_GATE_EXEMPT, PRODUCT_NAMESPACES } from '@seta/shared-rbac';
import { eq } from 'drizzle-orm';
import { LRUCache } from 'lru-cache';
import { coreDb } from '../db/client.ts';
import { sessionScopeCache } from '../db/schema/index.ts';

export interface RoleAssignment {
  role_slug: string;
  scope_kind: 'tenant' | 'org_unit' | 'self' | 'group';
  scope_id: string | null;
  granted_at: Date;
}

export type ListRoleAssignments = (
  userId: string,
) => Promise<{ tenant_id: string; assignments: ReadonlyArray<RoleAssignment> }>;

export type ResolvePermissions = (
  roles: readonly string[],
  tenantId: string,
) => Promise<ReadonlySet<string>>;

export type ResolveGroupIds = (userId: string) => Promise<ReadonlyArray<string>>;

export type ResolveProductAccess = (
  userId: string,
  tenantId: string,
  groupIds: readonly string[],
) => Promise<ReadonlySet<string>>;

export interface SessionScope {
  session_id: string;
  user_id: string;
  tenant_id: string;
  email: string;
  display_name: string;
  role_summary: { roles: string[]; cross_tenant_read: boolean };
  role_summary_hash: string;
  permissions: ReadonlySet<string>;
  accessible_group_ids: ReadonlyArray<string>;
  group_ids: ReadonlyArray<string>;
  product_access: ReadonlySet<string>;
  cross_tenant_read: boolean;
  built_at: Date;
  invalidated_at: Date | null;
}

const hot = new LRUCache<string, SessionScope>({ max: 50_000, ttl: 1000 * 60 * 15 });

function applyProductGate(
  perms: ReadonlySet<string>,
  productAccess: ReadonlySet<string>,
): Set<string> {
  const gated = new Set<string>();
  for (const p of perms) {
    const ns = p.split('.')[0];
    if (ns && PRODUCT_NAMESPACES.has(ns) && !productAccess.has(ns) && !PRODUCT_GATE_EXEMPT.has(p))
      continue;
    gated.add(p);
  }
  return gated;
}

export function rollup(assignments: ReadonlyArray<RoleAssignment>): {
  roles: string[];
  cross_tenant_read: boolean;
} {
  const roles = Array.from(new Set(assignments.map((a) => a.role_slug))).sort();
  const cross_tenant_read = assignments.some((a) => a.role_slug === 'org.viewer');
  return { roles, cross_tenant_read };
}

export function hashRoleSummary(summary: { roles: string[]; cross_tenant_read: boolean }): string {
  const canonical = JSON.stringify({
    roles: [...summary.roles].sort(),
    cross_tenant_read: summary.cross_tenant_read,
  });
  return createHash('sha256').update(canonical).digest('hex').slice(0, 16);
}

export function computeAccessibleGroups(
  assignments: ReadonlyArray<RoleAssignment>,
): ReadonlyArray<string> {
  const groups = new Set<string>();
  for (const a of assignments) {
    if (a.scope_kind === 'group' && a.scope_id) groups.add(a.scope_id);
  }
  return Array.from(groups).sort();
}

export async function getSessionScope(
  deps: {
    listRoleAssignments: ListRoleAssignments;
    resolvePermissions: ResolvePermissions;
    resolveGroupIds?: ResolveGroupIds;
    resolveProductAccess?: ResolveProductAccess;
  },
  sessionId: string,
  userId: string,
  email: string,
  displayName: string,
): Promise<SessionScope> {
  const resolveGroupIds = deps.resolveGroupIds ?? (async () => []);
  const hit = hot.get(sessionId);
  if (hit && !hit.invalidated_at) return hit;

  const [cached] = await coreDb()
    .select()
    .from(sessionScopeCache)
    .where(eq(sessionScopeCache.session_id, sessionId))
    .limit(1);
  if (cached && !cached.invalidated_at) {
    const rawPermissions = await deps.resolvePermissions(
      (cached.role_summary as { roles: string[] }).roles,
      cached.tenant_id,
    );
    const group_ids = await resolveGroupIds(cached.user_id);
    const productAccess = deps.resolveProductAccess
      ? await deps.resolveProductAccess(cached.user_id, cached.tenant_id, group_ids)
      : undefined;
    const permissions = productAccess
      ? applyProductGate(rawPermissions, productAccess)
      : rawPermissions;
    const scope: SessionScope = {
      session_id: cached.session_id,
      tenant_id: cached.tenant_id,
      user_id: cached.user_id,
      role_summary_hash: cached.role_summary_hash,
      role_summary: cached.role_summary as { roles: string[]; cross_tenant_read: boolean },
      accessible_group_ids: cached.accessible_group_ids as string[],
      group_ids,
      product_access: productAccess ?? new Set<string>(),
      cross_tenant_read: cached.cross_tenant_read,
      built_at: cached.built_at,
      invalidated_at: cached.invalidated_at,
      email,
      display_name: displayName,
      permissions,
    };
    hot.set(sessionId, scope);
    return scope;
  }

  const { tenant_id, assignments } = await deps.listRoleAssignments(userId);
  const role_summary = rollup(assignments);
  const rawPermissions = await deps.resolvePermissions(role_summary.roles, tenant_id);
  const group_ids = await resolveGroupIds(userId);
  const productAccess = deps.resolveProductAccess
    ? await deps.resolveProductAccess(userId, tenant_id, group_ids)
    : undefined;
  const permissions = productAccess
    ? applyProductGate(rawPermissions, productAccess)
    : rawPermissions;
  const scope: SessionScope = {
    session_id: sessionId,
    user_id: userId,
    tenant_id,
    email,
    display_name: displayName,
    role_summary,
    role_summary_hash: hashRoleSummary(role_summary),
    accessible_group_ids: computeAccessibleGroups(assignments),
    group_ids,
    product_access: productAccess ?? new Set<string>(),
    cross_tenant_read: role_summary.cross_tenant_read,
    built_at: new Date(),
    invalidated_at: null,
    permissions,
  };

  await coreDb()
    .insert(sessionScopeCache)
    .values({
      session_id: sessionId,
      tenant_id,
      user_id: userId,
      role_summary_hash: scope.role_summary_hash,
      role_summary: scope.role_summary,
      accessible_group_ids: scope.accessible_group_ids as string[],
      cross_tenant_read: scope.cross_tenant_read,
      built_at: scope.built_at,
      invalidated_at: null,
    })
    .onConflictDoUpdate({
      target: sessionScopeCache.session_id,
      set: {
        tenant_id,
        user_id: userId,
        role_summary_hash: scope.role_summary_hash,
        role_summary: scope.role_summary,
        accessible_group_ids: scope.accessible_group_ids as string[],
        cross_tenant_read: scope.cross_tenant_read,
        built_at: scope.built_at,
        invalidated_at: null,
      },
    });

  hot.set(sessionId, scope);
  return scope;
}

export function evictHotByUser(userId: string): number {
  let n = 0;
  for (const [k, v] of hot.entries()) {
    if (v && v.user_id === userId) {
      hot.delete(k);
      n++;
    }
  }
  return n;
}

export function evictHotByTenant(tenantId: string): number {
  let n = 0;
  for (const [k, v] of hot.entries()) {
    if (v && v.tenant_id === tenantId) {
      hot.delete(k);
      n++;
    }
  }
  return n;
}

export function evictHotAll(): number {
  const n = hot.size;
  hot.clear();
  return n;
}

export function _clearHotForTest(): void {
  hot.clear();
}
