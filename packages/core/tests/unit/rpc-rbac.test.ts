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
  role_summary: { roles, cross_tenant_read: false, assignments: [] },
  cross_tenant_read: false,
});

it('allows a fine-grained permission via a non-admin role', async () => {
  await expect(check(actor(['m.viewer']), 'm.a.read', 'm', 'go')).resolves.toBeUndefined();
});
it('forbids a permission the role lacks', async () => {
  await expect(check(actor(['m.viewer']), 'm.a.write', 'm', 'go')).rejects.toThrow();
});
it('admin wildcard passes any permission', async () => {
  await expect(check(actor(['org.admin']), 'm.a.write', 'm', 'go')).resolves.toBeUndefined();
});
