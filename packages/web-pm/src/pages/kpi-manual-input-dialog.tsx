import { Button } from '@seta/shared-ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchKpiRecord,
  type KpiRecordMetricRow,
  upsertKpiRecord as upsertKpiRecordApi,
} from '../api/pm-client.ts';
import { pmKeys } from '../state/query-keys.ts';
import {
  AlertDialog,
  Badge,
  Banner,
  Dialog,
  DialogHeader,
  EmptyState,
  Heading,
  HStack,
  Input,
  Layout,
  LayoutContent,
  LayoutFooter,
  Selector,
  Skeleton,
  Text,
  useToast,
} from './_ui-compat.tsx';
import {
  computeEntryStatus,
  computeRecordCategoryColour,
  computeRecordOverallColour,
  computeScoredValue,
  formatBandTriple,
  hasKpiEntryIssue,
  isReportingWeekOpen,
  KPI_CATEGORIES,
  KPI_CATEGORY_LABELS,
  kpiColourBadge,
  kpiResultValue,
  kpiValuePrecision,
  metricUnit,
  ragBadge,
  validateKpiEntry,
} from './kpi-shared.tsx';

function localeDecimal(locale: string): string {
  const parts = new Intl.NumberFormat(locale).formatToParts(11111.1);
  return parts.find((p) => p.type === 'decimal')?.value ?? '.';
}

function ungroup(digits: string, mark: string): string | null {
  const parts = digits.split(mark);
  if (parts.slice(1).some((p) => p.length !== 3)) return null;
  return parts.join('');
}

function countOf(body: string, mark: string): number {
  return body.split(mark).length - 1;
}

export function parseNumericPaste(text: string, locale: string): number | null {
  const trimmed = text.trim();
  const sign = trimmed.startsWith('-') ? '-' : '';
  const unsigned = trimmed.replace(/^[+-]/, '');
  if (unsigned === '') return null;

  const body = unsigned.replace(/(?<=\d)\s(?=\d{3}(?!\d))/g, '');
  if (!/^[\d.,]+$/.test(body)) return null;

  const dots = countOf(body, '.');
  const commas = countOf(body, ',');

  let plain: string | null;
  if (dots > 0 && commas > 0) {
    const decimal = body.lastIndexOf('.') > body.lastIndexOf(',') ? '.' : ',';
    const group = decimal === '.' ? ',' : '.';
    if (countOf(body, decimal) !== 1) return null;
    const cut = body.lastIndexOf(decimal);
    const whole = ungroup(body.slice(0, cut), group);
    plain = whole === null ? null : `${whole}.${body.slice(cut + 1)}`;
  } else if (dots + commas === 0) {
    plain = body;
  } else {
    const mark = dots > 0 ? '.' : ',';
    const trailing = body.length - body.lastIndexOf(mark) - 1;
    const isGroup = dots + commas > 1 || (trailing === 3 && mark !== localeDecimal(locale));
    plain = isGroup ? ungroup(body, mark) : body.replace(mark, '.');
  }

  if (plain === null || !/^(\d+(\.\d+)?|\.\d+)$/.test(plain)) return null;
  const value = Number(`${sign}${plain}`);
  return Number.isFinite(value) ? value : null;
}

const FIGURE_TEXT = /^-?(\d+(\.\d+)?|\.\d+)$/;
const FIGURE_PREFIX = /^-?\d*\.?\d*$/;
const NOT_A_FIGURE = 'Enter a number';

function readFigure(text: string): number | null {
  const t = text.trim();
  return FIGURE_TEXT.test(t) ? Number(t) : null;
}

function isUnreadable(text: string): boolean {
  return !FIGURE_PREFIX.test(text.trim());
}

function figureText(value: number | null): string {
  return value === null ? '' : String(value);
}

type Entry = { c1: string; c2: string };
type EntryState = Record<string, Entry>;
const EMPTY_ENTRY: Entry = { c1: '', c2: '' };
const NO_ENTRIES: EntryState = {};

function withSlot(entry: Entry, slot: 'c1' | 'c2', value: string): Entry {
  return slot === 'c1' ? { c1: value, c2: entry.c2 } : { c1: entry.c1, c2: value };
}

const COMPONENT_BOX_WIDTH = 96;

type FigureGap = 'blank' | 'unreadable';

function figureGap(text: string): FigureGap | null {
  if (text.trim() === '') return 'blank';
  return readFigure(text) === null ? 'unreadable' : null;
}

