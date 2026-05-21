import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { WorkflowRunPage } from '@/modules/copilot/workflows/pages/workflow-run-page.tsx';

export const Route = createFileRoute('/_authed/copilot/workflows/runs/$runId')({
  validateSearch: z.object({ rerun: z.literal('1').optional() }),
  component: function WorkflowRunRoute() {
    const { runId } = Route.useParams();
    const search = Route.useSearch();
    return <WorkflowRunPage runId={runId} rerunOpen={search.rerun === '1'} />;
  },
});
