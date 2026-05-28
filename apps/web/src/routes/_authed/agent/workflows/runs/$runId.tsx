import { createFileRoute } from '@tanstack/react-router';
import { WorkflowRunPage } from '@/modules/agent/workflows/pages/workflow-run-page.tsx';

export const Route = createFileRoute('/_authed/agent/workflows/runs/$runId')({
  component: function WorkflowRunRoute() {
    const { runId } = Route.useParams();
    return <WorkflowRunPage runId={runId} />;
  },
});
