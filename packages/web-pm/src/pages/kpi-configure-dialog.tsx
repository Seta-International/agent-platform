import {
  AlertDialog,
  Dialog,
  DialogFooter,
  DialogHeader,
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

export function KpiConfigureDialog({
  open,
  onOpenChange,
  projects,
  initialProjectId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Projects the caller may configure — already scoped (PMO/BOD: every tenant project;
   * EM/TL: only projects they own via `can_manage`, functional-analysis.md §2d). */
  projects: ProjectListRow[];
  initialProjectId?: string;
}) {
  const queryClient = useQueryClient();
  const sortedProjects = [...projects].sort((a, b) => a.name.localeCompare(b.name));
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(initialProjectId ? [initialProjectId] : []),
  );
  const [filter, setFilter] = useState('');
  // FUT-594 AC3: turning a metric OFF needs an explicit warning — its values stop counting
  // immediately and the week's colour can drop, re-demanding a Road-to-Green on submit.
  const [confirmOff, setConfirmOff] = useState<{ metricId: string; name: string } | null>(null);
  const [categoryBlocked, setCategoryBlocked] = useState<{
    metricName: string;
    category: KpiCategory;
    projectCount: number;
  } | null>(null);
  const selectedIds = [...selected];

  const normQuery = useQuery({ queryKey: pmKeys.kpiNorm(), queryFn: fetchKpiNorm });
  const appliedQuery = useQuery({
    queryKey: pmKeys.kpiAppliedMetrics(selectedIds),
    queryFn: () => fetchAppliedMetrics(selectedIds),
    enabled: selectedIds.length > 0,
  });

  const toggle = useMutation({
    mutationFn: ({ metricId, applied }: { metricId: string; applied: boolean }) =>
      setAppliedMetric(metricId, applied, selectedIds),
    onMutate: async ({ metricId, applied }) => {
      const key = pmKeys.kpiAppliedMetrics(selectedIds);
      await queryClient.cancelQueries({ queryKey: key });
      const prev = queryClient.getQueryData<AppliedMetricCoverage[]>(key);
      queryClient.setQueryData<AppliedMetricCoverage[]>(key, (old) => {
        const list = old ?? [];
        const nextCount = applied ? selectedIds.length : 0;
        const idx = list.findIndex((c) => c.metric_id === metricId);
        if (idx === -1) return [...list, { metric_id: metricId, applied_count: nextCount }];
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
  const metrics = normQuery.data?.metrics ?? [];

  const visibleProjects = filter.trim()
    ? sortedProjects.filter((p) => p.name.toLowerCase().includes(filter.trim().toLowerCase()))
    : sortedProjects;
  const allSelected = sortedProjects.length > 0 && selected.size === sortedProjects.length;
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(sortedProjects.map((p) => p.project_id)));
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
                      // Per product decision: ticked only when EVERY project is selected; a
                      // partial selection reads from the n/N counter, not the box.
                      checked={allSelected}
                      onCheckedChange={toggleAll}
                      disabled={sortedProjects.length === 0}
                    />
                    <label
                      htmlFor="kpi-project-select-all"
                      className="cursor-pointer text-base font-medium text-primary"
                    >
                      Select all
                    </label>
                    <span className="ml-auto text-xs text-secondary">
                      {selected.size}/{sortedProjects.length}
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
                          No project matches “{filter.trim()}”
                        </p>
                      ) : (
                        visibleProjects.map((p) => {
                          const checkboxId = `kpi-project-${p.project_id}`;
                          return (
                            <div
                              key={p.project_id}
                              data-project-row={p.project_id}
                              className="flex items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors hover:bg-surface"
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
                <div className="flex flex-col gap-0.5">
                  <div className="text-xs uppercase tracking-wide text-secondary">Metrics</div>
                  {selectedIds.length > 0 ? (
                    <p className="text-xs text-secondary">
                      Changes apply to {selectedIds.length} selected{' '}
                      {selectedIds.length === 1 ? 'project' : 'projects'} and save automatically.
                    </p>
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
                ) : (
                  <ScrollArea className="min-h-0 flex-1">
                    <div className="space-y-5 pr-3">
                      {KPI_CATEGORIES.map((cat: KpiCategory) => {
                        const catMetrics = metrics.filter((m) => m.category === cat);
                        const appliedCount = catMetrics.filter(
                          (m) => (coverage.get(m.metric_id) ?? 0) === selectedIds.length,
                        ).length;
                        return (
                          <section key={cat} className="space-y-2">
                            <div className="sticky top-0 z-10 flex items-center justify-between bg-card py-1">
                              <h3 className="text-lg font-semibold text-primary">
                                {KPI_CATEGORY_LABELS[cat]}
                              </h3>
                              <span className="text-xs text-secondary">
                                {appliedCount}/{catMetrics.length} applied
                              </span>
                            </div>
                            <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
                              {catMetrics.map((m) => {
                                const count = coverage.get(m.metric_id) ?? 0;
                                const checked: boolean | 'indeterminate' =
                                  count === 0
                                    ? false
                                    : count === selectedIds.length
                                      ? true
                                      : 'indeterminate';
                                const pendingThis =
                                  toggle.isPending && toggle.variables?.metricId === m.metric_id;
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
                                    className="flex items-start gap-2.5 px-3 py-2 transition-colors hover:bg-surface"
                                  >
                                    <Checkbox
                                      id={checkboxId}
                                      className="mt-1"
                                      checked={checked}
                                      disabled={pendingThis}
                                      onCheckedChange={(next) => {
                                        if (next === false) {
                                          setConfirmOff({ metricId: m.metric_id, name: m.name });
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
                                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs tabular-nums">
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
        footer={
          <DialogFooter>
            <Button variant="primary" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </DialogFooter>
        }
      />

      <AlertDialog
        isOpen={confirmOff !== null}
        onOpenChange={(o) => {
          if (!o) setConfirmOff(null);
        }}
        title={`Turn off ${confirmOff?.name ?? ''}?`}
        description="Its measured values stop counting for the selected projects immediately — this week's category colour can drop, and a non-Green week requires a Road-to-Green action to submit. The stored figures are kept and come back if you turn it on again."
        cancelLabel="Keep it on"
        actionLabel="Turn off"
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
                the last{' '}
                {categoryBlocked
                  ? KPI_CATEGORY_LABELS[categoryBlocked.category].replace(/^.*— /, '')
                  : ''}{' '}
                metric applied
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
