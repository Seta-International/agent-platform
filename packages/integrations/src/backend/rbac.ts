export const INTEGRATIONS_PERMISSIONS = {
  mailRead: 'integrations.mail.read',
  mailConfigure: 'integrations.mail.configure',
  m365Read: 'integrations.m365.read',
  m365ConfigWrite: 'integrations.m365.config.write',
} as const;
export type IntegrationsPermission =
  (typeof INTEGRATIONS_PERMISSIONS)[keyof typeof INTEGRATIONS_PERMISSIONS];

export class IntegrationsError extends Error {
  constructor(
    public code: 'FORBIDDEN' | 'INVALID_INPUT' | 'NOT_FOUND' | 'TRANSPORT_VERIFY_FAILED',
    message: string,
  ) {
    super(message);
    this.name = 'IntegrationsError';
  }
}

export interface IntegrationsActorLike {
  permissions: ReadonlySet<string>;
}

export function requirePermission(actor: IntegrationsActorLike, permission: string): void {
  if (!actor.permissions.has(permission)) {
    throw new IntegrationsError('FORBIDDEN', `missing permission ${permission}`);
  }
}
