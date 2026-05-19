export type {
  Permission,
  PermissionDefinition,
  RoleDefinition,
  SessionScope,
  VisibilityGate,
} from './types.ts';
export { perm } from './types.ts';
export { hasPermission, passesGate } from './visibility.ts';
