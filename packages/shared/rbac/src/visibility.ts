import type { Permission, SessionScope, VisibilityGate } from './types.ts';

export function passesGate(gate: VisibilityGate, session: SessionScope): boolean {
  if (typeof gate === 'string') return session.permissions.has(gate as Permission);
  if ('anyOf' in gate) return gate.anyOf.some((p) => session.permissions.has(p));
  if ('allOf' in gate) return gate.allOf.every((p) => session.permissions.has(p));
  if ('predicate' in gate) return gate.predicate(session);
  return false;
}

// Minimal first-pass: org.admin and tenant.admin grant all permissions.
// Per-permission resolution lands when the permission registry is defined.
export function hasPermission(
  ctx: { roles: readonly string[]; cross_tenant_read?: boolean },
  permission: string,
): boolean {
  void permission;
  return ctx.roles.some((r) => r === 'org.admin' || r === 'tenant.admin');
}
