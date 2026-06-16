import type { ASSIGNABLE_ROLES } from '@seta/shared-rbac';

export { ASSIGNABLE_ROLES as TENANT_ROLE_SLUGS } from '@seta/shared-rbac';

export type TenantRoleSlug = (typeof ASSIGNABLE_ROLES)[number];
