export type Permission = string & { readonly __brand: 'Permission' };
export const perm = (s: string): Permission => s as Permission;

export interface SessionScope {
  userId: string;
  tenantId: string;
  roleSummary: readonly string[];
  permissions: ReadonlySet<Permission>;
  accessibleGroupIds: readonly string[];
  crossTenantRead: boolean;
}

export type VisibilityGate =
  | Permission
  | { anyOf: Permission[] }
  | { allOf: Permission[] }
  | { predicate: (s: SessionScope) => boolean };

export interface PermissionDefinition {
  key: Permission;
  description: string;
  module: string;
}

export interface RoleDefinition {
  key: string;
  permissions: readonly Permission[];
  description?: string;
}
