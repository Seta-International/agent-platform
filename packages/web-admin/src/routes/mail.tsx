import { createFileRoute } from '@tanstack/react-router';
import { MailTransport } from '../mail-transport/pages/MailTransport.tsx';

export const Route = createFileRoute('/_authed/admin/mail')({
  component: MailTransport,
});
