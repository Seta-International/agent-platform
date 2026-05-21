import { describe, expect, it } from 'vitest';
import { resolveField } from '../../../src/m365/lww.ts';

describe('resolveField', () => {
  it('noop when local === remote', () => {
    expect(resolveField({ local: 'A', remote: 'A', snapshot: 'A' })).toEqual({ kind: 'noop' });
  });
  it('noop when local === remote with both diverged from snapshot', () => {
    expect(resolveField({ local: 'B', remote: 'B', snapshot: 'A' })).toEqual({ kind: 'noop' });
  });
  it('remote-wins when local === snapshot and remote !== snapshot', () => {
    expect(resolveField({ local: 'A', remote: 'B', snapshot: 'A' })).toEqual({
      kind: 'remote-wins',
      value: 'B',
    });
  });
  it('local-wins when local !== snapshot and remote === snapshot', () => {
    expect(resolveField({ local: 'B', remote: 'A', snapshot: 'A' })).toEqual({
      kind: 'local-wins',
      value: 'B',
    });
  });
  it('conflict when both diverged from snapshot', () => {
    expect(resolveField({ local: 'B', remote: 'C', snapshot: 'A' })).toEqual({
      kind: 'conflict',
      local: 'B',
      remote: 'C',
      snapshot: 'A',
    });
  });
  it('handles null values for description', () => {
    expect(resolveField({ local: null, remote: 'x', snapshot: null })).toEqual({
      kind: 'remote-wins',
      value: 'x',
    });
  });
  it('deep-equal for member sets', () => {
    expect(
      resolveField({
        local: [{ id: 'a', role: 'owner' }],
        remote: [{ id: 'a', role: 'owner' }],
        snapshot: [{ id: 'a', role: 'owner' }],
      }),
    ).toEqual({ kind: 'noop' });
  });
});

describe('resolveMembers', () => {
  it('adds, removes, role-changes correctly with simple sets', async () => {
    const { resolveMembers } = await import('../../../src/m365/lww.ts');
    const result = resolveMembers({
      remote: [
        { entra_oid: 'a', role: 'owner' },
        { entra_oid: 'b', role: 'member' },
      ],
      local: [
        { entra_oid: 'a', role: 'member' },
        { entra_oid: 'c', role: 'member' },
      ],
      snapshot: [
        { entra_oid: 'a', role: 'member' },
        { entra_oid: 'c', role: 'member' },
      ],
    });
    // remote added 'b', removed 'c', changed a→owner
    expect(result.adds).toEqual([{ entra_oid: 'b', role: 'member' }]);
    expect(result.removes).toEqual([{ entra_oid: 'c' }]);
    expect(result.roleChanges).toEqual([{ entra_oid: 'a', after_role: 'owner' }]);
    expect(result.conflicts).toEqual([]);
  });

  it('flags conflict when both sides added same member with different roles', async () => {
    const { resolveMembers } = await import('../../../src/m365/lww.ts');
    // snapshot has no member 'x'. Remote adds 'x' as 'owner'. Local adds 'x' as 'member'.
    const result = resolveMembers({
      remote: [{ entra_oid: 'x', role: 'owner' }],
      local: [{ entra_oid: 'x', role: 'member' }],
      snapshot: [],
    });
    expect(result.conflicts).toEqual([
      { entra_oid: 'x', local_role: 'member', remote_role: 'owner' },
    ]);
    expect(result.adds).toEqual([]);
    expect(result.removes).toEqual([]);
    expect(result.roleChanges).toEqual([]);
  });

  it('noop when remote and local are identical to snapshot', async () => {
    const { resolveMembers } = await import('../../../src/m365/lww.ts');
    const result = resolveMembers({
      remote: [
        { entra_oid: 'a', role: 'owner' },
        { entra_oid: 'b', role: 'member' },
      ],
      local: [
        { entra_oid: 'a', role: 'owner' },
        { entra_oid: 'b', role: 'member' },
      ],
      snapshot: [
        { entra_oid: 'a', role: 'owner' },
        { entra_oid: 'b', role: 'member' },
      ],
    });
    expect(result.adds).toEqual([]);
    expect(result.removes).toEqual([]);
    expect(result.roleChanges).toEqual([]);
    expect(result.conflicts).toEqual([]);
  });
});
