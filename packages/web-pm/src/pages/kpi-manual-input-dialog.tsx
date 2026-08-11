import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
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
  EmptyState,
  Heading,
  HStack,
  Layout,
  LayoutContent,
  LayoutFooter,
  NumberInput,
  Selector,
  Skeleton,
  Text,
  useToast,
} from './_ui-compat.tsx';
import {
  computeCategoryHealth,
  computeEntryStatus,
  computeOverallHealth,
  computeScoredValue,
  formatBandTriple,
  hasKpiEntryIssue,
  isReportingWeekOpen,
  KPI_CATEGORIES,
  KPI_CATEGORY_LABELS,
  kpiValuePrecision,
  metricUnit,
  ragBadge,
  validateKpiEntry,
} from './kpi-shared.tsx';

function blockNonNumericPaste(e: React.ClipboardEvent<HTMLInputElement>) {
  if (!/^-?\d*[.,]?\d*$/.test(e.clipboardData.getData('text'))) e.preventDefault();
}

// Number-native, matching Astryx NumberInput: null = not measured yet (an empty box), a number
// = an entered figure. The stored record uses the same number|null shape, so no string parsing.
type Entry = { c1: number | null; c2: number | null };
type EntryState = Record<string, Entry>;
const EMPTY_ENTRY: Entry = { c1: null, c2: null };
const NO_ENTRIES: EntryState = {};

function withSlot(entry: Entry, slot: 'c1' | 'c2', value: number | null): Entry {
  return slot === 'c1' ? { c1: value, c2: entry.c2 } : { c1: entry.c1, c2: value };
}

const COMPONENT_BOX_WIDTH = 96;

