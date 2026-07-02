import { describe, expect, it } from 'vitest';
import { buildRegistry } from '../../src/registry.ts';
import { resolveScope } from '../../src/scope.ts';

const registry = buildRegistry([
  {
    module: 'pm',
    permissions: [
      { key: 'pm.project.read', description: '' },
      { key: 'pm.project.manage', description: '' },
    ],
    roles: [
      {
        slug: 'pm.manager',
        description: '',
        permissions: ['pm.project.read', 'pm.project.manage'],
      },
      { slug: 'pm.viewer', description: '', permissions: ['pm.project.read'] },
    ],
  },
]);

describe('resolveScope', () => {
  it('tenant assignment wins over org subset', () => {
    expect(
      resolveScope(
        registry,
        [
          { role_slug: 'pm.manager', scope_kind: 'org_unit', org_unit_ids: ['a', 'b'] },
          { role_slug: 'pm.viewer', scope_kind: 'tenant' },
        ],
        [],
        'pm.project.read',
      ),
    ).toEqual({ kind: 'tenant' });
  });

  it('unions org subtrees for the granting assignments only', () => {
    expect(
      resolveScope(
        registry,
        [
          { role_slug: 'pm.manager', scope_kind: 'org_unit', org_unit_ids: ['a', 'b'] },
          { role_slug: 'pm.viewer', scope_kind: 'tenant' },
        ],
        [],
        'pm.project.manage',
      ),
    ).toEqual({ kind: 'subset', org_unit_ids: ['a', 'b'], self: false });
  });

  it('self assignment yields subset with self=true', () => {
    expect(
      resolveScope(
        registry,
        [{ role_slug: 'pm.viewer', scope_kind: 'self' }],
        [],
        'pm.project.read',
      ),
    ).toEqual({ kind: 'subset', org_unit_ids: [], self: true });
  });

  it('implicit permission is self-scoped for everyone', () => {
    expect(resolveScope(registry, [], ['pm.project.read'], 'pm.project.read')).toEqual({
      kind: 'subset',
      org_unit_ids: [],
      self: true,
    });
  });

  it('wildcard role scope follows its assignment', () => {
    expect(
      resolveScope(
        registry,
        [{ role_slug: 'org.admin', scope_kind: 'org_unit', org_unit_ids: ['a'] }],
        [],
        'pm.project.manage',
      ),
    ).toEqual({ kind: 'subset', org_unit_ids: ['a'], self: false });
    expect(
      resolveScope(
        registry,
        [{ role_slug: 'org.admin', scope_kind: 'tenant' }],
        [],
        'pm.project.manage',
      ),
    ).toEqual({ kind: 'tenant' });
  });

  it('org.viewer grants .read at its assignment scope, nothing else', () => {
    expect(
      resolveScope(
        registry,
        [{ role_slug: 'org.viewer', scope_kind: 'tenant' }],
        [],
        'pm.project.read',
      ),
    ).toEqual({ kind: 'tenant' });
    expect(
      resolveScope(
        registry,
        [{ role_slug: 'org.viewer', scope_kind: 'tenant' }],
        [],
        'pm.project.manage',
      ),
    ).toEqual({ kind: 'none' });
  });

  it('overlay grant extends the role at the assignment scope; revoke removes it', () => {
    const overlay = new Map([
      ['pm.viewer', new Map([['pm.project.manage', 'grant' as const]])],
      ['pm.manager', new Map([['pm.project.manage', 'revoke' as const]])],
    ]);
    expect(
      resolveScope(
        registry,
        [
          { role_slug: 'pm.viewer', scope_kind: 'org_unit', org_unit_ids: ['v'] },
          { role_slug: 'pm.manager', scope_kind: 'org_unit', org_unit_ids: ['m'] },
        ],
        [],
        'pm.project.manage',
        overlay,
      ),
    ).toEqual({ kind: 'subset', org_unit_ids: ['v'], self: false });
  });

  it('unknown roles contribute nothing', () => {
    expect(
      resolveScope(
        registry,
        [{ role_slug: 'ghost.role', scope_kind: 'tenant' }],
        [],
        'pm.project.read',
      ),
    ).toEqual({ kind: 'none' });
  });
});
