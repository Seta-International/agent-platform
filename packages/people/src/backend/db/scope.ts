import type { SessionScope } from '@seta/core';
import { eq, type SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import { PeopleError } from '../rbac.ts';

// Every people read must AND this predicate into its WHERE so rows from another
// tenant are never returned (application-layer isolation; no RLS).
export function tenantScoped(tenantColumn: PgColumn, session: SessionScope): SQL {
  return eq(tenantColumn, session.tenant_id);
}

export function assertSameTenant(row: { tenant_id: string }, session: SessionScope): void {
  if (row.tenant_id !== session.tenant_id) {
    throw new PeopleError('CROSS_TENANT', 'Record belongs to another tenant');
  }
}
