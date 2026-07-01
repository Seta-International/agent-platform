import { createFileRoute } from '@tanstack/react-router';
import { GroupsPage } from '../groups/pages/Groups.tsx';

export const Route = createFileRoute('/_authed/admin/groups')({
  component: GroupsPage,
});
