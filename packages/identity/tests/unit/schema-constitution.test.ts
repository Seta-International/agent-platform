import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import {
  accessGroupMembership,
  accessGroupRole,
  personProjection,
  productGrant,
  roleAssignments,
} from '../../src/backend/db/schema.ts';

describe('identity schema constitution', () => {
  it('role_assignments has the scope implication CHECK', () => {
    const cfg = getTableConfig(roleAssignments);
    expect(cfg.checks.some((c) => c.name === 'role_assignments_scope_check')).toBe(true);
  });

  it('product_grant unique leads with tenant_id', () => {
    const cfg = getTableConfig(productGrant);
    const uniq = cfg.uniqueConstraints.concat().find((u) => u.name?.includes('subject_product'));
    // uniqueIndex lives in cfg.indexes for drizzle — check both collections
    const idx = cfg.indexes.find((i) => i.config.name?.includes('subject_product'));
    const cols = (uniq?.columns ?? idx?.config.columns ?? []).map((c) =>
      'name' in c ? c.name : '',
    );
    expect(cols[0]).toBe('tenant_id');
  });

  it('person_projection is exported under its new name', () => {
    expect(getTableConfig(personProjection).name).toBe('person_projection');
  });

  it('access_group_membership carries tenant_id', () => {
    const cfg = getTableConfig(accessGroupMembership);
    expect(cfg.columns.some((c) => c.name === 'tenant_id')).toBe(true);
  });

  it('access_group_role carries tenant_id', () => {
    const cfg = getTableConfig(accessGroupRole);
    expect(cfg.columns.some((c) => c.name === 'tenant_id')).toBe(true);
  });
});
