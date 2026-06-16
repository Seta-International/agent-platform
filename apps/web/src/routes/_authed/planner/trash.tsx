import { usePermission } from '@seta/web-identity';
import { createFileRoute } from '@tanstack/react-router';
import { TrashPage } from '@/modules/planner/pages/trash-page';

export const Route = createFileRoute('/_authed/planner/trash')({
  component: TrashRoute,
});

function TrashRoute() {
  const canPermanentlyDelete = usePermission('planner.trash.empty');
  return <TrashPage canPermanentlyDelete={canPermanentlyDelete} />;
}
