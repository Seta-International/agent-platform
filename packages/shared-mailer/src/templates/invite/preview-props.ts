import type { MailTemplateProps } from '../../types.ts';

export const previewProps: MailTemplateProps['invite'] = {
  inviterName: 'Sam Chen',
  tenantName: 'Acme',
  acceptUrl: 'https://app.seta.example/accept?token=preview',
  expiresAt: '2026-05-21 09:00 UTC',
};
