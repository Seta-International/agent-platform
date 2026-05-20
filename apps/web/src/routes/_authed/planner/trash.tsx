import { createFileRoute } from '@tanstack/react-router';
import { TrashPage } from '@/modules/planner/pages/trash-page';

export const Route = createFileRoute('/_authed/planner/trash')({
  component: TrashPage,
});
