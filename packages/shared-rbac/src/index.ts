export { renderModuleRbac, renderPermissionKeys } from './codegen.ts';
export type { PermissionKey } from './generated/permission-keys.ts';
export { ALL_PERMISSIONS } from './generated/permission-keys.ts';
export type { StatementSpec } from './inventory.ts';
export {
  ASSIGNABLE_ROLES,
  EDITABLE_ROLES,
  FOUNDATION_ROLES,
  IMPLICIT_PERMISSIONS,
  INVENTORY,
  inventoryToManifests,
} from './inventory.ts';
export type { ModuleRbacManifest, Statement } from './manifest.ts';
export { canonicalKeys, toManifest } from './manifest.ts';
export {
  PRODUCT_GATE_EXEMPT,
  PRODUCT_IDS,
  PRODUCT_NAMESPACES,
  PRODUCTS,
  type ProductId,
  productForNamespace,
} from './products.ts';
export type { RbacRegistry } from './registry.ts';
export { buildRegistry } from './registry.ts';
export type { RoleOverlay } from './resolve.ts';
export { can, resolvePermissions } from './resolve.ts';
export type { PermissionScope, ScopedAssignmentInput } from './scope.ts';
export { resolveScope } from './scope.ts';
export type { ScopeCtx, ScopeDecision, ScopePlan } from './scope-kit.ts';
export { assertSameTenant, CrossTenantError, scopeDecision, tenantScoped } from './scope-kit.ts';
export type {
  Permission,
  PermissionDefinition,
  RoleDefinition,
  SessionScope,
  VisibilityGate,
} from './types.ts';
export { perm } from './types.ts';
export { passesGate } from './visibility.ts';
