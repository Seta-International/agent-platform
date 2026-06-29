import { createFileRoute } from '@tanstack/react-router';
import { GroupDiscoverPage } from '../../pages/group-discover-page';

export const Route = createFileRoute('/_authed/planner/groups_/discover')({
  component: GroupDiscoverPage,
});
