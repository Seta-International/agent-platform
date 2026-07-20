import { type SQL, sql } from 'drizzle-orm';
import { PgDialect, pgTable, uuid } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import { getDefaultRegistry } from '../../src/registry.ts';
import {
  assertSameTenant,
  CrossTenantError,
  decisionPredicate,
  scopeDecision,
  tenantScoped,
} from '../../src/scope-kit.ts';

const t = pgTable('thing', {
  id: uuid('id').primaryKey(),
  tenant_id: uuid('tenant_id').notNull(),
  org_unit_id: uuid('org_unit_id'),
  owner_id: uuid('owner_id'),
});
const dialect = new PgDialect();
const render = (d: ReturnType<typeof scopeDecision>): string =>
  d.kind === 'predicate' ? dialect.sqlToQuery(d.predicate).sql : d.kind;
const ctx = { userId: 'u1', tenantId: 't1' };

describe('scopeDecision', () => {
  it('tenant scope → all', () => {
    expect(scopeDecision({ kind: 'tenant' }, {}, ctx)).toEqual({ kind: 'all' });
  });

  it('none with no relationship arms → deny', () => {
    expect(scopeDecision({ kind: 'none' }, { orgUnit: { column: t.org_unit_id } }, ctx)).toEqual({
      kind: 'deny',
    });
  });

  it('subset builds org-unit IN plus self arm ORed', () => {
    const d = scopeDecision(
      { kind: 'subset', org_unit_ids: ['a', 'b'], self: true },
      { orgUnit: { column: t.org_unit_id }, self: ({ userId }) => sql`${t.owner_id} = ${userId}` },
      ctx,
    );
    const q = render(d);
    expect(q).toContain('org_unit_id');
    expect(q).toContain(' or ');
    expect(q).toContain('owner_id');
  });

  it('none-scope denies even when relationship arms exist', () => {
    // Relationship arms only widen an existing scoped grant — with no grant at all, a
    // leftover ownership row (e.g. project_access owner) must not confer access.
    const d = scopeDecision(
      { kind: 'none' },
      { relationships: [({ userId }) => sql`${t.owner_id} = ${userId}`] },
      ctx,
    );
    expect(d).toEqual({ kind: 'deny' });
  });

  it('empty subset without arms → deny', () => {
    expect(scopeDecision({ kind: 'subset', org_unit_ids: [], self: false }, {}, ctx)).toEqual({
      kind: 'deny',
    });
  });

  it('null relationship arm is skipped, not ORed as null', () => {
    const d = scopeDecision(
      { kind: 'subset', org_unit_ids: [], self: false },
      {
        relationships: [() => null, ({ userId }) => sql`${t.owner_id} = ${userId}`],
      },
      ctx,
    );
    const q = render(d);
    expect(q).toContain('owner_id');
    expect(q).not.toContain('null');
  });

  it('subset combined with a relationship arm ORs all three', () => {
    const d = scopeDecision(
      { kind: 'subset', org_unit_ids: ['a'], self: true },
      {
        orgUnit: { column: t.org_unit_id },
        self: ({ userId }) => sql`${t.owner_id} = ${userId}`,
        relationships: [({ tenantId }) => sql`${t.tenant_id} = ${tenantId}`],
      },
      ctx,
    );
    const q = render(d);
    expect(q).toContain('org_unit_id');
    expect(q).toContain('owner_id');
    expect(q).toContain('tenant_id');
  });

  it('tenant scope ignores a populated plan', () => {
    expect(
      scopeDecision(
        { kind: 'tenant' },
        {
          orgUnit: { column: t.org_unit_id },
          self: () => sql`x`,
          relationships: [() => sql`y`],
        },
        ctx,
      ),
    ).toEqual({ kind: 'all' });
  });
});

describe('tenantScoped', () => {
  it('renders an equality on the tenant column', () => {
    expect(dialect.sqlToQuery(tenantScoped(t.tenant_id, { tenant_id: 't1' })).sql).toContain(
      'tenant_id',
    );
  });
});

describe('assertSameTenant', () => {
  it('throws CrossTenantError when row tenant differs from session tenant', () => {
    expect(() => assertSameTenant('t2', { tenant_id: 't1' })).toThrow(CrossTenantError);
    try {
      assertSameTenant('t2', { tenant_id: 't1' });
      throw new Error('expected assertSameTenant to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(CrossTenantError);
      expect((err as Error).name).toBe('CrossTenantError');
    }
  });

  it('does not throw when row tenant matches session tenant', () => {
    expect(() => assertSameTenant('t1', { tenant_id: 't1' })).not.toThrow();
  });
});

describe('decisionPredicate', () => {
  it('all → null', () => {
    expect(decisionPredicate({ kind: 'all' })).toBeNull();
  });
  it('deny → false predicate', () => {
    const p = decisionPredicate({ kind: 'deny' });
    expect(p).not.toBeNull();
    expect(dialect.sqlToQuery(p as SQL).sql).toContain('false');
  });
});

describe('getDefaultRegistry', () => {
  it('is a singleton over the full inventory', () => {
    expect(getDefaultRegistry()).toBe(getDefaultRegistry());
    expect(getDefaultRegistry().allPermissions.has('pm.project.read')).toBe(true);
  });
});
