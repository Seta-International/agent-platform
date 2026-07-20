import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import {
  fetchKpiRecord,
  type KpiRecordMetricRow,
  upsertKpiRecord as upsertKpiRecordApi,
} from '../api/pm-client.ts';
import { pmKeys } from '../state/query-keys.ts';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './_legacy-dialog.tsx';
import {
  Badge,
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  toast,
} from './_ui-compat.tsx';
import {
  computeCategoryHealth,
  computeEntryStatus,
  computeMetricValue,
  computeOverallHealth,
  formatBandTriple,
  isReportingWeekOpen,
  KPI_CATEGORIES,
  KPI_CATEGORY_LABELS,
  ragBadge,
} from './kpi-shared.tsx';

type EntryState = Record<string, { c1: string; c2: string }>;

function toNumber(raw: string): number | null {
  if (raw.trim() === '') return null;
  const n = Number(raw);
  return Number.isNaN(n) ? null : n;
}

export function KpiManualInputDialog({
  initial,
  projects,
  weeks,
  onOpenChange,
}: {
  initial: { project_id: string; iso_year: number; iso_week: number };
  projects: { value: string; label: string }[];
  weeks: { iso_year: number; iso_week: number; label: string }[];
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [projectId, setProjectId] = useState(initial.project_id);
  const [isoYear, setIsoYear] = useState(initial.iso_year);
  const [isoWeek, setIsoWeek] = useState(initial.iso_week);
  const [entries, setEntries] = useState<EntryState>({});

  const recordQuery = useQuery({
    queryKey: pmKeys.kpiRecord({ project_id: projectId, iso_year: isoYear, iso_week: isoWeek }),
    queryFn: () => fetchKpiRecord({ project_id: projectId, iso_year: isoYear, iso_week: isoWeek }),
    enabled: Boolean(projectId),
  });

  // Prefill from the saved record whenever the query resolves for the current project/week —
  // fixes the mockup's own known bug where Edit always opened blank (functional-analysis.md §2b).
  useEffect(() => {
    if (!recordQuery.data) return;
    const next: EntryState = {};
    for (const m of recordQuery.data.metrics) {
      next[m.metric_id] = {
        c1: m.component_1_value === null ? '' : String(m.component_1_value),
        c2: m.component_2_value === null ? '' : String(m.component_2_value),
      };
    }
    setEntries(next);
  }, [recordQuery.data]);

  const metrics: KpiRecordMetricRow[] = recordQuery.data?.metrics ?? [];

  // FUT-595 AC4: a colour computed from values the user typed but has NOT saved yet is a
  // provisional preview — mark it, so it can't be mistaken for the settled (stored) colour.
  const savedEntries = useMemo(() => {
    const m = new Map<string, { c1: string; c2: string }>();
    for (const row of recordQuery.data?.metrics ?? []) {
      m.set(row.metric_id, {
        c1: row.component_1_value === null ? '' : String(row.component_1_value),
        c2: row.component_2_value === null ? '' : String(row.component_2_value),
      });
    }
    return m;
  }, [recordQuery.data]);
  const isDirty = (metric_id: string) => {
    const saved = savedEntries.get(metric_id) ?? { c1: '', c2: '' };
    const cur = entries[metric_id] ?? { c1: '', c2: '' };
    return saved.c1 !== cur.c1 || saved.c2 !== cur.c2;
  };
  const anyDirty = metrics.some((m) => isDirty(m.metric_id));

  const live = useMemo(() => {
    const statusByMetric = new Map<string, ReturnType<typeof computeEntryStatus>>();
    for (const m of metrics) {
      const e = entries[m.metric_id];
      const c1 = e ? toNumber(e.c1) : null;
      const c2 = e ? toNumber(e.c2) : null;
      const value = computeMetricValue(m.component_count, c1, c2);
      statusByMetric.set(
        m.metric_id,
        computeEntryStatus(value, m.green_band, m.yellow_band, m.red_band),
      );
    }
    const categoryHealth = Object.fromEntries(
      KPI_CATEGORIES.map((cat) => [
        cat,
        computeCategoryHealth(
          metrics
            .filter((m) => m.category === cat)
            .map((m) => statusByMetric.get(m.metric_id))
            .filter((s): s is NonNullable<typeof s> => s !== null && s !== undefined),
        ),
      ]),
    ) as Record<(typeof KPI_CATEGORIES)[number], ReturnType<typeof computeCategoryHealth>>;
    const overall = computeOverallHealth(KPI_CATEGORIES.map((c) => categoryHealth[c]));
    const completeCount = [...statusByMetric.values()].filter((s) => s !== null).length;
    return { statusByMetric, categoryHealth, overall, completeCount };
  }, [metrics, entries]);

  const save = useMutation({
    mutationFn: () =>
      upsertKpiRecordApi({
        project_id: projectId,
        iso_year: isoYear,
        iso_week: isoWeek,
        expected_version: recordQuery.data?.version ?? undefined,
        entries: metrics.map((m) => {
          const e = entries[m.metric_id];
          return {
            metric_id: m.metric_id,
            component_1_value: e ? toNumber(e.c1) : null,
            component_2_value: e ? toNumber(e.c2) : null,
          };
        }),
      }),
    onSuccess: () => {
      toast.success('KPI record saved');
      queryClient.invalidateQueries({ queryKey: pmKeys.all });
      onOpenChange(false);
    },
    onError: (err: Error & { status?: number }) => {
      // FUT-594 AC4: a stale save (another tab/reporter saved first) must not overwrite
      // blindly — refetch so the form reloads the latest values before the next attempt.
      if (err.status === 409) {
        queryClient.invalidateQueries({
          queryKey: pmKeys.kpiRecord({
            project_id: projectId,
            iso_year: isoYear,
            iso_week: isoWeek,
          }),
        });
        toast.error('Someone saved this record first — reloaded the latest values.');
        return;
      }
      toast.error(err.message || 'Could not save record');
    },
  });

  const isNewRecord = recordQuery.data?.record_id == null;
  // Epic 3 week gate, mirrored client-side: only the current week (before Friday 17:00 VNT)
  // is writable — view-only weeks render read-only values, matching the 🔒 in the picker.
  const weekOpen = isReportingWeekOpen(isoYear, isoWeek, weeks[0]);

  return (
    <Dialog open onOpenChange={onOpenChange}>
      {/* Three fixed bands (header / scrolling body / footer) — same anatomy as the weekly
          report dialog: Cancel + Save never scroll away on long metric lists. */}
      <DialogContent className="max-w-3xl grid-rows-[auto_minmax(0,1fr)_auto] max-h-[85vh] overflow-hidden">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <DialogTitle>Manual KPI input</DialogTitle>
            {ragBadge(isNewRecord ? null : live.overall)}
            {anyDirty ? (
              <Badge variant="outline" className="font-normal text-secondary">
                previewing — save to settle
              </Badge>
            ) : null}
            {isNewRecord ? <span className="text-xs text-secondary">New record</span> : null}
          </div>
          <p className="text-sm text-secondary">
            Pick a project &amp; week — edit the formula components; metrics, QCDP &amp; RAG
            recompute live.
          </p>
          {/* QCDP category health pinned in the fixed header band — stays visible while the
              long metric list scrolls, recomputing live as variables are typed. */}
          {projectId && metrics.length > 0 ? (
            <div className="flex flex-wrap gap-2 pt-1">
              {KPI_CATEGORIES.map((cat) => (
                <div
                  key={cat}
                  className="flex items-center gap-1.5 rounded-md border border-hairline px-2.5 py-1"
                >
                  {ragBadge(live.categoryHealth[cat])}
                  <span className="text-xs text-secondary">{KPI_CATEGORY_LABELS[cat]}</span>
                </div>
              ))}
            </div>
          ) : null}
        </DialogHeader>

        <div className="min-h-0 space-y-4 overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <div className="text-xs text-secondary">Project</div>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger>
                  <SelectValue placeholder="Pick a project…" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <div className="text-xs text-secondary">Reporting week</div>
              <Select
                value={`${isoYear}-${isoWeek}`}
                onValueChange={(v) => {
                  const [y, w] = v.split('-');
                  setIsoYear(Number(y));
                  setIsoWeek(Number(w));
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {weeks.map((w) => (
                    <SelectItem
                      key={`${w.iso_year}-${w.iso_week}`}
                      value={`${w.iso_year}-${w.iso_week}`}
                    >
                      {w.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Fallback only (caller presets a manageable project): entry stays blocked while
              no project is selected, so the Save target is never ambiguous. */}
          {!projectId ? (
            <p className="rounded-lg bg-surface-1 px-3 py-8 text-center text-sm text-secondary">
              Pick a project above to enter KPIs — every record is pinned to a Project + Week.
            </p>
          ) : recordQuery.isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <div className="space-y-3">
              {!weekOpen ? (
                <p className="rounded-md bg-surface-1 px-3 py-2 text-sm text-secondary">
                  🔒 This week is view-only — KPI records lock with the week at Friday 5:00 PM
                  (VNT). Switch to the current week to enter data.
                </p>
              ) : null}
              <div className="grid grid-cols-12 gap-2 text-xs font-medium uppercase tracking-wide text-secondary">
                <div className="col-span-5">Metric</div>
                <div className="col-span-5">Formula components</div>
                <div className="col-span-2">Status</div>
              </div>
              {metrics.map((m) => {
                const e = entries[m.metric_id] ?? { c1: '', c2: '' };
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
                    className="grid grid-cols-12 items-center gap-2 border-b border-hairline pb-2"
                  >
                    <div className="col-span-5">
                      <div className="font-medium text-primary">{m.name}</div>
                      <div className="text-xs text-secondary">{m.formula_label}</div>
                      {/* The week's NORM, read-only alongside the variables (FUT-594 AC1) —
                          these are the frozen baseline bands, not the live catalog. */}
                      <div className="text-xs">
                        <span className="text-success">{bands.green}</span>
                        <span className="text-secondary"> · </span>
                        <span className="text-warning">{bands.yellow}</span>
                        <span className="text-secondary"> · </span>
                        <span className="text-error">{bands.red}</span>
                      </div>
                    </div>
                    <div className="col-span-5 flex items-center gap-1.5">
                      <Input
                        type="number"
                        placeholder={m.component_1_label}
                        aria-label={m.component_1_label}
                        value={e.c1}
                        disabled={!weekOpen}
                        onChange={(ev: string) =>
                          setEntries((prev) => ({
                            ...prev,
                            [m.metric_id]: { c1: ev, c2: prev[m.metric_id]?.c2 ?? '' },
                          }))
                        }
                      />
                      {m.component_count === 2 ? (
                        <>
                          <span className="text-secondary">/</span>
                          <Input
                            type="number"
                            placeholder={m.component_2_label ?? ''}
                            aria-label={m.component_2_label ?? ''}
                            value={e.c2}
                            disabled={!weekOpen}
                            onChange={(ev: string) =>
                              setEntries((prev) => ({
                                ...prev,
                                [m.metric_id]: {
                                  c1: prev[m.metric_id]?.c1 ?? '',
                                  c2: ev,
                                },
                              }))
                            }
                          />
                        </>
                      ) : null}
                    </div>
                    <div className="col-span-2 flex flex-wrap items-center gap-1">
                      {ragBadge(live.statusByMetric.get(m.metric_id) ?? null)}
                      {isDirty(m.metric_id) ? (
                        <Badge variant="outline" className="font-normal text-secondary">
                          previewing
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 border-t border-hairline pt-4">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => save.mutate()}
            disabled={
              !weekOpen ||
              !projectId ||
              save.isPending ||
              recordQuery.isLoading ||
              live.completeCount === 0
            }
          >
            Save record
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
