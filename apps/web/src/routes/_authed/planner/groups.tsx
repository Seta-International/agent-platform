import { createFileRoute } from '@tanstack/react-router';
import { GroupsPage } from '@/modules/planner/pages/groups-page';

export const Route = createFileRoute('/_authed/planner/groups')({
  component: GroupsPage,
});
