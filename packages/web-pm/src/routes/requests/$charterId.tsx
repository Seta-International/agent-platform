import { createFileRoute } from '@tanstack/react-router';
import { CharterDetailPage } from '../../pages/charter-detail-page.tsx';

function RouteComponent() {
  const { charterId } = Route.useParams();
  return <CharterDetailPage charterId={charterId} />;
}

export const Route = createFileRoute('/_authed/pm/requests/$charterId')({
  component: RouteComponent,
});
