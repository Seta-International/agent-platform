import type { SessionScope } from '@seta/core';
import { can } from '@seta/shared-rbac';
import type { KnowledgePermission } from '../rbac.ts';

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
  if (!can(session, permission))
    throw new KnowledgeError('FORBIDDEN', `Missing permission: ${permission}`);
}
