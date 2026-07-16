import {
  EmptyState,
  PLANNER_403_LIMIT_MESSAGES,
  type PlanConflictDecision,
  ResolvePlanConflictsDialog,
  useToast,
} from '@seta/shared-ui';
import { usePermission, useSession } from '@seta/web-identity';
import { useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { BoardSkeleton, GridSkeleton } from '../components/board-skeleton';
import { ConfirmDeletePlanDialog } from '../components/ConfirmDeletePlanDialog';
import { GridGroupBySelector } from '../components/grid-group-by-selector';
import { PlanError } from '../components/plan-error';
import { PlanFilterBar } from '../components/plan-filter-bar';
import { PlanPageHeader } from '../components/plan-page-header';
import { PlanSearchInput } from '../components/plan-search-input';
import { PlanViewSwitcher } from '../components/plan-view-switcher';
import { useArchivePlan } from '../hooks/mutations/archive-plan';
import { useDeletePlan } from '../hooks/mutations/delete-plan';
import { useDuplicatePlan } from '../hooks/mutations/duplicate-plan';
import { useRefreshPlanSync } from '../hooks/mutations/refresh-plan-sync';
import {
  type ResolvePlanDecisions,
  useResolvePlanConflicts,
} from '../hooks/mutations/resolve-plan-conflicts';
import { useUpdatePlan } from '../hooks/mutations/update-plan';
import { useGroup } from '../hooks/queries/use-group';
import { useMyGroups } from '../hooks/queries/use-my-groups';
import { usePlanBoard } from '../hooks/queries/use-plan-board';
import { useFilterOptions } from '../hooks/use-filter-options';
import { useRecentPlans } from '../hooks/use-recent-plans';
import type { BoardFilters, ViewMode } from '../state/url-state';
import {
  parseDateKey,
  parseFiltersFromSearch,
  parseGroupBy,
  parseSearchQuery,
  parseViewMode,
} from '../state/url-state';
import { PlanCalendarPage } from './plan-calendar-page';
import { PlanChartsView } from './plan-charts-view';
import { PlanGridPage } from './plan-grid-page';
import { PlanPage } from './plan-page';

export interface PlanBoardShellSearch {
  view?: 'board' | 'grid' | 'calendar' | 'charts';
  groupBy?: 'bucket' | 'assignee' | 'priority' | 'due' | 'label';
  'filter.assignee'?: string;
  'filter.label'?: string;
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
  onChartPatch: (extra: Record<string, string | undefined>) => void;
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
  onChartPatch,
}: Props) {
  const session = useSession();
  const toast = useToast();

  const filters = parseFiltersFromSearch(search as Record<string, string | undefined>);
  const view = parseViewMode(search.view);
  const groupBy = parseGroupBy(search.groupBy);
  const q = parseSearchQuery(search.q);
  const searchInputValue = search.q ?? '';
  const calFrom = parseDateKey(search.calFrom);
  const calTo = parseDateKey(search.calTo);
  const calPage = search.calPage && search.calPage >= 1 ? search.calPage : 1;

  const boardQ = usePlanBoard(planId);
  const filterOptions = useFilterOptions(boardQ.data);
  const plan = boardQ.data?.plan;
  const groupId = plan?.group_id;
  const groupQ = useGroup(groupId ?? '');
  const myGroupsQ = useMyGroups();
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

  // M365 link/unlink + sync controls have no dedicated permission key yet, so they stay on the
  // role/ownership proxy. Plan create/update/delete actions are gated by their RBAC permission.
  const canManage =
    session.role_summary.roles.includes('org.admin') ||
    session.role_summary.roles.includes('tenant.admin') ||
    (session.role_summary.roles.includes('planner.admin') &&
      groupId !== undefined &&
      (myGroupsQ.data ?? []).some((g) => g.id === groupId));
  const canCreatePlan = usePermission('planner.plan.create');
  const canUpdatePlan = usePermission('planner.plan.update');
  const canDeletePlan = usePermission('planner.plan.delete');

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
      toast({ body: 'Link copied to clipboard' });
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
        canRename={canUpdatePlan}
        canManage={canManage}
        canDuplicate={canCreatePlan}
        canArchive={canUpdatePlan}
        canDelete={canDeletePlan}
        onRename={onRenamePlan}
        onDuplicate={handleDuplicatePlan}
        onCopyShareLink={handleCopyShareLink}
        isArchived={resolvedPlan.archived_at !== null}
        onArchive={!resolvedPlan.archived_at ? handleArchivePlan : undefined}
        onRestore={undefined}
        onDelete={onDeletePlan}
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
          />
          <div className="plan-toolbar__divider" aria-hidden="true" />
          <PlanViewSwitcher value={view} onChange={onViewChange} />
          {view === 'grid' && <GridGroupBySelector value={groupBy} onChange={onGroupByChange} />}
        </div>
        <div className="plan-toolbar__right">
          <PlanSearchInput value={searchInputValue} onChange={onQChange} />
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
        <PlanChartsView
          planId={planId}
          search={search as Record<string, unknown>}
          onPatchSearch={onChartPatch}
        />
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
          groupId={resolvedPlan.group_id}
          buckets={buckets}
          tasks={tasks}
          filters={filters}
          onOpenTask={onOpenTask}
          groupBy={groupBy}
          q={q}
          isLinkedToM365={resolvedPlan.external_source === 'm365'}
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
