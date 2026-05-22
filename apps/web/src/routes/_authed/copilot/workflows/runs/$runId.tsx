import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { WorkflowRunPage } from '@/modules/copilot/workflows/pages/workflow-run-page.tsx';

export const Route = createFileRoute('/_authed/copilot/workflows/runs/$runId')({
  // TanStack Router's default parseSearch coerces "1" to the number 1,
  // so the schema must accept both shapes.
  validateSearch: z.object({
    rerun: z.union([z.literal('1'), z.literal(1)]).optional(),
  }),
  component: function WorkflowRunRoute() {
    const { runId } = Route.useParams();
    const search = Route.useSearch();
    return <WorkflowRunPage runId={runId} rerunOpen={search.rerun === '1' || search.rerun === 1} />;
  },
});
