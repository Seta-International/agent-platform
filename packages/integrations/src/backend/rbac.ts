export const INTEGRATIONS_PERMISSIONS = {
  mailConfigure: 'integrations.mail.configure',
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
