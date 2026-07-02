import {
  resolveEffectiveAssignments,
  toRoleSlugs,
} from './domain/resolve-effective-assignments.ts';
import { resolveForRoles } from './rbac-registry.ts';

export class IdentityError extends Error {
  code: string;
  constructor(code: string, message?: string) {
    super(message ?? code);
    this.code = code;
    this.name = 'IdentityError';
  }
}

export async function requirePermission(
  userId: string,
  permission: string,
  tenantId: string,
): Promise<void> {
  const roles = toRoleSlugs(await resolveEffectiveAssignments(userId, tenantId));
  const perms = resolveForRoles(roles);
  if (!perms.has(permission)) {
    throw new IdentityError('FORBIDDEN', `Missing permission: ${permission}`);
  }
}
