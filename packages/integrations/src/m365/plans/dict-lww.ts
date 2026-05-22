import { resolveField } from '../lww.ts';

export interface DictResolution<V> {
  applyRemote: Record<string, V | null>;
  pushLocal: Record<string, V | null>;
  conflicts: Record<string, { local: V | null; remote: V | null; snapshot: V | null }>;
}

const DEFAULT_EQUALS = <V>(a: V, b: V): boolean => Object.is(a, b);

export function resolveDict<V>(input: {
  local: Record<string, V>;
  remote: Record<string, V>;
  snapshot: Record<string, V>;
  equals?: (a: V, b: V) => boolean;
}): DictResolution<V> {
  const eq = input.equals ?? DEFAULT_EQUALS<V>;
  const out: DictResolution<V> = { applyRemote: {}, pushLocal: {}, conflicts: {} };

  const keys = new Set<string>([
    ...Object.keys(input.local),
    ...Object.keys(input.remote),
    ...Object.keys(input.snapshot),
  ]);

  for (const k of keys) {
    const sHas = Object.hasOwn(input.snapshot, k);
    const lHas = Object.hasOwn(input.local, k);
    const rHas = Object.hasOwn(input.remote, k);

    // Extract values only after confirming presence to avoid `V | undefined` widening.
    // The `as V` casts are sound: we only access these after the matching `*Has` guard.
    const s = input.snapshot[k] as V;
    const l = input.local[k] as V;
    const r = input.remote[k] as V;

    if (!sHas && !lHas && rHas) {
      // Remote added — apply locally
      out.applyRemote[k] = r;
    } else if (!sHas && lHas && !rHas) {
      // Local added — push to remote
      out.pushLocal[k] = l;
    } else if (!sHas && lHas && rHas) {
      // Both added independently
      if (!eq(l, r)) {
        out.conflicts[k] = { local: l, remote: r, snapshot: null };
      }
      // equal → noop
    } else if (sHas && !lHas && !rHas) {
      // Both deleted — noop; key is gone on both sides
    } else if (sHas && !lHas && rHas) {
      // Local deleted; remote may have changed
      if (eq(r, s)) {
        // Remote unchanged → local-wins delete; push null to remote on next sync
        out.pushLocal[k] = null;
      } else {
        // Remote changed while local deleted → conflict
        out.conflicts[k] = { local: null, remote: r, snapshot: s };
      }
    } else if (sHas && lHas && !rHas) {
      // Remote deleted; local may have changed
      if (eq(l, s)) {
        // Local unchanged → remote-wins delete; apply null locally
        out.applyRemote[k] = null;
      } else {
        // Local changed while remote deleted → conflict
        out.conflicts[k] = { local: l, remote: null, snapshot: s };
      }
    } else if (sHas && lHas && rHas) {
      // All three present — defer to resolveField (uses isDeepStrictEqual internally)
      const d = resolveField({ local: l, remote: r, snapshot: s });
      if (d.kind === 'remote-wins') {
        out.applyRemote[k] = d.value;
      } else if (d.kind === 'local-wins') {
        out.pushLocal[k] = d.value;
      } else if (d.kind === 'conflict') {
        out.conflicts[k] = { local: d.local, remote: d.remote, snapshot: d.snapshot };
      }
      // 'noop' → no output
    }
    // !sHas && !lHas && !rHas is impossible given the key came from one of the three objects
  }

  return out;
}
