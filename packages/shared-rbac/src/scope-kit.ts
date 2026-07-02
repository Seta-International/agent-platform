import { type AnyColumn, inArray, or, type SQL, sql } from 'drizzle-orm';
import type { PermissionScope } from './scope.ts';

export type ScopeDecision =
  | { kind: 'all' }
  | { kind: 'predicate'; predicate: SQL }
  | { kind: 'deny' };

export interface ScopeCtx {
  userId: string;
  tenantId: string;
}

export interface ScopePlan {
  orgUnit?: { column: AnyColumn };
  self?: (ctx: ScopeCtx) => SQL;
  relationships?: ReadonlyArray<(ctx: ScopeCtx) => SQL | null>;
}

export function scopeDecision(
  scope: PermissionScope,
  plan: ScopePlan,
  ctx: ScopeCtx,
): ScopeDecision {
  if (scope.kind === 'tenant') return { kind: 'all' };
  const arms: SQL[] = [];
  if (scope.kind === 'subset') {
    if (scope.org_unit_ids.length > 0 && plan.orgUnit) {
      arms.push(inArray(plan.orgUnit.column, [...scope.org_unit_ids]));
    }
    if (scope.self && plan.self) arms.push(plan.self(ctx));
  }
  for (const arm of plan.relationships ?? []) {
    const built = arm(ctx);
    if (built) arms.push(built);
  }
  if (arms.length === 0) return { kind: 'deny' };
  return { kind: 'predicate', predicate: or(...arms) as SQL };
}

export function tenantScoped(column: AnyColumn, session: { tenant_id: string }): SQL {
  return sql`${column} = ${session.tenant_id}`;
}

export class CrossTenantError extends Error {
  constructor(detail: string) {
    super(detail);
    this.name = 'CrossTenantError';
  }
}

export function assertSameTenant(rowTenantId: string, session: { tenant_id: string }): void {
  if (rowTenantId !== session.tenant_id) {
    throw new CrossTenantError(`row tenant ${rowTenantId} != session tenant ${session.tenant_id}`);
  }
}
