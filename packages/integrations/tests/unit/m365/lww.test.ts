import { describe, expect, it } from 'vitest';
import { resolveDict, resolveField } from '../../../src/m365/lww.ts';

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

describe('resolveDict', () => {
  it('noop when all three dicts match', () => {
    const r = resolveDict<string>({
      local: { a: 'X' },
      remote: { a: 'X' },
      snapshot: { a: 'X' },
    });
    expect(r.patch).toEqual({});
    expect(r.conflicts).toEqual([]);
  });

  it('local-wins on local edit, key unchanged remotely', () => {
    const r = resolveDict<string>({
      local: { a: 'Y' },
      remote: { a: 'X' },
      snapshot: { a: 'X' },
    });
    expect(r.patch).toEqual({ a: 'Y' });
    expect(r.conflicts).toEqual([]);
  });

  it('local-wins on local add (key missing from snapshot and remote)', () => {
    const r = resolveDict<string>({
      local: { a: 'X' },
      remote: {},
      snapshot: {},
    });
    expect(r.patch).toEqual({ a: 'X' });
    expect(r.conflicts).toEqual([]);
  });

  it('local-wins on local remove, key unchanged remotely; patch sets null', () => {
    const r = resolveDict<string>({
      local: {},
      remote: { a: 'X' },
      snapshot: { a: 'X' },
    });
    expect(r.patch).toEqual({ a: null });
    expect(r.conflicts).toEqual([]);
  });

  it('skips remote-wins keys (remote changed, local unchanged)', () => {
    const r = resolveDict<string>({
      local: { a: 'X' },
      remote: { a: 'Y' },
      snapshot: { a: 'X' },
    });
    expect(r.patch).toEqual({});
    expect(r.conflicts).toEqual([]);
  });

  it('skips remote-wins on remote add (key only in remote)', () => {
    const r = resolveDict<string>({
      local: {},
      remote: { a: 'X' },
      snapshot: {},
    });
    expect(r.patch).toEqual({});
    expect(r.conflicts).toEqual([]);
  });

  it('flags conflict when both sides change the same key differently', () => {
    const r = resolveDict<string>({
      local: { a: 'Y' },
      remote: { a: 'Z' },
      snapshot: { a: 'X' },
    });
    expect(r.patch).toEqual({});
    expect(r.conflicts).toEqual([{ key: 'a', local: 'Y', remote: 'Z', snapshot: 'X' }]);
  });

  it('handles multi-key mixed cases', () => {
    const r = resolveDict<string>({
      local: { a: 'Y', b: 'X', c: 'M' }, // a edited, b unchanged, c added
      remote: { a: 'X', b: 'X', d: 'N' }, // a unchanged, b unchanged, d remote-added
      snapshot: { a: 'X', b: 'X' },
    });
    expect(r.patch).toEqual({ a: 'Y', c: 'M' });
    expect(r.conflicts).toEqual([]);
  });

  it('initial-push mode (remote = snapshot) never produces conflicts', () => {
    const snap = { a: 'X', b: 'Y' };
    const r = resolveDict<string>({
      local: { a: 'Z', b: 'Y' },
      remote: snap,
      snapshot: snap,
    });
    expect(r.patch).toEqual({ a: 'Z' });
    expect(r.conflicts).toEqual([]);
  });
});
