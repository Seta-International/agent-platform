import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import { z } from 'zod';
import { useSession } from '@/modules/identity/components/SessionProvider';
import { useDeletePlan } from '@/modules/planner/hooks/mutations/delete-plan';
import { useUpdatePlan } from '@/modules/planner/hooks/mutations/update-plan';
import { useGroup } from '@/modules/planner/hooks/queries/use-group';
import { usePlanBoard } from '@/modules/planner/hooks/queries/use-plan-board';
import { useRecentPlans } from '@/modules/planner/hooks/use-recent-plans';
import { PlanGridPage } from '@/modules/planner/pages/plan-grid-page';
import { PlanPage } from '@/modules/planner/pages/plan-page';
import {
  parseFiltersFromSearch,
  parseGroupBy,
  parseSearchQuery,
  parseViewMode,
  serializeFiltersToSearch,
} from '@/modules/planner/state/url-state';

const searchSchema = z.object({
  view: z.enum(['board', 'grid']).optional(),
  groupBy: z.enum(['bucket', 'assignee', 'priority', 'due', 'label']).optional(),
  'filter.assignee': z.string().optional(),
  'filter.label': z.string().optional(),
  'filter.skill': z.string().optional(),
  q: z.string().optional(),
});

export const Route = createFileRoute('/_authed/planner/plans_/$planId')({
  validateSearch: searchSchema,
  component: PlanRoute,
});

function PlanRoute() {
  const { planId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const session = useSession();

  const filters = parseFiltersFromSearch(search as Record<string, string | undefined>);
  const view = parseViewMode(search.view);
  const groupBy = parseGroupBy(search.groupBy);
  const q = parseSearchQuery(search.q);
  const onQChange = (next: string) =>
    navigate({ search: (prev) => ({ ...prev, q: next ? next : undefined }) });

  const boardQ = usePlanBoard(planId);
  const plan = boardQ.data?.plan;
  const groupId = plan?.group_id;
  const groupQ = useGroup(groupId ?? '');
  const updatePlan = useUpdatePlan(groupId ?? '', planId);
  const deletePlan = useDeletePlan(groupId ?? '', planId);

  const { recordVisit, evict } = useRecentPlans(session.tenant_id);
  const planName = plan?.name;
  useEffect(() => {
    if (planName) recordVisit(planId, planName);
  }, [planId, planName, recordVisit]);
  const errMsg = boardQ.error instanceof Error ? boardQ.error.message.toLowerCase() : '';
  const isStale =
    boardQ.isError &&
    (errMsg.includes('404') ||
      errMsg.includes('not found') ||
      errMsg.includes('403') ||
      errMsg.includes('forbidden') ||
      errMsg.includes('permission'));
  useEffect(() => {
    if (isStale) evict(planId);
  }, [isStale, planId, evict]);

  const canManage =
    session.role_summary.roles.includes('org.admin') ||
    session.role_summary.roles.includes('tenant.admin') ||
    (session.role_summary.roles.includes('planner.admin') &&
      groupId !== undefined &&
      session.accessible_group_ids.includes(groupId));

  const onFiltersChange = (f: typeof filters) =>
    navigate({ search: (prev) => ({ ...prev, ...serializeFiltersToSearch(f) }) });
  const onViewChange = (v: 'board' | 'grid') =>
    navigate({ search: (prev) => ({ ...prev, view: v === 'board' ? undefined : v }) });
  const onOpenTask = (taskId: string) =>
    void navigate({
      to: '/planner/plans/$planId/tasks/$taskId',
      params: { planId, taskId },
    });

  function onRenamePlan(name: string) {
    if (!plan) return;
    updatePlan.mutate({ expected_version: plan.version, patch: { name } });
  }
  function onDeletePlan() {
    if (!plan) return;
    deletePlan.mutate({ expected_version: plan.version });
    void navigate({ to: '/planner/groups/$groupId', params: { groupId: plan.group_id } });
  }

  return view === 'board' ? (
    <PlanPage
      planId={planId}
      view={view}
      filters={filters}
      onFiltersChange={onFiltersChange}
      onViewChange={onViewChange}
      onOpenTask={onOpenTask}
      q={q}
      onQChange={onQChange}
      currentUserId={session.user_id}
      groupName={groupQ.data?.name}
      canManage={canManage}
      onRenamePlan={onRenamePlan}
      onDeletePlan={onDeletePlan}
    />
  ) : (
    <PlanGridPage
      planId={planId}
      view={view}
      filters={filters}
      onFiltersChange={onFiltersChange}
      onViewChange={onViewChange}
      onOpenTask={onOpenTask}
      groupBy={groupBy}
      onGroupByChange={(g) =>
        navigate({ search: (prev) => ({ ...prev, groupBy: g === 'bucket' ? undefined : g }) })
      }
      q={q}
      onQChange={onQChange}
    />
  );
}
