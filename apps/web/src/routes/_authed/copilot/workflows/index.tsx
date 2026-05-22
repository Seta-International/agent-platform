import { createFileRoute } from '@tanstack/react-router';
import { WorkflowsPage } from '@/modules/copilot/workflows/pages/workflows-page.tsx';

export const Route = createFileRoute('/_authed/copilot/workflows/')({
  component: WorkflowsPage,
});
