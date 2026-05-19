import { describe, expect, it } from 'vitest';
import { passesGate, perm, type SessionScope, type VisibilityGate } from '../src/index.ts';

const session = (perms: string[], extra: Partial<SessionScope> = {}): SessionScope => ({
  userId: 'u1',
  tenantId: 't1',
  roleSummary: [],
  permissions: new Set(perms.map(perm)),
  accessibleGroupIds: [],
  crossTenantRead: false,
  ...extra,
});

describe('passesGate', () => {
  it('returns true when the session holds a single required permission', () => {
    expect(passesGate(perm('planner.task.read'), session(['planner.task.read']))).toBe(true);
  });

  it('returns false when the single required permission is missing', () => {
    expect(passesGate(perm('planner.task.read'), session(['planner.task.write']))).toBe(false);
  });

  it('anyOf returns true if at least one permission matches', () => {
    const gate: VisibilityGate = { anyOf: [perm('a'), perm('b')] };
    expect(passesGate(gate, session(['b']))).toBe(true);
  });

  it('anyOf returns false when none match', () => {
    const gate: VisibilityGate = { anyOf: [perm('a'), perm('b')] };
    expect(passesGate(gate, session(['c']))).toBe(false);
  });

  it('allOf returns true only when every permission matches', () => {
    const gate: VisibilityGate = { allOf: [perm('a'), perm('b')] };
    expect(passesGate(gate, session(['a', 'b']))).toBe(true);
    expect(passesGate(gate, session(['a']))).toBe(false);
  });

  it('predicate is invoked with the session', () => {
    const gate: VisibilityGate = { predicate: (s) => s.crossTenantRead };
    expect(passesGate(gate, session([], { crossTenantRead: true }))).toBe(true);
    expect(passesGate(gate, session([]))).toBe(false);
  });
});
