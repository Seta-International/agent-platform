import { isDeepStrictEqual } from 'node:util';

export type FieldChange<T> = { local: T; remote: T; snapshot: T };

export type Decision<T> =
  | { kind: 'noop' }
  | { kind: 'local-wins'; value: T }
  | { kind: 'remote-wins'; value: T }
  | { kind: 'conflict'; local: T; remote: T; snapshot: T };

export function resolveField<T>(c: FieldChange<T>): Decision<T> {
  if (isDeepStrictEqual(c.local, c.remote)) return { kind: 'noop' };
  if (isDeepStrictEqual(c.local, c.snapshot)) return { kind: 'remote-wins', value: c.remote };
  if (isDeepStrictEqual(c.remote, c.snapshot)) return { kind: 'local-wins', value: c.local };
  return { kind: 'conflict', local: c.local, remote: c.remote, snapshot: c.snapshot };
}

export interface DictConflict<V> {
  key: string;
  local: V | undefined;
  remote: V | undefined;
  snapshot: V | undefined;
}

export interface DictResolution<V> {
  // Planner dict update semantics: keys present with a value are upserts; keys
  // present with `null` are deletions. Keys not in the patch are left untouched
  // server-side. See https://learn.microsoft.com/graph/api/planner-update.
  patch: Record<string, V | null>;
  conflicts: DictConflict<V>[];
}

export function resolveDict<V>(input: {
  local: Record<string, V | undefined>;
  remote: Record<string, V | undefined>;
  snapshot: Record<string, V | undefined>;
}): DictResolution<V> {
  const patch: Record<string, V | null> = {};
  const conflicts: DictConflict<V>[] = [];
  const allKeys = new Set<string>([
    ...Object.keys(input.local),
    ...Object.keys(input.remote),
    ...Object.keys(input.snapshot),
  ]);
  for (const k of allKeys) {
    const l = input.local[k];
    const r = input.remote[k];
    const s = input.snapshot[k];
    const decision = resolveField<V | undefined>({ local: l, remote: r, snapshot: s });
    if (decision.kind === 'local-wins') {
      patch[k] = decision.value === undefined ? null : decision.value;
    } else if (decision.kind === 'conflict') {
      conflicts.push({ key: k, local: l, remote: r, snapshot: s });
    }
  }
  return { patch, conflicts };
}

export interface MemberRef {
  entra_oid: string;
  role: 'owner' | 'member';
}

export interface MemberResolution {
  adds: MemberRef[];
  removes: { entra_oid: string }[];
  roleChanges: { entra_oid: string; after_role: 'owner' | 'member' }[];
  conflicts: {
    entra_oid: string;
    local_role: 'owner' | 'member';
    remote_role: 'owner' | 'member';
  }[];
}

export function resolveMembers(input: {
  remote: MemberRef[];
  local: MemberRef[];
  snapshot: MemberRef[];
}): MemberResolution {
  const byOid = <T extends { entra_oid: string }>(arr: T[]) =>
    new Map(arr.map((m) => [m.entra_oid, m]));
  const r = byOid(input.remote);
  const l = byOid(input.local);
  const s = byOid(input.snapshot);

  const adds: MemberRef[] = [];
  const removes: { entra_oid: string }[] = [];
  const roleChanges: MemberResolution['roleChanges'] = [];
  const conflicts: MemberResolution['conflicts'] = [];

  for (const [oid, rm] of r) {
    const sm = s.get(oid);
    const lm = l.get(oid);
    if (!sm) {
      // Remote added this member (not in snapshot)
      if (!lm) {
        adds.push(rm);
      } else if (lm.role !== rm.role) {
        // Both sides added the same member with different roles — conflict
        conflicts.push({ entra_oid: oid, local_role: lm.role, remote_role: rm.role });
      }
      // lm.role === rm.role: both sides added with same role, treat as noop (convergent)
    } else if (sm.role !== rm.role) {
      // Remote changed the role
      if (lm && lm.role !== sm.role && lm.role !== rm.role) {
        // Both sides changed to different roles — conflict
        conflicts.push({ entra_oid: oid, local_role: lm.role, remote_role: rm.role });
      } else {
        roleChanges.push({ entra_oid: oid, after_role: rm.role });
      }
    }
    // sm.role === rm.role: remote unchanged for this member
  }

  for (const [oid, sm] of s) {
    if (!r.has(oid)) {
      // Remote removed this member
      const lm = l.get(oid);
      if (lm && lm.role !== sm.role) {
        // Local also changed the role on a member remote deleted — conflict
        conflicts.push({ entra_oid: oid, local_role: lm.role, remote_role: 'member' });
      } else {
        removes.push({ entra_oid: oid });
      }
    }
  }

  return { adds, removes, roleChanges, conflicts };
}