const HIDE_STATUS_ICON = '[&>.astryx-icon]:hidden!';

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
  const toast = useToast();
  const [projectId, setProjectId] = useState(initial.project_id);
  const [isoYear, setIsoYear] = useState(initial.iso_year);
  const [isoWeek, setIsoWeek] = useState(initial.iso_week);
  const [entriesByRecord, setEntriesByRecord] = useState<Record<string, EntryState>>({});
  const [saveAttempted, setSaveAttempted] = useState(false);
  const reloadKeys = useRef(new Set<string>());
  const formRef = useRef<HTMLDivElement>(null);

  const recordKey = `${projectId}:${isoYear}:${isoWeek}`;
  const entries = entriesByRecord[recordKey] ?? NO_ENTRIES;

  const recordQuery = useQuery({
    queryKey: pmKeys.kpiRecord({ project_id: projectId, iso_year: isoYear, iso_week: isoWeek }),
    queryFn: () => fetchKpiRecord({ project_id: projectId, iso_year: isoYear, iso_week: isoWeek }),
    enabled: Boolean(projectId),
  });

  // Prefill from the saved record whenever the query resolves for the current project/week —
  // fixes the mockup's own known bug where Edit always opened blank (functional-analysis.md §2b).
  useEffect(() => {
    const data = recordQuery.data;
    if (!data) return;
    const forced = reloadKeys.current.delete(recordKey);
    setEntriesByRecord((prev) => {
      if (prev[recordKey] && !forced) return prev;
      const next: EntryState = {};
      for (const m of data.metrics) {
        next[m.metric_id] = { c1: m.component_1_value, c2: m.component_2_value };
      }
      return { ...prev, [recordKey]: next };
    });
  }, [recordQuery.data, recordKey]);

  useEffect(() => {
    const root = formRef.current;
    if (!root) return;
    const guard = (e: WheelEvent) => {
      const el = e.target;
      if (el instanceof HTMLInputElement && el.type === 'number' && el === document.activeElement) {
        el.blur();
      }
    };
    root.addEventListener('wheel', guard, true);
    return () => root.removeEventListener('wheel', guard, true);
  }, []);

  const metrics: KpiRecordMetricRow[] = recordQuery.data?.metrics ?? [];

  const orderedMetrics = useMemo(
    () => KPI_CATEGORIES.flatMap((cat) => metrics.filter((m) => m.category === cat)),
    [metrics],
  );

  const fieldRefs = useRef(new Map<string, HTMLInputElement>());
  const registerField = (key: string) => (el: HTMLInputElement | null) => {
    if (el) fieldRefs.current.set(key, el);
    else fieldRefs.current.delete(key);
  };

  const editEntries = (fn: (cur: EntryState) => EntryState) => {
    setEntriesByRecord((prev) => {
      const cur = prev[recordKey] ?? NO_ENTRIES;
      const next = fn(cur);
      return next === cur ? prev : { ...prev, [recordKey]: next };
    });
  };

  const setComponent = (metric_id: string, slot: 'c1' | 'c2', next: number | null) => {
    editEntries((cur) => ({
      ...cur,
      [metric_id]: withSlot(cur[metric_id] ?? EMPTY_ENTRY, slot, next),
    }));
  };

  // FUT-595 AC4: a colour computed from values the user typed but has NOT saved yet is a
  // provisional preview — mark it, so it can't be mistaken for the settled (stored) colour.
  const savedEntries = useMemo(() => {
    const m = new Map<string, { c1: number | null; c2: number | null }>();
    for (const row of recordQuery.data?.metrics ?? []) {
      m.set(row.metric_id, { c1: row.component_1_value, c2: row.component_2_value });
    }
    return m;
  }, [recordQuery.data]);
  const isDirty = (metric_id: string) => {
    const saved = savedEntries.get(metric_id) ?? EMPTY_ENTRY;
    const cur = entries[metric_id] ?? EMPTY_ENTRY;
    return saved.c1 !== cur.c1 || saved.c2 !== cur.c2;
  };
  const anyDirty = metrics.some((m) => isDirty(m.metric_id));

  const live = useMemo(() => {
    const issuesByMetric = new Map<string, ReturnType<typeof validateKpiEntry>>();
    const statusByMetric = new Map<string, ReturnType<typeof computeEntryStatus>>();
    for (const m of metrics) {
      const e = entries[m.metric_id] ?? EMPTY_ENTRY;
      const issues = validateKpiEntry(m, e.c1, e.c2);
      issuesByMetric.set(m.metric_id, issues);
      const value = hasKpiEntryIssue(issues)
        ? null
        : computeScoredValue(
            m.component_count,
            e.c1,
            e.c2,
            kpiValuePrecision(m.green_band, m.yellow_band, m.red_band),
          );
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
    const hasIssue = [...issuesByMetric.values()].some(hasKpiEntryIssue);
    return { issuesByMetric, statusByMetric, categoryHealth, overall, completeCount, hasIssue };
  }, [metrics, entries]);

  const saveBlock = useMemo(() => {
    const fields: string[] = [];
    for (const m of orderedMetrics) {
      const issues = live.issuesByMetric.get(m.metric_id);
      if (issues?.component_1) fields.push(`${m.metric_id}:c1`);
      if (issues?.component_2) fields.push(`${m.metric_id}:c2`);
    }
    if (fields.length > 0) {
      const noun = fields.length === 1 ? 'figure needs' : 'figures need';
      return { field: fields[0] ?? null, message: `${fields.length} ${noun} fixing` };
    }
    if (live.completeCount === 0) {
      const first = orderedMetrics[0];
      return {
        field: first ? `${first.metric_id}:c1` : null,
        message: 'Enter at least one figure to save',
      };
    }
    return null;
  }, [orderedMetrics, live]);

  const save = useMutation({
    mutationFn: () =>
      upsertKpiRecordApi({
        project_id: projectId,
        iso_year: isoYear,
        iso_week: isoWeek,
        expected_version: recordQuery.data ? recordQuery.data.version : undefined,
        entries: metrics.map((m) => {
          const e = entries[m.metric_id] ?? EMPTY_ENTRY;
          return {
            metric_id: m.metric_id,
            component_1_value: e.c1,
            component_2_value: e.c2,
          };
        }),
      }),
    onSuccess: () => {
      toast({ body: 'KPI record saved' });
      queryClient.invalidateQueries({ queryKey: pmKeys.all });
      onOpenChange(false);
    },
    onError: (err: Error & { status?: number }) => {
      // FUT-594 AC4: a stale save (another tab/reporter saved first) must not overwrite
      // blindly — refetch so the form reloads the latest values before the next attempt.
      if (err.status === 409) {
        reloadKeys.current.add(recordKey);
        queryClient.invalidateQueries({
          queryKey: pmKeys.kpiRecord({
            project_id: projectId,
            iso_year: isoYear,
            iso_week: isoWeek,
          }),
        });
        toast({
          body: 'Someone saved this record first — reloaded the latest values.',
          type: 'error',
        });
        return;
      }
      toast({ body: err.message || 'Could not save record', type: 'error' });
    },
  });

  const onSaveClick = () => {
    if (!saveBlock) {
      save.mutate();
      return;
    }
    setSaveAttempted(true);
    const el = saveBlock.field ? fieldRefs.current.get(saveBlock.field) : undefined;
    if (!el) return;
    el.focus({ preventScroll: true });
    const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ block: 'center', behavior: calm ? 'auto' : 'smooth' });
  };

  const isNewRecord = recordQuery.data?.record_id == null;
  // Epic 3 week gate, mirrored client-side: only the current week (before Friday 17:00 VNT)
  // is writable — closed weeks render read-only values behind the warning banner.
  const weekOpen = isReportingWeekOpen(isoYear, isoWeek, weeks[0]);

  return (
    <Dialog isOpen onOpenChange={onOpenChange} width={760} maxHeight="85vh" purpose="form">
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
                    Previewing
                  </Badge>
                ) : null}
                {isNewRecord ? (
                  <Text type="supporting" color="secondary">
                    New record
                  </Text>
                ) : null}
              </div>
            }
          />
        }
        content={
          <LayoutContent>
            <div ref={formRef} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
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
                <Selector
                  label="Project"
                  options={projects}
                  value={projectId}
                  onChange={setProjectId}
                />
              </div>

              {!projectId ? (
                <EmptyState
                  isCompact
                  title="No project selected"
                  description="Pick a project above to enter KPIs — every record is pinned to a Project + Week."
                />
              ) : recordQuery.isLoading ? (
                <Skeleton className="h-64 w-full" />
              ) : (
                <div className="space-y-3">
                  {!weekOpen ? (
                    <Banner
                      status="warning"
                      title="This week is view-only — KPI records lock with the week at Friday 5:00 PM (VNT)."
                    />
                  ) : null}
                  <div className="rounded-lg border border-border">
                    <div className="grid grid-cols-12 gap-3 border-b border-border px-3 py-1.5 text-xs font-medium uppercase tracking-wide text-secondary">
                      <div className="col-span-6">Metric</div>
                      <div className="col-span-4">Formula components</div>
                      <div className="col-span-2">Status</div>
                    </div>
                    <div className="px-3">
                      {KPI_CATEGORIES.map((cat) => {
                        const catMetrics = metrics.filter((m) => m.category === cat);
                        if (catMetrics.length === 0) return null;
                        return (
                          <div key={cat}>
                            <div className="sticky top-0 z-10 bg-surface py-1.5">
                              <Heading level={3}>{KPI_CATEGORY_LABELS[cat]}</Heading>
                            </div>
                            {catMetrics.map((m) => {
                              const e = entries[m.metric_id] ?? EMPTY_ENTRY;
                              const issues = live.issuesByMetric.get(m.metric_id);
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
                                    <div className="flex items-center gap-2 text-base font-medium text-primary">
                                      {m.name}
                                      <Badge variant="outline" className="font-normal">
                                        {metricUnit(m.name, m.component_count, m.component_1_label)}
                                      </Badge>
                                    </div>
                                    <div className="text-sm text-secondary">{m.formula_label}</div>
                                    <div className="text-xs tabular-nums">
                                      <span className="text-success">{bands.green}</span>
                                      <span className="text-secondary"> · </span>
                                      <span className="text-warning">{bands.yellow}</span>
                                      <span className="text-secondary"> · </span>
                                      <span className="text-error">{bands.red}</span>
                                    </div>
                                  </div>
                                  <div className="col-span-4 flex items-start gap-1.5">
                                    <NumberInput
                                      ref={registerField(`${m.metric_id}:c1`)}
                                      label={m.component_1_label}
                                      isLabelHidden
                                      width={COMPONENT_BOX_WIDTH}
                                      value={e.c1}
                                      hasClear
                                      isDisabled={!weekOpen}
                                      className={HIDE_STATUS_ICON}
                                      status={
                                        issues?.component_1
                                          ? { type: 'error', message: issues.component_1 }
                                          : undefined
                                      }
                                      onPaste={blockNonNumericPaste}
                                      onChange={(next) => setComponent(m.metric_id, 'c1', next)}
                                    />
                                    {m.component_count === 2 ? (
                                      <>
                                        <span
                                          className="flex items-center text-sm text-secondary"
                                          style={{ height: 'var(--size-element-md)' }}
                                        >
                                          /
                                        </span>
                                        <NumberInput
                                          ref={registerField(`${m.metric_id}:c2`)}
                                          label={m.component_2_label ?? ''}
                                          isLabelHidden
                                          width={COMPONENT_BOX_WIDTH}
                                          value={e.c2}
                                          hasClear
                                          isDisabled={!weekOpen}
                                          className={HIDE_STATUS_ICON}
                                          status={
                                            issues?.component_2
                                              ? { type: 'error', message: issues.component_2 }
                                              : undefined
                                          }
                                          onPaste={blockNonNumericPaste}
                                          onChange={(next) => setComponent(m.metric_id, 'c2', next)}
                                        />
                                      </>
                                    ) : null}
                                  </div>
                                  <div className="col-span-2">
                                    {ragBadge(live.statusByMetric.get(m.metric_id) ?? null)}
                                  </div>
                                </div>
                              );
                            })}
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
            <HStack gap={2} hAlign="end" vAlign="center">
              {saveAttempted && saveBlock ? (
                <span className="text-sm text-error">{saveBlock.message}</span>
              ) : null}
              <Button variant="ghost" label="Cancel" onClick={() => onOpenChange(false)} />
              <Button
                variant="primary"
                label={save.isPending ? 'Saving…' : 'Save record'}
                onClick={onSaveClick}
                disabled={!weekOpen || !projectId || save.isPending || recordQuery.isLoading}
              />
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  );
}
