import { createFileRoute } from '@tanstack/react-router';
import { WorkflowsPage } from '@/modules/agent/workflows/pages/workflows-page.tsx';

export const Route = createFileRoute('/_authed/agent/workflows/')({
  component: WorkflowsPage,
});
