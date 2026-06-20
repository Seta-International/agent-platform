import { createFileRoute } from '@tanstack/react-router';
import { RequisitionDetailPage } from '../../pages/requisition-detail-page.tsx';

function RouteComponent() {
  const { requisitionId } = Route.useParams();
  return <RequisitionDetailPage requisitionId={requisitionId} />;
}

export const Route = createFileRoute('/_authed/hiring/requisitions/$requisitionId')({
  component: RouteComponent,
});
