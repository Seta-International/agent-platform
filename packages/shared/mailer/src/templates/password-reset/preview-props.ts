import type { MailTemplateProps } from '../../types.ts';

export const previewProps: MailTemplateProps['password-reset'] = {
  displayName: 'Alex Lee',
  resetUrl: 'https://app.seta.example/reset?token=preview',
  expiresAt: '2026-05-20 14:00 UTC',
  requestedFromIp: '192.0.2.10',
};
