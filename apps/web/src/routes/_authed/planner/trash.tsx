import { createFileRoute } from '@tanstack/react-router';
import { usePermission } from '@/modules/identity/components/Can.tsx';
import { TrashPage } from '@/modules/planner/pages/trash-page';

export const Route = createFileRoute('/_authed/planner/trash')({
  component: TrashRoute,
});

function TrashRoute() {
  const canPermanentlyDelete = usePermission('planner.trash.empty');
  return <TrashPage canPermanentlyDelete={canPermanentlyDelete} />;
}
