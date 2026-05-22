import { describe, expect, it } from 'vitest';
import { resolveDict } from '../../../src/m365/plans/dict-lww.ts';

describe('resolveDict', () => {
  it('(S=a, L=a, R=p) — remote add', () => {
    const result = resolveDict({ local: {}, remote: { a: '1' }, snapshot: {} });
    expect(result.applyRemote).toEqual({ a: '1' });
    expect(result.pushLocal).toEqual({});
    expect(result.conflicts).toEqual({});
  });

  it('(S=a, L=p, R=a) — local add', () => {
    const result = resolveDict({ local: { a: '1' }, remote: {}, snapshot: {} });
    expect(result.applyRemote).toEqual({});
    expect(result.pushLocal).toEqual({ a: '1' });
    expect(result.conflicts).toEqual({});
  });

  it('(S=a, L=p, R=p) equal — add by both same value → noop', () => {
    const result = resolveDict({ local: { a: '1' }, remote: { a: '1' }, snapshot: {} });
    expect(result.applyRemote).toEqual({});
    expect(result.pushLocal).toEqual({});
    expect(result.conflicts).toEqual({});
  });

  it('(S=a, L=p, R=p) diff — add by both with different values → conflict', () => {
    const result = resolveDict({ local: { a: '1' }, remote: { a: '2' }, snapshot: {} });
    expect(result.applyRemote).toEqual({});
    expect(result.pushLocal).toEqual({});
    expect(result.conflicts).toEqual({ a: { local: '1', remote: '2', snapshot: null } });
  });

  it('(S=p, L=a, R=a) — deleted by both → noop', () => {
    const result = resolveDict({ local: {}, remote: {}, snapshot: { a: '1' } });
    expect(result.applyRemote).toEqual({});
    expect(result.pushLocal).toEqual({});
    expect(result.conflicts).toEqual({});
  });

  it('(S=p, L=a, R=p) remote unchanged — local-wins delete → pushLocal[k]=null', () => {
    const result = resolveDict({ local: {}, remote: { a: '1' }, snapshot: { a: '1' } });
    expect(result.applyRemote).toEqual({});
    expect(result.pushLocal).toEqual({ a: null });
    expect(result.conflicts).toEqual({});
  });

  it('(S=p, L=a, R=p) remote changed — conflict', () => {
    const result = resolveDict({ local: {}, remote: { a: '2' }, snapshot: { a: '1' } });
    expect(result.applyRemote).toEqual({});
    expect(result.pushLocal).toEqual({});
    expect(result.conflicts).toEqual({ a: { local: null, remote: '2', snapshot: '1' } });
  });

  it('(S=p, L=p, R=a) local unchanged — remote-wins delete → applyRemote[k]=null', () => {
    const result = resolveDict({ local: { a: '1' }, remote: {}, snapshot: { a: '1' } });
    expect(result.applyRemote).toEqual({ a: null });
    expect(result.pushLocal).toEqual({});
    expect(result.conflicts).toEqual({});
  });

  it('(S=p, L=p, R=a) local changed — conflict', () => {
    const result = resolveDict({ local: { a: '2' }, remote: {}, snapshot: { a: '1' } });
    expect(result.applyRemote).toEqual({});
    expect(result.pushLocal).toEqual({});
    expect(result.conflicts).toEqual({ a: { local: '2', remote: null, snapshot: '1' } });
  });

  describe('(S=p, L=p, R=p) — delegates to resolveField', () => {
    it('noop — local==remote (both diverged from snapshot the same way)', () => {
      // local === remote → resolveField returns noop
      const result = resolveDict({ local: { a: '2' }, remote: { a: '2' }, snapshot: { a: '1' } });
      expect(result.applyRemote).toEqual({});
      expect(result.pushLocal).toEqual({});
      expect(result.conflicts).toEqual({});
    });

    it('remote-wins — only remote changed (local==snapshot)', () => {
      const result = resolveDict({ local: { a: '1' }, remote: { a: '2' }, snapshot: { a: '1' } });
      expect(result.applyRemote).toEqual({ a: '2' });
      expect(result.pushLocal).toEqual({});
      expect(result.conflicts).toEqual({});
    });

    it('local-wins — only local changed (remote==snapshot)', () => {
      const result = resolveDict({ local: { a: '2' }, remote: { a: '1' }, snapshot: { a: '1' } });
      expect(result.applyRemote).toEqual({});
      expect(result.pushLocal).toEqual({ a: '2' });
      expect(result.conflicts).toEqual({});
    });

    it('conflict — both local and remote changed to different values', () => {
      const result = resolveDict({ local: { a: '2' }, remote: { a: '3' }, snapshot: { a: '1' } });
      expect(result.applyRemote).toEqual({});
      expect(result.pushLocal).toEqual({});
      expect(result.conflicts).toEqual({ a: { local: '2', remote: '3', snapshot: '1' } });
    });
  });

  it('custom equals — deep-equal for object values; local diverges, remote==snapshot → local-wins', () => {
    type Item = { title: string; checked: boolean };
    const deepEquals = (a: Item, b: Item) => a.title === b.title && a.checked === b.checked;

    const snapshot = { k: { title: 'Task A', checked: false } };
    const remote = { k: { title: 'Task A', checked: false } }; // structurally equal to snapshot
    const local = { k: { title: 'Task A', checked: true } }; // local changed

    const result = resolveDict<Item>({ local, remote, snapshot, equals: deepEquals });
    // remote==snapshot (via custom equals) → local-wins → pushLocal[k] = localValue
    expect(result.pushLocal).toEqual({ k: { title: 'Task A', checked: true } });
    expect(result.applyRemote).toEqual({});
    expect(result.conflicts).toEqual({});
  });

  it('empty inputs — all output maps empty', () => {
    const result = resolveDict({ local: {}, remote: {}, snapshot: {} });
    expect(result.applyRemote).toEqual({});
    expect(result.pushLocal).toEqual({});
    expect(result.conflicts).toEqual({});
  });
});
