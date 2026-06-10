import { createFileRoute } from '@tanstack/react-router';
import { usePermission } from '@/modules/identity/components/Can.tsx';
import { GroupsPage } from '@/modules/planner/pages/groups-page';

export const Route = createFileRoute('/_authed/planner/groups')({
  component: GroupsRoute,
});

function GroupsRoute() {
  const canCreateGroup = usePermission('planner.group.create');
  return <GroupsPage canCreateGroup={canCreateGroup} />;
}
