import type { MailTemplateName } from './types.ts';

export const TEMPLATE_NAMES: readonly MailTemplateName[] = [
  'invite',
  'verify-email',
  'password-reset',
  'failed-login-alert',
  '_test-send',
] as const;
