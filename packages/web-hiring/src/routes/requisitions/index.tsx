import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { z } from 'zod';
import { RequisitionDetailDialog } from '../../pages/requisition-detail-dialog.tsx';
import { RequisitionsPage } from '../../pages/requisitions-page.tsx';

const searchSchema = z.object({
  /** Jira-style modal-over-board: when set, opens the requisition detail in a centered modal. */
  selectedRequisitionId: z.string().uuid().optional(),
});

function RouteComponent() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  return (
    <>
      <RequisitionsPage />
      {search.selectedRequisitionId && (
        <RequisitionDetailDialog
          requisitionId={search.selectedRequisitionId}
          onClose={() =>
            navigate({ search: (prev) => ({ ...prev, selectedRequisitionId: undefined }) })
          }
        />
      )}
    </>
  );
}

export const Route = createFileRoute('/_authed/hiring/requisitions/')({
  validateSearch: searchSchema,
  component: RouteComponent,
});
