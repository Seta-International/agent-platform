import { can } from '@seta/shared-rbac';
import type { SessionScope } from '../../session/scope.ts';

export type CoreSkillErrorCode = 'NOT_FOUND' | 'FORBIDDEN' | 'CONFLICT' | 'VALIDATION';

export class CoreSkillError extends Error {
  readonly code: CoreSkillErrorCode;
  constructor(code: CoreSkillErrorCode, message: string) {
    super(message);
    this.name = 'CoreSkillError';
    this.code = code;
  }
}

export function requireSkillPermission(
  session: SessionScope,
  permission: 'core.skill.read' | 'core.skill.manage',
): void {
  if (!can(session, permission)) {
    throw new CoreSkillError('FORBIDDEN', `Missing permission: ${permission}`);
  }
}
