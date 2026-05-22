import type { MailTemplateProps } from '../../types.ts';

export const previewProps: MailTemplateProps['failed-login-alert'] = {
  displayName: 'Alex Lee',
  ip: '192.0.2.10',
  geo: 'Helsinki, FI',
  attemptedAt: '2026-05-20 13:45 UTC',
  resetUrl: 'https://app.seta.example/reset?token=preview',
};
