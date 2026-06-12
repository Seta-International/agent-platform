import {
  EmptyState,
  PLANNER_403_LIMIT_MESSAGES,
  type PlanConflictDecision,
  ResolvePlanConflictsDialog,
  toast,
} from '@seta/shared-ui';
import { useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useSession } from '@/modules/identity/components/SessionProvider';
import { BoardSkeleton, GridSkeleton } from '@/modules/planner/components/board-skeleton';
import { ConfirmDeletePlanDialog } from '@/modules/planner/components/ConfirmDeletePlanDialog';
import { GridGroupBySelector } from '@/modules/planner/components/grid-group-by-selector';
import { PlanError } from '@/modules/planner/components/plan-error';
import { PlanFilterBar } from '@/modules/planner/components/plan-filter-bar';
import { PlanPageHeader } from '@/modules/planner/components/plan-page-header';
import { useArchivePlan } from '@/modules/planner/hooks/mutations/archive-plan';
import { useDeletePlan } from '@/modules/planner/hooks/mutations/delete-plan';
import { useDuplicatePlan } from '@/modules/planner/hooks/mutations/duplicate-plan';
import { useRefreshPlanSync } from '@/modules/planner/hooks/mutations/refresh-plan-sync';
import {
  type ResolvePlanDecisions,
  useResolvePlanConflicts,
} from '@/modules/planner/hooks/mutations/resolve-plan-conflicts';
import { useUpdatePlan } from '@/modules/planner/hooks/mutations/update-plan';
import { useGroup } from '@/modules/planner/hooks/queries/use-group';
import { usePlanBoard } from '@/modules/planner/hooks/queries/use-plan-board';
import { useFilterOptions } from '@/modules/planner/hooks/use-filter-options';
import { useRecentPlans } from '@/modules/planner/hooks/use-recent-plans';
import { PlanCalendarPage } from '@/modules/planner/pages/plan-calendar-page';
import { PlanChartsView } from '@/modules/planner/pages/plan-charts-view';
import { PlanGridPage } from '@/modules/planner/pages/plan-grid-page';
import { PlanPage } from '@/modules/planner/pages/plan-page';
import type { BoardFilters, ViewMode } from '@/modules/planner/state/url-state';
import {
  parseDateKey,
  parseFiltersFromSearch,
  parseGroupBy,
  parseSearchQuery,
  parseViewMode,
} from '@/modules/planner/state/url-state';
import { PlanSearchInput } from '../components/plan-search-input';
import { PlanViewSwitcher } from '../components/plan-view-switcher';

export interface PlanBoardShellSearch {
  view?: 'board' | 'grid' | 'calendar' | 'charts';
  groupBy?: 'bucket' | 'assignee' | 'priority' | 'due' | 'label';
  'filter.assignee'?: string;
  'filter.label'?: string;
  'filter.skill'?: string;
  q?: string;
  calFrom?: string;
  calTo?: string;
  calPage?: number;
}

interface Props {
  planId: string;
  search: PlanBoardShellSearch;
  /** Navigation callbacks owned by the route so TanStack's typed router is happy. */
  onQChange: (next: string) => void;
  onFiltersChange: (next: BoardFilters) => void;
  onViewChange: (next: ViewMode) => void;
  onGroupByChange: (next: 'bucket' | 'assignee' | 'priority' | 'due' | 'label') => void;
  onOpenTask: (taskId: string) => void;
  onLeaveAfterDelete: (groupId: string) => void;
  onCalendarRangeChange: (from: string, to: string, opts?: { replace?: boolean }) => void;
  onCalendarPageChange: (page: number) => void;
}

