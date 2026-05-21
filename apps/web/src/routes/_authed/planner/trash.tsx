import { createFileRoute } from '@tanstack/react-router';
import { useSession } from '@/modules/identity/components/SessionProvider';
import { TrashPage } from '@/modules/planner/pages/trash-page';

export const Route = createFileRoute('/_authed/planner/trash')({
  component: TrashRoute,
});

function TrashRoute() {
  const session = useSession();
  const canPermanentlyDelete =
    session.role_summary.roles.includes('org.admin') ||
    session.role_summary.roles.includes('tenant.admin');
  return <TrashPage canPermanentlyDelete={canPermanentlyDelete} />;
}
