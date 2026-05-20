export type MailTemplateProps = {
  invite: {
    inviterName: string;
    tenantName: string;
    acceptUrl: string;
    expiresAt: string;
  };
  'verify-email': {
    displayName: string;
    verifyUrl: string;
    expiresAt: string;
  };
  'password-reset': {
    displayName: string;
    resetUrl: string;
    expiresAt: string;
    requestedFromIp: string;
  };
  'failed-login-alert': {
    displayName: string;
    ip: string;
    geo: string | null;
    attemptedAt: string;
    resetUrl: string;
  };
  '_test-send': {
    tenantName: string;
    attemptedAt: string;
  };
};

export type MailTemplateName = keyof MailTemplateProps;

export interface SendInput<TName extends MailTemplateName = MailTemplateName> {
  to: string;
  template: TName;
  props: MailTemplateProps[TName];
  tenantId: string;
  dedupeKey: string;
  replyTo?: string;
}

export interface SendResult {
  outgoingEmailId: string;
  deduped: boolean;
}

export interface Mailer {
  send<TName extends MailTemplateName>(input: SendInput<TName>): Promise<SendResult>;
}

export type MailerErrorCode =
  | 'TENANT_NOT_FOUND'
  | 'TRANSPORT_UNCONFIGURED'
  | 'TEMPLATE_RENDER_FAILED'
  | 'OUTBOX_INSERT_FAILED'
  | 'TRANSPORT_PERMANENT'
  | 'TRANSPORT_TRANSIENT';

export class MailerError extends Error {
  constructor(
    public readonly code: MailerErrorCode,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'MailerError';
  }
}
