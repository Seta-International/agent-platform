import { createFileRoute } from '@tanstack/react-router';
import { WorkflowRunPage } from '@/modules/copilot/workflows/pages/workflow-run-page.tsx';

export const Route = createFileRoute('/_authed/copilot/workflows/runs/$runId')({
  component: function WorkflowRunRoute() {
    const { runId } = Route.useParams();
    return <WorkflowRunPage runId={runId} />;
  },
});
