import { createFileRoute } from '@tanstack/react-router';
import { RequestsPage } from '../../pages/requests-page.tsx';

export const Route = createFileRoute('/_authed/pm/requests/')({
  component: RequestsPage,
});
