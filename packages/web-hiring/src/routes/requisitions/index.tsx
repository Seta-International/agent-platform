import { createFileRoute } from '@tanstack/react-router';
import { RequisitionsPage } from '../../pages/requisitions-page.tsx';

export const Route = createFileRoute('/_authed/hiring/requisitions/')({
  component: RequisitionsPage,
});
