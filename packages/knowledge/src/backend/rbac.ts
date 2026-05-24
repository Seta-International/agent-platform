import type { SessionScope } from '@seta/core';
import { hasPermission } from '@seta/shared-rbac';
import {
  KNOWLEDGE_ROLE_PERMISSIONS,
  KNOWLEDGE_ROLE_SLUGS,
  type KnowledgePermission,
  type KnowledgeRoleSlug,
} from '../rbac.ts';

export type KnowledgeErrorCode = 'NOT_FOUND' | 'FORBIDDEN' | 'CONFLICT' | 'VALIDATION';

export class KnowledgeError extends Error {
  readonly code: KnowledgeErrorCode;
  constructor(code: KnowledgeErrorCode, message: string) {
    super(message);
    this.name = 'KnowledgeError';
    this.code = code;
  }
}

export function requirePermission(session: SessionScope, permission: KnowledgePermission): void {
  if (
    hasPermission(
      {
        roles: session.role_summary.roles,
        cross_tenant_read: session.role_summary.cross_tenant_read,
      },
      permission,
    )
  ) {
    return;
  }
  if (session.role_summary.cross_tenant_read && permission.endsWith('.read')) return;

  const held = session.role_summary.roles.filter((r): r is KnowledgeRoleSlug =>
    (KNOWLEDGE_ROLE_SLUGS as readonly string[]).includes(r),
  );
  const granted = held.some((slug) => KNOWLEDGE_ROLE_PERMISSIONS[slug].includes(permission));
  if (!granted) {
    throw new KnowledgeError('FORBIDDEN', `Missing permission: ${permission}`);
  }
}