function boxStatus(
  issue: string | null | undefined,
  gap: FigureGap | null,
): { type: 'error'; message?: string } | undefined {
  if (issue) return { type: 'error', message: issue };
  if (gap === 'unreadable') return { type: 'error', message: NOT_A_FIGURE };
  return gap ? { type: 'error' } : undefined;
}

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
  const [saveAttemptedFor, setSaveAttemptedFor] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const reloadKeys = useRef(new Set<string>());

  const recordKey = `${projectId}:${isoYear}:${isoWeek}`;
  const entries = entriesByRecord[recordKey] ?? NO_ENTRIES;
  const saveAttempted = saveAttemptedFor === recordKey;

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
        next[m.metric_id] = {
          c1: figureText(m.component_1_value),
          c2: figureText(m.component_2_value),
        };
      }
      return { ...prev, [recordKey]: next };
    });
  }, [recordQuery.data, recordKey]);

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

  const setComponent = (metric_id: string, slot: 'c1' | 'c2', next: string) => {
    editEntries((cur) => ({
      ...cur,
      [metric_id]: withSlot(cur[metric_id] ?? EMPTY_ENTRY, slot, next),
    }));
  };

  const pasteFigure =
    (metric_id: string, slot: 'c1' | 'c2') => (e: React.ClipboardEvent<HTMLInputElement>) => {
      e.preventDefault();
      const value = parseNumericPaste(e.clipboardData.getData('text'), navigator.language);
      if (value !== null) setComponent(metric_id, slot, String(value));
    };

  // FUT-595 AC4: a colour computed from values the user typed but has NOT saved yet is a
  // provisional preview — mark it, so it can't be mistaken for the settled (stored) colour.
  const savedEntries = useMemo(() => {
    const m = new Map<string, Entry>();
    for (const row of recordQuery.data?.metrics ?? []) {
      m.set(row.metric_id, {
        c1: figureText(row.component_1_value),
        c2: figureText(row.component_2_value),
      });
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
    const valueByMetric = new Map<string, number | null>();
    for (const m of metrics) {
      const e = entries[m.metric_id] ?? EMPTY_ENTRY;
      const c1 = readFigure(e.c1);
      const c2 = readFigure(e.c2);
      const issues = validateKpiEntry(m, c1, c2);
      if (isUnreadable(e.c1)) issues.component_1 = NOT_A_FIGURE;
      if (isUnreadable(e.c2)) issues.component_2 = NOT_A_FIGURE;
      issuesByMetric.set(m.metric_id, issues);
      const value = hasKpiEntryIssue(issues)
        ? null
        : computeScoredValue(
            m.component_count,
            c1,
            c2,
            kpiValuePrecision(m.green_band, m.yellow_band, m.red_band),
          );
      valueByMetric.set(m.metric_id, value);
      statusByMetric.set(
        m.metric_id,
        computeEntryStatus(value, m.green_band, m.yellow_band, m.red_band),
      );
    }
    const categoryColour = Object.fromEntries(
      KPI_CATEGORIES.map((cat) => [
        cat,
        computeRecordCategoryColour(
          metrics
            .filter((m) => m.category === cat)
            .map((m) => statusByMetric.get(m.metric_id) ?? null),
        ),
      ]),
    ) as Record<(typeof KPI_CATEGORIES)[number], ReturnType<typeof computeRecordCategoryColour>>;
    const overall = computeRecordOverallColour(KPI_CATEGORIES.map((c) => categoryColour[c]));
    return { issuesByMetric, statusByMetric, valueByMetric, categoryColour, overall };
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
    if (orderedMetrics.length === 0) {
      return { field: null, message: 'No metric is applied to this project yet' };
    }
    const grey = orderedMetrics.filter(
      (m) => (live.statusByMetric.get(m.metric_id) ?? null) === null,
    );
    if (grey.length > 0) {
      const noun = grey.length === 1 ? 'metric is' : 'metrics are';
      return {
        field: grey[0] ? `${grey[0].metric_id}:c1` : null,
        message: `${grey.length} ${noun} still Grey — every metric needs its figures to save`,
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
            component_1_value: readFigure(e.c1),
            component_2_value: readFigure(e.c2),
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
    setSaveAttemptedFor(recordKey);
    const el = saveBlock.field ? fieldRefs.current.get(saveBlock.field) : undefined;
    if (!el) return;
    el.focus({ preventScroll: true });
    const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ block: 'center', behavior: calm ? 'auto' : 'smooth' });
  };

  const requestClose = () => {
    if (save.isPending) return;
    if (anyDirty) {
      setConfirmDiscard(true);
      return;
    }
    onOpenChange(false);
  };

  const discard = () => {
    setConfirmDiscard(false);
    onOpenChange(false);
  };

  const isNewRecord = recordQuery.data?.record_id == null;
  // Epic 3 week gate, mirrored client-side: only the current week (before Friday 17:00 VNT)
  // is writable — closed weeks render read-only values behind the warning banner.
  const weekOpen = isReportingWeekOpen(isoYear, isoWeek, weeks[0]);

  return (
    <>
      <Dialog
        isOpen
        onOpenChange={(open) => !open && requestClose()}
        width={760}
        maxHeight="85vh"
        purpose="form"
      >
        <Layout
          header={
            <DialogHeader
              title="Manual KPI input"
              onOpenChange={(open) => !open && requestClose()}
              endContent={
                <div className="flex items-center gap-2">
                  {kpiColourBadge(live.overall)}
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
              <div className="space-y-4">
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
                        <div className="col-span-2">Result</div>
                      </div>
                      <div className="px-3">
                        {KPI_CATEGORIES.map((cat) => {
                          const catMetrics = metrics.filter((m) => m.category === cat);
                          if (catMetrics.length === 0) return null;
                          return (
                            <div key={cat} className="pt-5 first:pt-0">
                              <div className="sticky top-0 z-10 flex items-center gap-2 bg-surface pb-1 pt-1.5">
                                <Heading level={3}>{KPI_CATEGORY_LABELS[cat]}</Heading>
                                {kpiColourBadge(live.categoryColour[cat])}
                              </div>
                              {catMetrics.map((m) => {
                                const e = entries[m.metric_id] ?? EMPTY_ENTRY;
                                const issues = live.issuesByMetric.get(m.metric_id);
                                const markMissing =
                                  saveAttempted &&
                                  (live.statusByMetric.get(m.metric_id) ?? null) === null;
                                const result = live.valueByMetric.get(m.metric_id) ?? null;
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
                                          {metricUnit(
                                            m.name,
                                            m.component_count,
                                            m.component_1_label,
                                          )}
                                        </Badge>
                                      </div>
                                      <div className="text-sm text-secondary">
                                        {m.formula_label}
                                      </div>
                                      <div className="text-sm tabular-nums">
                                        <span className="text-success">{bands.green}</span>
                                        <span className="text-secondary"> · </span>
                                        <span className="text-warning">{bands.yellow}</span>
                                        <span className="text-secondary"> · </span>
                                        <span className="text-error">{bands.red}</span>
                                      </div>
                                    </div>
                                    <div className="col-span-4 flex items-start gap-1.5">
                                      <Input
                                        ref={registerField(`${m.metric_id}:c1`)}
                                        label={m.component_1_label}
                                        isLabelHidden
                                        inputMode="decimal"
                                        width={COMPONENT_BOX_WIDTH}
                                        value={e.c1}
                                        hasClear
                                        isDisabled={!weekOpen}
                                        className={HIDE_STATUS_ICON}
                                        status={boxStatus(
                                          issues?.component_1,
                                          markMissing ? figureGap(e.c1) : null,
                                        )}
                                        onPaste={pasteFigure(m.metric_id, 'c1')}
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
                                          <Input
                                            ref={registerField(`${m.metric_id}:c2`)}
                                            label={m.component_2_label ?? ''}
                                            isLabelHidden
                                            inputMode="decimal"
                                            width={COMPONENT_BOX_WIDTH}
                                            value={e.c2}
                                            hasClear
                                            isDisabled={!weekOpen}
                                            className={HIDE_STATUS_ICON}
                                            status={boxStatus(
                                              issues?.component_2,
                                              markMissing ? figureGap(e.c2) : null,
                                            )}
                                            onPaste={pasteFigure(m.metric_id, 'c2')}
                                            onChange={(next) =>
                                              setComponent(m.metric_id, 'c2', next)
                                            }
                                          />
                                        </>
                                      ) : null}
                                    </div>
                                    <div className="col-span-2 flex items-center gap-1.5">
                                      {kpiResultValue(
                                        result,
                                        live.statusByMetric.get(m.metric_id) ?? null,
                                        m.name,
                                        m.component_count,
                                      )}
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
                <Button
                  variant="secondary"
                  label="Cancel"
                  onClick={requestClose}
                  isDisabled={save.isPending}
                />
                <Button
                  variant="primary"
                  label={save.isPending ? 'Saving…' : 'Save record'}
                  onClick={onSaveClick}
                  isDisabled={!weekOpen || !projectId || save.isPending || recordQuery.isFetching}
                />
              </HStack>
            </LayoutFooter>
          }
        />
      </Dialog>
      <AlertDialog
        isOpen={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        title="Discard these figures?"
        description="The figures you entered for this week haven't been saved."
        cancelLabel="Keep editing"
        actionLabel="Discard"
        actionVariant="destructive"
        onAction={discard}
      />
    </>
  );
}
