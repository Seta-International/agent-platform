import type { Permission, SessionScope, VisibilityGate } from './types.ts';

export function passesGate(gate: VisibilityGate, session: SessionScope): boolean {
  if (typeof gate === 'string') return session.permissions.has(gate as Permission);
  if ('anyOf' in gate) return gate.anyOf.some((p) => session.permissions.has(p));
  if ('allOf' in gate) return gate.allOf.every((p) => session.permissions.has(p));
  if ('predicate' in gate) return gate.predicate(session);
  return false;
}
