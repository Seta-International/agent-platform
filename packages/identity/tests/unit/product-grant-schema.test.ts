import { ALL_PERMISSIONS } from '@seta/shared-rbac';
import { describe, expect, it } from 'vitest';
import { productGrant } from '../../src/backend/db/schema.ts';

describe('product grant schema + verbs', () => {
  it('exposes the table and permissions', () => {
    expect(Object.keys(productGrant)).toEqual(
      expect.arrayContaining(['subject_type', 'subject_id', 'product_id', 'effect']),
    );
    for (const k of [
      'identity.product_access.read',
      'identity.product_access.grant',
      'identity.product_access.revoke',
      'people.self.read',
      'people.self.manage',
    ])
      expect(ALL_PERMISSIONS).toContain(k);
  });
});
