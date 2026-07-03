import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { RequisitionDetailView } from '../../pages/requisition-detail-view.tsx';

function RouteComponent() {
  const { requisitionId } = Route.useParams();
  const navigate = useNavigate();
  return (
    <RequisitionDetailView
      requisitionId={requisitionId}
      variant="page"
      onClose={() => void navigate({ to: '/hiring/requisitions' })}
    />
  );
}

export const Route = createFileRoute('/_authed/hiring/requisitions/$requisitionId')({
  component: RouteComponent,
});
