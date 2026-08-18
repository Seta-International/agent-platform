import {
  AlertDialog,
  Dialog,
  DialogFooter,
  DialogHeader,
  Heading,
  Layout,
  LayoutContent,
} from '@seta/shared-ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import {
  type AppliedMetricCoverage,
  fetchAppliedMetrics,
  fetchKpiNorm,
  type KpiCategory,
  type ProjectListRow,
  setAppliedMetric,
} from '../api/pm-client.ts';
import { pmKeys } from '../state/query-keys.ts';
import { Badge, Button, Checkbox, Input, ScrollArea, Skeleton, toast } from './_ui-compat.tsx';
import {
  formatBandTriple,
  KPI_CATEGORIES,
  KPI_CATEGORY_LABELS,
  metricUnit,
} from './kpi-shared.tsx';

const flagLabel = (category: KpiCategory): string =>
  KPI_CATEGORY_LABELS[category].replace(/^.*— /, '');

export function KpiConfigureDialog({
  open,
  onOpenChange,
  projects,
  initialProjectId,
  currentWeek,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Projects the caller may configure — already scoped (PMO/BOD: every tenant project;
   * EM/TL: only projects they own via `can_manage`, functional-analysis.md §2d). */
  projects: ProjectListRow[];
  initialProjectId?: string;
  currentWeek?: { iso_year: number; iso_week: number };
}) {
  const queryClient = useQueryClient();
  const sortedProjects = [...projects].sort((a, b) => a.name.localeCompare(b.name));
  const [selected, setSelected] = useState<Set<string>>(
    () =>
      new Set(
        initialProjectId && projects.some((p) => p.project_id === initialProjectId)
          ? [initialProjectId]
          : [],
      ),
  );
  const [filter, setFilter] = useState('');
  const [metricFilter, setMetricFilter] = useState('');
  const [confirmOff, setConfirmOff] = useState<{
    metricId: string;
    name: string;
    category: KpiCategory;
    enteredCount: number;
  } | null>(null);
  const [categoryBlocked, setCategoryBlocked] = useState<{
    metricName: string;
    category: KpiCategory;
    projectCount: number;
  } | null>(null);
  const selectedIds = [...selected];

  const normQuery = useQuery({ queryKey: pmKeys.kpiNorm(), queryFn: fetchKpiNorm });
  const week = currentWeek;
  const weekLabel = currentWeek
    ? `${currentWeek.iso_year}-W${String(currentWeek.iso_week).padStart(2, '0')}`
    : '';
  const appliedQuery = useQuery({
    queryKey: pmKeys.kpiAppliedMetrics(selectedIds, week),
    queryFn: () => fetchAppliedMetrics(selectedIds, week),
    enabled: selectedIds.length > 0,
  });

  const toggle = useMutation({
    mutationFn: ({ metricId, applied }: { metricId: string; applied: boolean }) =>
      setAppliedMetric(metricId, applied, selectedIds),
    onMutate: async ({ metricId, applied }) => {
      const key = pmKeys.kpiAppliedMetrics(selectedIds, week);
      await queryClient.cancelQueries({ queryKey: key });
      const prev = queryClient.getQueryData<AppliedMetricCoverage[]>(key);
      queryClient.setQueryData<AppliedMetricCoverage[]>(key, (old) => {
        const list = old ?? [];
        const nextCount = applied ? selectedIds.length : 0;
        const idx = list.findIndex((c) => c.metric_id === metricId);
        if (idx === -1)
          return [
            ...list,
            {
              metric_id: metricId,
              applied_count: nextCount,
              entered_count: 0,
              would_empty_count: 0,
            },
          ];
        return list.map((c) => (c.metric_id === metricId ? { ...c, applied_count: nextCount } : c));
      });
      return { key, prev };
    },
    onError: (err: Error & { details?: Record<string, unknown> }, vars, ctx) => {
      if (ctx) queryClient.setQueryData(ctx.key, ctx.prev);
      const emptyProjectIds = err.details?.empty_project_ids;
      if (Array.isArray(emptyProjectIds) && emptyProjectIds.length > 0) {
        const m = metrics.find((mm) => mm.metric_id === vars.metricId);
        setCategoryBlocked({
          metricName: m?.name ?? '',
          category: (err.details?.category as KpiCategory | undefined) ?? m?.category ?? 'quality',
          projectCount: emptyProjectIds.length,
        });
        return;
      }
      toast.error(err.message || 'Could not update metric');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pmKeys.all });
    },
  });

  const coverage = new Map((appliedQuery.data ?? []).map((c) => [c.metric_id, c.applied_count]));
  const entered = new Map((appliedQuery.data ?? []).map((c) => [c.metric_id, c.entered_count]));
  const wouldEmpty = new Map(
    (appliedQuery.data ?? []).map((c) => [c.metric_id, c.would_empty_count]),
  );
  const coverageIsStale = toggle.isPending || appliedQuery.isFetching;
  const metrics = normQuery.data?.metrics ?? [];

  const metricQuery = metricFilter.trim().toLowerCase();
  const matchesMetricQuery = (m: (typeof metrics)[number]) =>
    !metricQuery ||
    m.name.toLowerCase().includes(metricQuery) ||
    m.formula_label.toLowerCase().includes(metricQuery);
  const hasMetricMatches = metrics.some(matchesMetricQuery);
  const appliedSummary =
    appliedQuery.data && metrics.length > 0
      ? `${metrics.filter((m) => (coverage.get(m.metric_id) ?? 0) === selectedIds.length).length}/${metrics.length}`
      : null;

  const visibleProjects = filter.trim()
    ? sortedProjects.filter((p) => p.name.toLowerCase().includes(filter.trim().toLowerCase()))
    : sortedProjects;
  const visibleSelectedCount = visibleProjects.filter((p) => selected.has(p.project_id)).length;
  const allSelected = visibleProjects.length > 0 && visibleSelectedCount === visibleProjects.length;
  const selectAllState: boolean | 'indeterminate' = allSelected
    ? true
    : visibleSelectedCount > 0
      ? 'indeterminate'
      : false;
  const toggleAll = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const p of visibleProjects) {
        if (allSelected) next.delete(p.project_id);
        else next.add(p.project_id);
      }
      return next;
    });
  const toggleProject = (projectId: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });

  const projectListRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!initialProjectId) return;
    const scroller = projectListRef.current;
    const row = scroller?.querySelector<HTMLElement>(`[data-project-row="${initialProjectId}"]`);
    if (!scroller || !row) return;
    const view = scroller.getBoundingClientRect();
    const target = row.getBoundingClientRect();
    scroller.scrollTop += target.top - view.top - (view.height - target.height) / 2;
  }, [initialProjectId]);

  return (
    <Dialog isOpen={open} onOpenChange={onOpenChange} width={880} maxHeight="85vh" purpose="info">
      <Layout
        header={<DialogHeader title="Configure KPI metrics" onOpenChange={onOpenChange} />}
        content={
          <LayoutContent isScrollable={false}>
            <div className="grid h-[58vh] grid-cols-5 gap-4">
              <section className="col-span-2 flex min-h-0 flex-col gap-1.5">
                <div className="flex min-h-[22rem] flex-1 flex-col rounded-lg border border-border">
                  <div className="flex items-center gap-2.5 border-b border-border px-3 py-2.5">
                    <Checkbox
                      id="kpi-project-select-all"
                      checked={selectAllState}
                      onCheckedChange={toggleAll}
                      disabled={visibleProjects.length === 0}
                    />
                    <label
                      htmlFor="kpi-project-select-all"
                      className="cursor-pointer text-base font-medium text-primary"
                    >
                      Select all
                    </label>
                    <span className="ml-auto text-xs text-secondary">
                      {visibleSelectedCount}/{visibleProjects.length}
                    </span>
                  </div>
                  <div className="border-b border-border p-2">
                    <Input
                      value={filter}
                      onChange={setFilter}
                      placeholder="Search projects…"
                      className="h-8"
                    />
                  </div>
                  <ScrollArea className="min-h-0 flex-1" ref={projectListRef}>
                    <div className="space-y-0.5 p-1.5">
                      {visibleProjects.length === 0 ? (
                        <p className="px-2 py-4 text-center text-xs text-secondary">
                          {sortedProjects.length === 0
                            ? 'No project you manage in this view'
                            : `No project matches “${filter.trim()}”`}
                        </p>
                      ) : (
                        visibleProjects.map((p) => {
                          const checkboxId = `kpi-project-${p.project_id}`;
                          return (
                            <div
                              key={p.project_id}
                              data-project-row={p.project_id}
                              className="flex items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors hover:bg-body"
                            >
                              <Checkbox
                                id={checkboxId}
                                checked={selected.has(p.project_id)}
                                onCheckedChange={() => toggleProject(p.project_id)}
                              />
                              <label
                                htmlFor={checkboxId}
                                className="min-w-0 flex-1 cursor-pointer truncate text-base text-primary"
                              >
                                {p.name}
                              </label>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </ScrollArea>
                </div>
              </section>

              <section className="col-span-3 flex min-h-0 flex-col gap-1.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex flex-col gap-0.5">
                    <div className="text-xs uppercase tracking-wide text-secondary">Metrics</div>
                    {selectedIds.length > 0 ? (
                      <p className="text-sm text-secondary">
                        {selectedIds.length} {selectedIds.length === 1 ? 'project' : 'projects'} ·
                        saves automatically
                      </p>
                    ) : null}
                  </div>
                  {selectedIds.length > 0 ? (
                    <Input
                      label="Search metrics"
                      isLabelHidden
                      value={metricFilter}
                      onChange={setMetricFilter}
                      placeholder="Search metrics…"
                      className="h-8"
                      width={224}
                    />
                  ) : null}
                </div>
                {selectedIds.length === 0 ? (
                  <div className="flex min-h-[22rem] flex-1 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border px-6 text-center">
                    <p className="text-base font-medium text-primary">No project selected</p>
                    <p className="text-sm text-secondary">
                      Pick at least one project on the left to see and edit its metrics.
                    </p>
                  </div>
                ) : normQuery.isLoading || appliedQuery.isLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-24 w-full" />
                    <Skeleton className="h-24 w-full" />
                  </div>
                ) : metricQuery && !hasMetricMatches ? (
                  <div className="flex min-h-[22rem] flex-1 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border px-6 text-center">
                    <p className="text-base font-medium text-primary">
                      No metric matches “{metricFilter.trim()}”
                    </p>
                    <p className="text-sm text-secondary">Search by metric name or its formula.</p>
                  </div>
                ) : (
                  <ScrollArea className="min-h-0 flex-1">
                    <div className="space-y-5">
                      {KPI_CATEGORIES.map((cat: KpiCategory) => {
                        const catMetrics = metrics.filter((m) => m.category === cat);
                        const visibleMetrics = catMetrics.filter(matchesMetricQuery);
                        if (visibleMetrics.length === 0) return null;
                        const appliedCount = catMetrics.filter(
                          (m) => (coverage.get(m.metric_id) ?? 0) === selectedIds.length,
                        ).length;
                        return (
                          <section key={cat} className="space-y-2">
                            <div className="sticky top-0 z-10 flex items-center justify-between bg-surface py-1">
                              <Heading level={3}>{KPI_CATEGORY_LABELS[cat]}</Heading>
                              <span className="text-xs tabular-nums text-secondary">
                                {metricQuery
                                  ? `${visibleMetrics.length} of ${catMetrics.length} shown`
                                  : appliedSummary
                                    ? `${appliedCount}/${catMetrics.length} applied · ${appliedSummary} overall`
                                    : `${appliedCount}/${catMetrics.length} applied`}
                              </span>
                            </div>
                            <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
                              {visibleMetrics.map((m) => {
                                const count = coverage.get(m.metric_id) ?? 0;
                                const checked: boolean | 'indeterminate' =
                                  count === 0
                                    ? false
                                    : count === selectedIds.length
                                      ? true
                                      : 'indeterminate';
                                const checkboxId = `kpi-metric-${m.metric_id}`;
                                const unit = metricUnit(
                                  m.name,
                                  m.component_count,
                                  m.component_1_label,
                                );
                                const bands = formatBandTriple(
                                  m.name,
                                  m.component_count,
                                  m.green_band,
                                  m.yellow_band,
                                  m.red_band,
                                );
                                return (
                                  <div
                                    key={m.metric_id}
                                    className="flex items-start gap-2.5 px-3 py-2 transition-colors hover:bg-body"
                                  >
                                    <Checkbox
                                      id={checkboxId}
                                      className="mt-1"
                                      checked={checked}
                                      disabled={coverageIsStale}
                                      onCheckedChange={(next) => {
                                        if (next === false) {
                                          const emptyCount = wouldEmpty.get(m.metric_id) ?? 0;
                                          if (emptyCount > 0) {
                                            setCategoryBlocked({
                                              metricName: m.name,
                                              category: m.category,
                                              projectCount: emptyCount,
                                            });
                                            return;
                                          }
                                          const enteredCount = entered.get(m.metric_id) ?? 0;
                                          if (enteredCount > 0) {
                                            setConfirmOff({
                                              metricId: m.metric_id,
                                              name: m.name,
                                              category: m.category,
                                              enteredCount,
                                            });
                                            return;
                                          }
                                          toggle.mutate({
                                            metricId: m.metric_id,
                                            applied: false,
                                          });
                                          return;
                                        }
                                        toggle.mutate({ metricId: m.metric_id, applied: true });
                                      }}
                                    />
                                    <label
                                      htmlFor={checkboxId}
                                      className="min-w-0 flex-1 cursor-pointer"
                                    >
                                      <div className="flex flex-wrap items-center gap-2 text-base font-medium text-primary">
                                        {m.name}
                                        <Badge variant="outline" className="font-normal">
                                          {unit}
                                        </Badge>
                                        <Badge
                                          variant={m.tier === 'core' ? 'default' : 'secondary'}
                                          className="font-normal"
                                        >
                                          {m.tier === 'core' ? 'Core' : 'Extended'}
                                        </Badge>
                                        {checked === 'indeterminate' ? (
                                          <Badge variant="outline" className="font-normal">
                                            {count}/{selectedIds.length} projects
                                          </Badge>
                                        ) : null}
                                      </div>
                                      <div className="text-sm text-secondary">
                                        {m.formula_label}
                                      </div>
                                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm tabular-nums">
                                        <span className="text-success" title="Green">
                                          {bands.green}
                                        </span>
                                        <span className="text-warning" title="Amber">
                                          {bands.yellow}
                                        </span>
                                        <span className="text-error" title="Red">
                                          {bands.red}
                                        </span>
                                      </div>
                                    </label>
                                  </div>
                                );
                              })}
                            </div>
                          </section>
                        );
                      })}
                    </div>
                  </ScrollArea>
                )}
              </section>
            </div>
          </LayoutContent>
        }
      />

      <AlertDialog
        isOpen={confirmOff !== null}
        onOpenChange={(o) => {
          if (!o) setConfirmOff(null);
        }}
        title={`Turn off ${confirmOff?.name ?? ''}?`}
        description={
          confirmOff
            ? `${
                selectedIds.length === 1
                  ? `Its ${weekLabel} figures`
                  : `${weekLabel} figures in ${confirmOff.enteredCount} of ${selectedIds.length} selected projects`
              } are deleted and stop counting towards the ${flagLabel(
                confirmOff.category,
              )} flag, so that colour can drop. Turning it back on starts from a blank cell. Closed weeks keep their figures.`
            : ''
        }
        cancelLabel="Keep it on"
        actionLabel="Turn off and delete"
        actionVariant="destructive"
        onAction={() => {
          if (confirmOff) toggle.mutate({ metricId: confirmOff.metricId, applied: false });
          setConfirmOff(null);
        }}
      />

      <Dialog
        isOpen={categoryBlocked !== null}
        onOpenChange={(o) => {
          if (!o) setCategoryBlocked(null);
        }}
        width={420}
        purpose="info"
      >
        <Layout
          header={
            <DialogHeader
              title="Can't turn this off"
              onOpenChange={(o) => {
                if (!o) setCategoryBlocked(null);
              }}
            />
          }
          content={
            <LayoutContent>
              <p className="text-sm text-secondary">
                <span className="font-medium text-primary">{categoryBlocked?.metricName}</span> is
                the last {categoryBlocked ? flagLabel(categoryBlocked.category) : ''} metric applied
                {categoryBlocked && categoryBlocked.projectCount > 1
                  ? ` to ${categoryBlocked.projectCount} of the selected projects`
                  : ' to this project'}
                . Every area (Quality, Cost & Capacity, Delivery, Process) needs at least one
                applied metric so its health can be measured — apply another one first if you want
                to turn this one off.
              </p>
            </LayoutContent>
          }
          footer={
            <DialogFooter>
              <Button variant="primary" onClick={() => setCategoryBlocked(null)}>
                Got it
              </Button>
            </DialogFooter>
          }
        />
      </Dialog>
    </Dialog>
  );
}
