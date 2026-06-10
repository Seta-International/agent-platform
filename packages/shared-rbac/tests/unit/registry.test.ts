import { describe, expect, it } from 'vitest';
import { buildRegistry } from '../../src/registry.ts';

const k = {
  module: 'knowledge',
  permissions: [
    { key: 'knowledge.file.read', description: '' },
    { key: 'knowledge.file.write', description: '' },
  ],
  roles: [{ slug: 'knowledge.viewer', description: '', permissions: ['knowledge.file.read'] }],
};

describe('buildRegistry', () => {
  it('indexes all permission keys and role maps', () => {
    const reg = buildRegistry([k]);
    expect(reg.allPermissions.has('knowledge.file.read')).toBe(true);
    expect(reg.rolePermissions.get('knowledge.viewer')).toEqual(['knowledge.file.read']);
  });

  it('throws on a role permission absent from any statement', () => {
    const bad = {
      ...k,
      roles: [{ slug: 'x', description: '', permissions: ['knowledge.ghost.read'] }],
    };
    expect(() => buildRegistry([bad])).toThrow(/knowledge.ghost.read/);
  });

  it('throws on duplicate permission key across modules', () => {
    expect(() => buildRegistry([k, k])).toThrow(/duplicate/);
  });
});
