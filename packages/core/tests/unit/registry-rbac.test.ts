import { expect, it } from 'vitest';
import { createContributionRegistry } from '../../src/composition/registry.ts';

it('collects rbac manifests', () => {
  const reg = createContributionRegistry();
  reg.module({
    name: 'm',
    schema: {},
    migrationsDir: '/x',
    rbac: {
      module: 'm',
      permissions: [{ key: 'm.a.read', description: '' }],
      roles: [{ slug: 'm.viewer', description: '', permissions: ['m.a.read'] }],
    },
  });
  expect(reg.collected.rbacManifests).toHaveLength(1);
  expect(reg.collected.rbacManifests[0].module).toBe('m');
});
