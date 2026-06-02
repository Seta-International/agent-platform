import { createFileRoute } from '@tanstack/react-router';
import { GroupDiscoverPage } from '@/modules/planner/pages/group-discover-page';

export const Route = createFileRoute('/_authed/planner/groups_/discover')({
  component: GroupDiscoverPage,
});
