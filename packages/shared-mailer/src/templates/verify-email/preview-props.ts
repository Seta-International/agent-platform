import type { MailTemplateProps } from '../../types.ts';

export const previewProps: MailTemplateProps['verify-email'] = {
  displayName: 'Alex Lee',
  verifyUrl: 'https://app.seta.example/verify?token=preview',
  expiresAt: '2026-05-21 09:00 UTC',
};
