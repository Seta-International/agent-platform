import { usePermission } from '@seta/web-identity';
import { createFileRoute } from '@tanstack/react-router';
import { GroupsPage } from '../pages/groups-page';

export const Route = createFileRoute('/_authed/planner/groups')({
  component: GroupsRoute,
});

function GroupsRoute() {
  const canCreateGroup = usePermission('planner.group.create');
  return <GroupsPage canCreateGroup={canCreateGroup} />;
}
