import { createFileRoute } from '@tanstack/react-router';
import { useSession } from '@/modules/identity/components/SessionProvider';
import { GroupsPage } from '@/modules/planner/pages/groups-page';

export const Route = createFileRoute('/_authed/planner/groups')({
  component: GroupsRoute,
});

function GroupsRoute() {
  const session = useSession();
  const canCreateGroup =
    session.role_summary.roles.includes('org.admin') ||
    session.role_summary.roles.includes('tenant.admin') ||
    session.role_summary.roles.includes('planner.admin');
  return <GroupsPage canCreateGroup={canCreateGroup} />;
}
