import { createFileRoute } from '@tanstack/react-router';
import { MailTransport } from '@/modules/admin/mail-transport/pages/MailTransport.tsx';

export const Route = createFileRoute('/_authed/admin/mail')({
  component: MailTransport,
});
