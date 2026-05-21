import { createFileRoute } from '@tanstack/react-router';
import { plannerClient } from '@/modules/planner/api/planner-client';
import { PlanCategoriesSettingsPage } from '@/modules/planner/pages/plan-categories-settings-page';
import { plannerKeys } from '@/modules/planner/state/query-keys';

export const Route = createFileRoute('/_authed/planner/plans_/$planId_/settings_/categories')({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData({
      queryKey: plannerKeys.planCategories(params.planId),
      queryFn: () => plannerClient.getPlanCategories(params.planId),
    }),
  component: PlanCategoriesSettingsRoute,
});

function PlanCategoriesSettingsRoute() {
  const { planId } = Route.useParams();
  return <PlanCategoriesSettingsPage planId={planId} />;
}
