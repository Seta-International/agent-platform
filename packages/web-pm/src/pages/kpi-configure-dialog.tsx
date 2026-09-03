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
  fetchAppliedMetrics,
  fetchKpiNorm,
  type KpiCategory,
  type ProjectListRow,
  setAppliedMetrics,
} from '../api/pm-client.ts';
import { pmKeys } from '../state/query-keys.ts';
import { Badge, Button, Checkbox, Input, ScrollArea, Skeleton, useToast } from './_ui-compat.tsx';
import {
  formatBandTriple,
  KPI_CATEGORIES,
  KPI_CATEGORY_LABELS,
  metricUnit,
} from './kpi-shared.tsx';

const flagLabel = (category: KpiCategory): string =>
  KPI_CATEGORY_LABELS[category].replace(/^.*— /, '');

const joinNames = (names: string[]): string =>
  names.length < 2 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;

const blockedScope = (projectCount: number | null): string =>
  projectCount === null
    ? ' to the selected projects'
    : projectCount > 1
      ? ` to ${projectCount} of the selected projects`
      : ' to this project';

export function KpiConfigureDialog({
  open,
  onOpenChange,
  projects,
  accountNames,
  initialProjectId,
  currentWeek,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Projects the caller may configure — already scoped (PMO/BOD: every tenant project;
   * EM/TL: only projects they own via `can_manage`, functional-analysis.md §2d). */
  projects: ProjectListRow[];
  /** Account id → name, used to head each group once the list spans more than one account. */
  accountNames?: ReadonlyMap<string, string>;
  initialProjectId?: string;
  currentWeek?: { iso_year: number; iso_week: number };
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const accountNameOf = (accountId: string) => accountNames?.get(accountId) ?? 'Unknown account';
  const sortedProjects = [...projects].sort(
    (a, b) =>
      accountNameOf(a.account_id).localeCompare(accountNameOf(b.account_id)) ||
      a.name.localeCompare(b.name),
  );
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
  /** Ticks made since the last save — metric id → applied to every selected project. Nothing
   * reaches the server until Done, so Cancel can drop the lot (FUT-963). */
  const [draft, setDraft] = useState<Map<string, boolean>>(new Map());
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [confirmOff, setConfirmOff] = useState<{
    metrics: { metricId: string; name: string; category: KpiCategory; enteredCount: number }[];
    intent: 'stage' | 'save';
  } | null>(null);
  const [confirmedOff, setConfirmedOff] = useState<Map<string, ReadonlySet<string>>>(new Map());
  const [categoryBlocked, setCategoryBlocked] = useState<{
    metricNames: string[];
    category: KpiCategory;
    projectCount: number | null;
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

  const metrics = normQuery.data?.metrics ?? [];
  const saved = new Map((appliedQuery.data ?? []).map((c) => [c.metric_id, c.applied_count]));
  const entered = new Map((appliedQuery.data ?? []).map((c) => [c.metric_id, c.entered_count]));
  const wouldEmpty = new Map(
    (appliedQuery.data ?? []).map((c) => [c.metric_id, c.would_empty_count]),
  );
  /** What Done would leave behind: the draft wins over the saved coverage, and a staged tick
   * always means "all of the selected projects" or "none of them". */
  const appliedCount = (metricId: string): number => {
    const staged = draft.get(metricId);
    if (staged === undefined) return saved.get(metricId) ?? 0;
    return staged ? selectedIds.length : 0;
  };

  const save = useMutation({
    mutationFn: (changes: { metric_id: string; applied: boolean }[]) =>
      setAppliedMetrics(changes, selectedIds),
    onError: (err: Error & { details?: Record<string, unknown> }) => {
      const emptyProjectIds = err.details?.empty_project_ids;
      const blockedIds = err.details?.metric_ids;
      if (Array.isArray(emptyProjectIds) && emptyProjectIds.length > 0) {
        const names = (Array.isArray(blockedIds) ? blockedIds : [])
          .map((id) => metrics.find((m) => m.metric_id === id)?.name)
          .filter((name): name is string => name !== undefined);
        setCategoryBlocked({
          metricNames: names,
          category: (err.details?.category as KpiCategory | undefined) ?? 'quality',
          projectCount: emptyProjectIds.length,
        });
        return;
      }
      toast({ body: err.message || 'Could not save the metric changes', type: 'error' });
    },
    onSuccess: () => {
      const projectLabel =
        selectedIds.length === 1
          ? (projects.find((p) => p.project_id === selectedIds[0])?.name ?? '1 project')
          : `${selectedIds.length} projects`;
      setDraft(new Map());
      setConfirmedOff(new Map());
      queryClient.removeQueries({ queryKey: pmKeys.kpiRecords() });
      queryClient.invalidateQueries({ queryKey: pmKeys.all });
      toast({ body: `Metrics updated for ${projectLabel}` });
      onOpenChange(false);
    },
  });

  const dirty = draft.size > 0;
  const listLocked = appliedQuery.isFetching || save.isPending;

  const areaEmptiedByDraft = (metric: (typeof metrics)[number]) => {
    const others = metrics.filter(
      (other) => other.category === metric.category && other.metric_id !== metric.metric_id,
    );
    return (
      others.some((other) => draft.get(other.metric_id) === false) &&
      others.every((other) => appliedCount(other.metric_id) === 0)
    );
  };
  const namesEmptying = (metric: (typeof metrics)[number]) =>
    metrics
      .filter(
        (other) =>
          other.category === metric.category &&
          (other.metric_id === metric.metric_id || draft.get(other.metric_id) === false) &&
          (saved.get(other.metric_id) ?? 0) > 0,
      )
      .map((other) => other.name);

  const stage = (metricId: string, applied: boolean) =>
    setDraft((prev) => {
      const next = new Map(prev);
      const savedCount = saved.get(metricId) ?? 0;
      const savedState =
        savedCount === selectedIds.length ? true : savedCount === 0 ? false : 'mixed';
      if (savedState === applied) next.delete(metricId);
      else next.set(metricId, applied);
      return next;
    });

  const requestClose = () => {
    if (save.isPending) return;
    if (dirty) {
      setConfirmDiscard(true);
      return;
    }
    onOpenChange(false);
  };
  const handleOpenChange = (next: boolean) => {
    if (next) onOpenChange(true);
    else requestClose();
  };
  const submit = () =>
    save.mutate([...draft].map(([metric_id, applied]) => ({ metric_id, applied })));
  const deletionWarning = (
    list: { name: string; category: KpiCategory; enteredCount: number }[],
  ): string => {
    const flags = [...new Set(list.map((m) => flagLabel(m.category)))];
    const flagClause = `stop counting towards the ${joinNames(flags)} ${
      flags.length > 1 ? 'flags' : 'flag'
    }, so ${flags.length > 1 ? 'those colours' : 'that colour'} can drop`;
    const only = list.length === 1 ? list[0] : undefined;
    if (only)
      return `${
        selectedIds.length === 1
          ? `Its ${weekLabel} figures`
          : `${weekLabel} figures in ${only.enteredCount} of ${selectedIds.length} selected projects`
      } are deleted when you save, and ${flagClause}. Turning it back on starts from a blank cell. Closed weeks keep their figures.`;
    return `${joinNames(list.map((m) => m.name))} still hold ${weekLabel} figures${
      selectedIds.length === 1 ? '' : ' in some of the selected projects'
    }. They are deleted when you save, and ${flagClause}. Turning them back on starts from a blank cell. Closed weeks keep their figures.`;
  };
  const unwarnedDeletions = () =>
    [...draft]
      .filter(([metricId, applied]) => {
        if (applied || (entered.get(metricId) ?? 0) === 0) return false;
        const covered = confirmedOff.get(metricId);
        return covered === undefined || !selectedIds.every((id) => covered.has(id));
      })
      .flatMap(([metricId]) => {
        const metric = metrics.find((m) => m.metric_id === metricId);
        return metric
          ? [
              {
                metricId,
                name: metric.name,
                category: metric.category,
                enteredCount: entered.get(metricId) ?? 0,
              },
            ]
          : [];
      });
  const done = () => {
    if (!dirty) {
      onOpenChange(false);
      return;
    }
    const unwarned = unwarnedDeletions();
    if (unwarned.length > 0) {
      setConfirmOff({ metrics: unwarned, intent: 'save' });
      return;
    }
    submit();
  };

  const metricQuery = metricFilter.trim().toLowerCase();
  const matchesMetricQuery = (m: (typeof metrics)[number]) =>
    !metricQuery ||
    m.name.toLowerCase().includes(metricQuery) ||
    m.formula_label.toLowerCase().includes(metricQuery);
  const hasMetricMatches = metrics.some(matchesMetricQuery);
  const appliedSummary =
    appliedQuery.data && metrics.length > 0
      ? `${metrics.filter((m) => appliedCount(m.metric_id) === selectedIds.length).length}/${metrics.length}`
      : null;
  const appliedLabel = selectedIds.length > 1 ? 'applied to all' : 'applied';

  const visibleProjects = filter.trim()
    ? sortedProjects.filter((p) => p.name.toLowerCase().includes(filter.trim().toLowerCase()))
    : sortedProjects;
  const projectGroups = [
    ...visibleProjects
      .reduce((groups, p) => {
        groups.set(p.account_id, [...(groups.get(p.account_id) ?? []), p]);
        return groups;
      }, new Map<string, ProjectListRow[]>())
      .entries(),
  ];
  const showAccountHeadings = projectGroups.length > 1;
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
    <Dialog
      isOpen={open}
      onOpenChange={handleOpenChange}
      width={880}
      maxHeight="85vh"
      purpose="info"
    >
      <Layout
        header={<DialogHeader title="Configure KPI metrics" onOpenChange={handleOpenChange} />}
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
                        projectGroups.map(([accountId, groupProjects]) => (
                          <div key={accountId} className="space-y-0.5">
                            {showAccountHeadings ? (
                              <div className="truncate px-2 pt-2 pb-1 text-xs uppercase tracking-wide text-secondary">
                                {accountNameOf(accountId)}
                              </div>
                            ) : null}
                            {groupProjects.map((p) => {
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
                            })}
                          </div>
                        ))
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
                        {selectedIds.length} {selectedIds.length === 1 ? 'project' : 'projects'}
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
                        const catApplied = catMetrics.filter(
                          (m) => appliedCount(m.metric_id) === selectedIds.length,
                        ).length;
                        return (
                          <section key={cat} className="space-y-2">
                            <div className="sticky top-0 z-10 flex items-center justify-between bg-surface py-1">
                              <Heading level={3}>{KPI_CATEGORY_LABELS[cat]}</Heading>
                              <span className="text-xs tabular-nums text-secondary">
                                {metricQuery
                                  ? `${visibleMetrics.length} of ${catMetrics.length} shown`
                                  : appliedSummary
                                    ? `${catApplied}/${catMetrics.length} ${appliedLabel} · ${appliedSummary} overall`
                                    : `${catApplied}/${catMetrics.length} ${appliedLabel}`}
                              </span>
                            </div>
                            <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
                              {visibleMetrics.map((m) => {
                                const count = appliedCount(m.metric_id);
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
                                      disabled={listLocked}
                                      onCheckedChange={(next) => {
                                        if (next === false) {
                                          if (areaEmptiedByDraft(m)) {
                                            setCategoryBlocked({
                                              metricNames: namesEmptying(m),
                                              category: m.category,
                                              projectCount: selectedIds.length === 1 ? 1 : null,
                                            });
                                            return;
                                          }
                                          // A metric staged on in the same area keeps that area
                                          // populated, so the server's count no longer blocks.
                                          const rescued = metrics.some(
                                            (other) =>
                                              other.category === m.category &&
                                              other.metric_id !== m.metric_id &&
                                              draft.get(other.metric_id) === true,
                                          );
                                          const emptyCount = wouldEmpty.get(m.metric_id) ?? 0;
                                          if (emptyCount > 0 && !rescued) {
                                            setCategoryBlocked({
                                              metricNames: [m.name],
                                              category: m.category,
                                              projectCount: emptyCount,
                                            });
                                            return;
                                          }
                                          const enteredCount = entered.get(m.metric_id) ?? 0;
                                          if (enteredCount > 0) {
                                            setConfirmOff({
                                              metrics: [
                                                {
                                                  metricId: m.metric_id,
                                                  name: m.name,
                                                  category: m.category,
                                                  enteredCount,
                                                },
                                              ],
                                              intent: 'stage',
                                            });
                                            return;
                                          }
                                          stage(m.metric_id, false);
                                          return;
                                        }
                                        stage(m.metric_id, true);
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
                                        {draft.has(m.metric_id) ? (
                                          <Badge variant="outline" className="font-normal">
                                            Not saved
                                          </Badge>
                                        ) : null}
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
        footer={
          <DialogFooter>
            <Button variant="secondary" onClick={requestClose} disabled={save.isPending}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={done}
              disabled={listLocked || (dirty && selectedIds.length === 0)}
            >
              {save.isPending ? 'Saving…' : 'Done'}
            </Button>
          </DialogFooter>
        }
      />

      <AlertDialog
        isOpen={confirmDiscard}
        onOpenChange={(o) => {
          if (!o) setConfirmDiscard(false);
        }}
        title="Discard changes?"
        description={`${draft.size} metric ${
          draft.size === 1 ? 'change is' : 'changes are'
        } not saved yet. Discarding closes Configure KPI metrics and leaves every selected project exactly as it is.`}
        cancelLabel="Keep editing"
        actionLabel="Discard changes"
        actionVariant="destructive"
        onAction={() => {
          setDraft(new Map());
          setConfirmDiscard(false);
          onOpenChange(false);
        }}
      />

      <AlertDialog
        isOpen={confirmOff !== null}
        onOpenChange={(o) => {
          if (!o) setConfirmOff(null);
        }}
        title={
          confirmOff === null
            ? ''
            : confirmOff.metrics.length === 1
              ? `Turn off ${confirmOff.metrics[0]?.name}?`
              : `Turn off ${confirmOff.metrics.length} metrics?`
        }
        description={confirmOff ? deletionWarning(confirmOff.metrics) : ''}
        cancelLabel={confirmOff?.intent === 'save' ? 'Keep editing' : 'Keep it on'}
        actionLabel={
          confirmOff?.intent === 'save'
            ? confirmOff.metrics.length === 1
              ? 'Turn it off and save'
              : 'Turn them off and save'
            : 'Turn it off'
        }
        actionVariant="destructive"
        onAction={() => {
          if (!confirmOff) return;
          const covered: ReadonlySet<string> = new Set(selectedIds);
          setConfirmedOff((prev) => {
            const next = new Map(prev);
            for (const m of confirmOff.metrics) next.set(m.metricId, covered);
            return next;
          });
          if (confirmOff.intent === 'save') submit();
          else for (const m of confirmOff.metrics) stage(m.metricId, false);
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
                <span className="font-medium text-primary">
                  {joinNames(categoryBlocked?.metricNames ?? [])}
                </span>{' '}
                {categoryBlocked && categoryBlocked.metricNames.length > 1 ? 'are' : 'is'} the last{' '}
                {categoryBlocked ? flagLabel(categoryBlocked.category) : ''} metric
                {categoryBlocked && categoryBlocked.metricNames.length > 1 ? 's' : ''} applied
                {categoryBlocked ? blockedScope(categoryBlocked.projectCount) : ''}. Every area
                (Quality, Cost & Capacity, Delivery, Process) needs at least one applied metric so
                its health can be measured — apply another one first if you want to turn this one
                off.
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
