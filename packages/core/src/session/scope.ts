import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { LRUCache } from 'lru-cache';
import { coreDb } from '../db/client.ts';
import { sessionScopeCache } from '../db/schema/index.ts';

export interface RoleGrant {
  role_slug: string;
  scope_type: 'tenant' | 'group';
  scope_id: string | null;
  granted_at: Date;
}

export type ListRoleGrants = (
  userId: string,
) => Promise<{ tenant_id: string; grants: ReadonlyArray<RoleGrant> }>;

export type ResolvePermissions = (roles: readonly string[]) => ReadonlySet<string>;

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
  cross_tenant_read: boolean;
  built_at: Date;
  invalidated_at: Date | null;
}

const hot = new LRUCache<string, SessionScope>({ max: 50_000, ttl: 1000 * 60 * 15 });

export function rollup(grants: ReadonlyArray<RoleGrant>): {
  roles: string[];
  cross_tenant_read: boolean;
} {
  const roles = Array.from(new Set(grants.map((g) => g.role_slug))).sort();
  const cross_tenant_read = grants.some((g) => g.role_slug === 'org.viewer');
  return { roles, cross_tenant_read };
}

export function hashRoleSummary(summary: { roles: string[]; cross_tenant_read: boolean }): string {
  const canonical = JSON.stringify({
    roles: [...summary.roles].sort(),
    cross_tenant_read: summary.cross_tenant_read,
  });
  return createHash('sha256').update(canonical).digest('hex').slice(0, 16);
}

export function computeAccessibleGroups(grants: ReadonlyArray<RoleGrant>): ReadonlyArray<string> {
  const groups = new Set<string>();
  for (const g of grants) {
    if (g.scope_type === 'group' && g.scope_id) groups.add(g.scope_id);
  }
  return Array.from(groups).sort();
}

export async function getSessionScope(
  deps: { listRoleGrants: ListRoleGrants; resolvePermissions: ResolvePermissions },
  sessionId: string,
  userId: string,
  email: string,
  displayName: string,
): Promise<SessionScope> {
  const hit = hot.get(sessionId);
  if (hit && !hit.invalidated_at) return hit;

  const [cached] = await coreDb()
    .select()
    .from(sessionScopeCache)
    .where(eq(sessionScopeCache.session_id, sessionId))
    .limit(1);
  if (cached && !cached.invalidated_at) {
    const scope: SessionScope = {
      session_id: cached.session_id,
      tenant_id: cached.tenant_id,
      user_id: cached.user_id,
      role_summary_hash: cached.role_summary_hash,
      role_summary: cached.role_summary as { roles: string[]; cross_tenant_read: boolean },
      accessible_group_ids: cached.accessible_group_ids as string[],
      cross_tenant_read: cached.cross_tenant_read,
      built_at: cached.built_at,
      invalidated_at: cached.invalidated_at,
      email,
      display_name: displayName,
      permissions: deps.resolvePermissions((cached.role_summary as { roles: string[] }).roles),
    };
    hot.set(sessionId, scope);
    return scope;
  }

  const { tenant_id, grants } = await deps.listRoleGrants(userId);
  const role_summary = rollup(grants);
  const scope: SessionScope = {
    session_id: sessionId,
    user_id: userId,
    tenant_id,
    email,
    display_name: displayName,
    role_summary,
    role_summary_hash: hashRoleSummary(role_summary),
    accessible_group_ids: computeAccessibleGroups(grants),
    cross_tenant_read: role_summary.cross_tenant_read,
    built_at: new Date(),
    invalidated_at: null,
    permissions: deps.resolvePermissions(role_summary.roles),
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

export function _clearHotForTest(): void {
  hot.clear();
}
