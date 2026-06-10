import { buildRegistry } from '@seta/shared-rbac';
import { expect, it } from 'vitest';
import { makeRbacCheck } from '../../src/rpc/rbac.ts';

const reg = buildRegistry([
  {
    module: 'm',
    permissions: [
      { key: 'm.a.read', description: '' },
      { key: 'm.a.write', description: '' },
    ],
    roles: [{ slug: 'm.viewer', description: '', permissions: ['m.a.read'] }],
  },
]);
const check = makeRbacCheck(reg, []);
const actor = (roles: string[]) => ({
  user_id: 'u',
  tenant_id: 't',
  email: 'e',
  display_name: 'd',
  role_summary: { roles, cross_tenant_read: false },
  cross_tenant_read: false,
});

it('allows a fine-grained permission via a non-admin role', () => {
  expect(() => check(actor(['m.viewer']), 'm.a.read', 'm', 'go')).not.toThrow();
});
it('forbids a permission the role lacks', () => {
  expect(() => check(actor(['m.viewer']), 'm.a.write', 'm', 'go')).toThrow();
});
it('admin wildcard passes any permission', () => {
  expect(() => check(actor(['org.admin']), 'm.a.write', 'm', 'go')).not.toThrow();
});
