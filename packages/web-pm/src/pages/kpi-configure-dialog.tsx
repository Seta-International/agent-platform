import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  fetchAppliedMetrics,
  fetchKpiNorm,
  type KpiCategory,
  type ProjectListRow,
  setAppliedMetric,
} from '../api/pm-client.ts';
import { pmKeys } from '../state/query-keys.ts';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './_legacy-dialog.tsx';
import { Badge, Button, Checkbox, Input, ScrollArea, Skeleton, toast } from './_ui-compat.tsx';
import { KPI_CATEGORIES, KPI_CATEGORY_LABELS } from './kpi-shared.tsx';

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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pmKeys.all });
    },
    onError: (err: Error) => toast.error(err.message || 'Could not update metric'),
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Three fixed bands — header / scrolling body / footer — so Done and the instant-save
          note never scroll away, and each column scrolls on its own (the project list stays
          visible while browsing metrics). */}
      <DialogContent className="max-w-4xl grid-rows-[auto_minmax(0,1fr)_auto] max-h-[85vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle>Configure KPI metrics</DialogTitle>
          <p className="text-sm text-secondary">
            Pick one, several, or all projects, then toggle metrics on or off for everything you
            picked — norm SETA-08-SOP-001, Core metrics always stay on.
          </p>
        </DialogHeader>

        <div className="grid min-h-0 grid-cols-5 gap-4">
          <section className="col-span-2 flex min-h-0 flex-col gap-1.5">
            <div className="text-xs uppercase tracking-wide text-secondary">Projects</div>
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
                  className="cursor-pointer font-medium text-primary"
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
              <ScrollArea className="min-h-0 flex-1">
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
                          className="flex items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors hover:bg-surface"
                        >
                          <Checkbox
                            id={checkboxId}
                            checked={selected.has(p.project_id)}
                            onCheckedChange={() => toggleProject(p.project_id)}
                          />
                          <label
                            htmlFor={checkboxId}
                            className="min-w-0 flex-1 cursor-pointer truncate text-sm text-primary"
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
            <div className="text-xs uppercase tracking-wide text-secondary">Metrics</div>
            {selectedIds.length === 0 ? (
              <div className="flex min-h-[22rem] flex-1 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border px-6 text-center">
                <p className="font-medium text-primary">No project selected</p>
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
                        <div className="flex items-center justify-between">
                          <h3 className="text-base font-semibold text-primary">
                            {KPI_CATEGORY_LABELS[cat]}
                          </h3>
                          <span className="text-xs text-secondary">
                            {appliedCount}/{catMetrics.length} applied
                          </span>
                        </div>
                        <div className="space-y-1.5">
                          {catMetrics.map((m) => {
                            const count = coverage.get(m.metric_id) ?? 0;
                            const checked: boolean | 'indeterminate' =
                              count === 0
                                ? false
                                : count === selectedIds.length
                                  ? true
                                  : 'indeterminate';
                            const locked = m.tier === 'core';
                            const checkboxId = `kpi-metric-${m.metric_id}`;
                            return (
                              <div
                                key={m.metric_id}
                                className="flex items-start gap-2.5 rounded-md border border-border px-3 py-2 transition-colors hover:bg-surface"
                              >
                                <Checkbox
                                  id={checkboxId}
                                  checked={checked}
                                  disabled={locked || toggle.isPending}
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
                                  <div className="flex items-center gap-2 font-medium text-primary">
                                    {m.name}
                                    <Badge
                                      variant={locked ? 'default' : 'secondary'}
                                      className="font-normal"
                                    >
                                      {locked ? 'Core' : 'Extended'}
                                    </Badge>
                                    {m.is_live_capable ? (
                                      <Badge variant="outline" className="font-normal">
                                        Live column
                                      </Badge>
                                    ) : null}
                                    {checked === 'indeterminate' ? (
                                      <Badge variant="outline" className="font-normal">
                                        {count}/{selectedIds.length} projects
                                      </Badge>
                                    ) : null}
                                  </div>
                                  <div className="text-xs text-secondary">{m.formula_label}</div>
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

        <DialogFooter className="gap-2 border-t border-border pt-4 sm:justify-between">
          <p className="self-center text-xs text-secondary">
            Toggles save instantly to every selected project — there is nothing else to submit.
          </p>
          <Button onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>

      <AlertDialog
        open={confirmOff !== null}
        onOpenChange={(o) => {
          if (!o) setConfirmOff(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Turn off {confirmOff?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Its measured values stop counting for the selected projects immediately — this week's
              category colour can drop, and a non-Green week requires a Road-to-Green action to
              submit. The stored figures are kept and come back if you turn it on again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it on</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmOff) toggle.mutate({ metricId: confirmOff.metricId, applied: false });
                setConfirmOff(null);
              }}
            >
              Turn off
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