export function PlanBoardShell({
  planId,
  search,
  onQChange,
  onFiltersChange,
  onViewChange,
  onGroupByChange,
  onOpenTask,
  onLeaveAfterDelete,
  onCalendarRangeChange,
  onCalendarPageChange,
}: Props) {
  const session = useSession();

  const filters = parseFiltersFromSearch(search as Record<string, string | undefined>);
  const view = parseViewMode(search.view);
  const groupBy = parseGroupBy(search.groupBy);
  const q = parseSearchQuery(search.q);
  const calFrom = parseDateKey(search.calFrom);
  const calTo = parseDateKey(search.calTo);
  const calPage = search.calPage && search.calPage >= 1 ? search.calPage : 1;

  const boardQ = usePlanBoard(planId);
  const filterOptions = useFilterOptions(boardQ.data);
  const plan = boardQ.data?.plan;
  const groupId = plan?.group_id;
  const groupQ = useGroup(groupId ?? '');
  const navigate = useNavigate();
  const updatePlan = useUpdatePlan(groupId ?? '', planId);
  const deletePlan = useDeletePlan(groupId ?? '', planId);
  const archivePlan = useArchivePlan(groupId ?? '', planId);
  const duplicatePlan = useDuplicatePlan(groupId ?? '');
  const refreshSync = useRefreshPlanSync(planId);
  const resolveConflicts = useResolvePlanConflicts(planId);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [conflictDialogOpen, setConflictDialogOpen] = useState(false);

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

  function onRenamePlan(name: string) {
    if (!plan) return;
    updatePlan.mutate({ expected_version: plan.version, patch: { name } });
  }
  function onDeletePlan() {
    if (!plan) return;
    setDeleteDialogOpen(true);
  }
  function handleConfirmDelete() {
    if (!plan) return;
    deletePlan.mutate({ expected_version: plan.version });
    setDeleteDialogOpen(false);
    onLeaveAfterDelete(plan.group_id);
  }

  function handleArchivePlan() {
    if (!plan) return;
    archivePlan.mutate(undefined, {
      onSuccess: () => onLeaveAfterDelete(plan.group_id),
    });
  }

  function handleDuplicatePlan() {
    if (!plan) return;
    duplicatePlan.mutate(
      { plan_id: plan.id },
      {
        onSuccess: (newPlan) => {
          if (newPlan)
            void navigate({ to: '/planner/plans/$planId', params: { planId: newPlan.id } });
        },
      },
    );
  }

  function handleCopyShareLink() {
    void navigator.clipboard.writeText(window.location.href).then(() => {
      toast('Link copied to clipboard');
    });
  }

  if (boardQ.isPending) {
    return view === 'board' ? <BoardSkeleton /> : <GridSkeleton />;
  }
  if (boardQ.isError || !boardQ.data) {
    return <PlanError onRetry={() => boardQ.refetch()} />;
  }

  const { buckets, tasks } = boardQ.data;
  // Narrow plan now that data is resolved.
  const resolvedPlan = boardQ.data.plan;
  const groupName = groupQ.data?.name;
  const currentUserId = session.user_id;

  const isPulling = resolvedPlan.sync_status === 'pulling' && tasks.length === 0;

  return (
    <div className={view === 'board' ? 'plan-page' : 'plan-grid-page'}>
      <PlanPageHeader
        planName={resolvedPlan.name}
        groupName={groupName}
        groupId={resolvedPlan.group_id}
        bucketCount={buckets.length}
        taskCount={tasks.length}
        myTaskCount={
          currentUserId
            ? tasks.filter((t) => t.assignees.some((a) => a.user_id === currentUserId)).length
            : undefined
        }
        canRename={canManage}
        canManage={canManage}
        onRename={onRenamePlan}
        onDuplicate={canManage ? handleDuplicatePlan : undefined}
        onCopyShareLink={handleCopyShareLink}
        isArchived={resolvedPlan.archived_at !== null}
        onArchive={canManage && !resolvedPlan.archived_at ? handleArchivePlan : undefined}
        onRestore={undefined}
        onDelete={canManage ? onDeletePlan : undefined}
        external_source={resolvedPlan.external_source}
        syncStatus={resolvedPlan.sync_status}
        externalSyncedAt={resolvedPlan.external_synced_at}
        externalId={resolvedPlan.external_id}
        conflictCount={null}
        onRefreshSync={
          resolvedPlan.external_source === 'm365' ? () => refreshSync.mutate() : undefined
        }
        onOpenConflictDialog={
          resolvedPlan.external_source === 'm365' ? () => setConflictDialogOpen(true) : undefined
        }
      />
      <div className="plan-toolbar">
        <div className="plan-toolbar__left">
          <PlanFilterBar
            filters={filters}
            onChange={onFiltersChange}
            assigneeOptions={filterOptions.assigneeOptions}
            labelOptions={filterOptions.labelOptions}
            skillOptions={filterOptions.skillOptions}
          />
          <div className="plan-toolbar__divider" aria-hidden="true" />
          <PlanViewSwitcher value={view} onChange={onViewChange} />
          {view === 'grid' && <GridGroupBySelector value={groupBy} onChange={onGroupByChange} />}
        </div>
        <div className="plan-toolbar__right">
          <PlanSearchInput value={q} onChange={onQChange} />
        </div>
      </div>

      {resolvedPlan.sync_status === 'error' && resolvedPlan.last_error && (
        <div
          role="alert"
          className="mx-7 mt-3 rounded border border-semantic-danger bg-semantic-danger-tint p-3 text-body-sm"
          data-testid="plan-sync-error-banner"
        >
          <div className="font-medium">
            Sync didn&apos;t work:{' '}
            {PLANNER_403_LIMIT_MESSAGES[resolvedPlan.last_error] ?? resolvedPlan.last_error}
          </div>
          <button
            type="button"
            className="mt-2 text-primary underline"
            onClick={() => refreshSync.mutate()}
            disabled={refreshSync.isPending}
          >
            Try sync again
          </button>
        </div>
      )}
      {resolvedPlan.sync_status === 'conflict' && (
        <div
          className="mx-7 mt-3 rounded border border-semantic-warning bg-semantic-warning-tint p-3 text-body-sm"
          data-testid="plan-sync-conflict-banner"
        >
          <div className="font-medium">A few changes clashed — pick which version to keep</div>
          <button
            type="button"
            className="mt-2 text-primary underline"
            onClick={() => setConflictDialogOpen(true)}
          >
            Review changes
          </button>
        </div>
      )}

      {isPulling ? (
        <div role="status" data-testid="plan-sync-pulling-empty">
          <EmptyState
            title="Bringing in your Microsoft Planner tasks…"
            description="This can take a minute for large plans."
          />
        </div>
      ) : view === 'charts' ? (
        <PlanChartsView planId={planId} />
      ) : view === 'board' ? (
        <PlanPage
          plan={resolvedPlan}
          buckets={buckets}
          tasks={tasks}
          filters={filters}
          onFiltersChange={onFiltersChange}
          onOpenTask={onOpenTask}
          q={q}
          onQChange={onQChange}
        />
      ) : view === 'calendar' ? (
        <PlanCalendarPage
          planId={planId}
          calFrom={calFrom}
          calTo={calTo}
          calPage={calPage}
          filters={filters}
          q={q}
          onRangeChange={onCalendarRangeChange}
          onPageChange={onCalendarPageChange}
          onOpenTask={onOpenTask}
          onSwitchToBoard={() => onViewChange('board')}
        />
      ) : (
        <PlanGridPage
          planId={planId}
          buckets={buckets}
          tasks={tasks}
          filters={filters}
          onOpenTask={onOpenTask}
          groupBy={groupBy}
          q={q}
        />
      )}

      <ConfirmDeletePlanDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        externalSource={resolvedPlan.external_source === 'm365' ? 'm365' : 'native'}
        onConfirm={handleConfirmDelete}
        pending={deletePlan.isPending}
      />
      {resolvedPlan.external_source === 'm365' && (
        <ResolvePlanConflictsDialog
          open={conflictDialogOpen}
          onOpenChange={setConflictDialogOpen}
          data={{ planId: resolvedPlan.id, planLevelConflicts: [], taskConflicts: [] }}
          onApply={async (decisions: PlanConflictDecision[]) => {
            const apiDecisions: ResolvePlanDecisions = decisions.map((d) =>
              d.kind === 'plan'
                ? { kind: 'plan', field: d.field, choice: d.choice }
                : { kind: 'task', task_id: d.taskId, field: d.field, choice: d.choice },
            );
            await resolveConflicts.mutateAsync(apiDecisions);
            setConflictDialogOpen(false);
          }}
        />
      )}
    </div>
  );
}
