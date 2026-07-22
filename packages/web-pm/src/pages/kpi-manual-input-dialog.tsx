import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import {
  fetchKpiRecord,
  type KpiRecordMetricRow,
  upsertKpiRecord as upsertKpiRecordApi,
} from '../api/pm-client.ts';
import { pmKeys } from '../state/query-keys.ts';
import {
  Badge,
  Banner,
  Button,
  Dialog,
  DialogHeader,
  HStack,
  Input,
  Layout,
  LayoutContent,
  LayoutFooter,
  Selector,
  Skeleton,
  StatusDot,
  Text,
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

// RAG colour → Astryx status variant (chromatic colour is reserved for status, matching the
// weekly reports page); null (nothing measured yet) reads as neutral.
const RAG_DOT_VARIANT = {
  green: 'success',
  yellow: 'warning',
  red: 'error',
} as const;

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
  // is writable — closed weeks render read-only values behind the warning banner.
  const weekOpen = isReportingWeekOpen(isoYear, isoWeek, weeks[0]);

  return (
    <Dialog isOpen onOpenChange={onOpenChange} width={760} maxHeight="85vh">
      {/* Astryx three-band anatomy (header / scrolling content / footer) — same as the weekly
          report dialog: Cancel + Save never scroll away on long metric lists. */}
      <Layout
        header={
          <DialogHeader
            title="Manual KPI input"
            onOpenChange={(open) => !open && onOpenChange(false)}
            endContent={
              <div className="flex items-center gap-2">
                {ragBadge(isNewRecord ? null : live.overall)}
                {anyDirty ? (
                  <Badge variant="outline" className="font-normal text-secondary">
                    previewing — save to settle
                  </Badge>
                ) : null}
                {isNewRecord ? <span className="text-xs text-secondary">New record</span> : null}
              </div>
            }
          />
        }
        content={
          <LayoutContent>
            <div className="space-y-4">
              {/* QCDP live health — same pillar row as the weekly report cards: a status dot
                  per pillar, short name, off-norm pillar weights its name. Recomputes live. */}
              {projectId && metrics.length > 0 ? (
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  {KPI_CATEGORIES.map((cat) => {
                    const health = live.categoryHealth[cat];
                    const label =
                      health === 'green' ? 'Green' : health === 'yellow' ? 'Amber' : 'Red';
                    const name =
                      KPI_CATEGORY_LABELS[cat].split(' — ')[1] ?? KPI_CATEGORY_LABELS[cat];
                    const off = health !== 'green';
                    return (
                      <span
                        key={cat}
                        className="flex items-center gap-1.5"
                        title={`${KPI_CATEGORY_LABELS[cat]}: ${label}`}
                      >
                        <StatusDot
                          variant={RAG_DOT_VARIANT[health]}
                          label={`${KPI_CATEGORY_LABELS[cat]}: ${label}`}
                        />
                        <Text
                          type="supporting"
                          color={off ? 'primary' : 'secondary'}
                          weight={off ? 'semibold' : 'normal'}
                        >
                          {name}
                        </Text>
                      </span>
                    );
                  })}
                </div>
              ) : null}

              <div className="grid grid-cols-2 gap-3">
                <Selector
                  label="Project"
                  options={projects}
                  value={projectId}
                  onChange={setProjectId}
                  placeholder="Pick a project…"
                />
                <Selector
                  label="Reporting week"
                  options={weeks.map((w) => ({
                    value: `${w.iso_year}-${w.iso_week}`,
                    label: w.label,
                  }))}
                  value={`${isoYear}-${isoWeek}`}
                  onChange={(v) => {
                    const [y, w] = v.split('-');
                    setIsoYear(Number(y));
                    setIsoWeek(Number(w));
                  }}
                />
              </div>

              {/* Fallback only (caller presets a manageable project): entry stays blocked while
                  no project is selected, so the Save target is never ambiguous. */}
              {!projectId ? (
                <p className="rounded-lg bg-surface px-3 py-8 text-center text-sm text-secondary">
                  Pick a project above to enter KPIs — every record is pinned to a Project + Week.
                </p>
              ) : recordQuery.isLoading ? (
                <Skeleton className="h-64 w-full" />
              ) : (
                <div className="space-y-3">
                  {!weekOpen ? (
                    <Banner
                      status="warning"
                      title="This week is view-only — KPI records lock with the week at Friday 5:00 PM (VNT). Switch to the current week to enter data."
                    />
                  ) : null}
                  {/* One bordered card, same table anatomy as the KPI Norm tab: a labelled
                      column header band, then rows separated by hairlines. */}
                  <div className="rounded-md border border-border">
                    <div className="grid grid-cols-12 gap-3 border-b border-border px-3 py-1.5 text-xs font-medium uppercase tracking-wide text-secondary">
                      <div className="col-span-6">Metric</div>
                      <div className="col-span-4">Formula components</div>
                      <div className="col-span-2">Status</div>
                    </div>
                    <div className="px-3">
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
                            className="grid grid-cols-12 items-center gap-3 border-b border-border py-3 last:border-0"
                          >
                            <div className="col-span-6">
                              <div className="font-medium text-primary">{m.name}</div>
                              <div className="text-xs text-secondary">{m.formula_label}</div>
                              {/* The week's NORM, read-only alongside the variables (FUT-594
                                  AC1) — the frozen baseline bands, not the live catalog. */}
                              <div className="text-xs">
                                <span className="text-success">{bands.green}</span>
                                <span className="text-secondary"> · </span>
                                <span className="text-warning">{bands.yellow}</span>
                                <span className="text-secondary"> · </span>
                                <span className="text-error">{bands.red}</span>
                              </div>
                            </div>
                            {/* Compact, fixed-width number boxes — weekly KPI figures are a
                                few digits; a wide box just reads as empty space. */}
                            <div className="col-span-4 flex items-center gap-1.5">
                              <Input
                                type="number"
                                width={88}
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
                                    width={88}
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
                            <div className="col-span-2">
                              {ragBadge(live.statusByMetric.get(m.metric_id) ?? null)}
                              {/* FUT-595 AC4: an unsaved (provisional) colour stays marked, but
                                  as quiet text — the loud aggregate badge lives in the header. */}
                              {isDirty(m.metric_id) ? (
                                <div className="mt-0.5 text-xs text-secondary">previewing</div>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </LayoutContent>
        }
        footer={
          <LayoutFooter hasDivider>
            <HStack gap={2} hAlign="end">
              <Button variant="ghost" label="Cancel" onClick={() => onOpenChange(false)} />
              <Button
                variant="primary"
                label={save.isPending ? 'Saving…' : 'Save record'}
                onClick={() => save.mutate()}
                disabled={
                  !weekOpen ||
                  !projectId ||
                  save.isPending ||
                  recordQuery.isLoading ||
                  live.completeCount === 0
                }
              />
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  );
}
