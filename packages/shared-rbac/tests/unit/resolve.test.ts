import { describe, expect, it } from 'vitest';
import { buildRegistry } from '../../src/registry.ts';
import { can, resolvePermissions } from '../../src/resolve.ts';

const reg = buildRegistry([
  {
    module: 'm',
    permissions: [
      { key: 'm.a.read', description: '' },
      { key: 'm.a.write', description: '' },
    ],
    roles: [{ slug: 'm.editor', description: '', permissions: ['m.a.read', 'm.a.write'] }],
  },
]);
const implicit = ['m.a.read'];

describe('resolvePermissions', () => {
  it('unions implicit + held role permissions', () => {
    const s = resolvePermissions(reg, ['m.editor'], implicit);
    expect([...s].sort()).toEqual(['m.a.read', 'm.a.write']);
  });
  it('org.admin / tenant.admin resolve to every permission', () => {
    expect(resolvePermissions(reg, ['org.admin'], []).size).toBe(2);
    expect(resolvePermissions(reg, ['tenant.admin'], []).has('m.a.write')).toBe(true);
  });
  it('org.viewer resolves to all .read', () => {
    const s = resolvePermissions(reg, ['org.viewer'], []);
    expect([...s]).toEqual(['m.a.read']);
  });
  it('ignores unknown roles', () => {
    expect(resolvePermissions(reg, ['nope'], []).size).toBe(0);
  });
  it('can() is a set membership check', () => {
    const session = { permissions: new Set(['m.a.read']) } as never;
    expect(can(session, 'm.a.read')).toBe(true);
    expect(can(session, 'm.a.write')).toBe(false);
  });
});
