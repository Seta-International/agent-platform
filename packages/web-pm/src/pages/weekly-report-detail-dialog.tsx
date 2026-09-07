import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { CalendarDays } from 'lucide-react';
import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import {
  addWeeklyReportComment,
  fetchWeeklyReportDetail,
  type KpiCategory,
  type ReportColour,
  upsertWeeklyReport,
  type WeeklyReportDetail,
  type WeeklyReportEntry,
} from '../api/pm-client.ts';
import { pmKeys } from '../state/query-keys.ts';
import {
  AlertDialog,
  Avatar,
  AvatarFallback,
  Banner,
  Button,
  Card,
  ChatComposer,
  ChatComposerInput,
  DateInput,
  Dialog,
  DialogHeader,
  DisabledActionTooltip,
  HStack,
  Layout,
  LayoutContent,
  LayoutFooter,
  Selector,
  Skeleton,
  StatusDot,
  Switch,
  Textarea,
  toast,
} from './_ui-compat.tsx';
import {
  COLOUR_LABEL,
  COLOUR_VARIANT,
  colourBadge,
  colourKey,
  dueDateFloor,
  formatBand,
  formatDueDate,
  formatMetricValue,
  formatReportedOn,
  isoWeekBase,
  KPI_CATEGORIES,
  KPI_CATEGORY_LABELS,
  markStyle,
  ragFill,
} from './kpi-shared.tsx';

// Same ranking as the backend's worstColour — gray (N/A) dampens but never hides yellow/red.
const COLOUR_RANK: Record<ReportColour, number> = { green: 0, gray: 1, yellow: 2, red: 3 };

const SEG_TINT: Record<'green' | 'yellow' | 'red', CSSProperties> = {
  green: { backgroundColor: 'var(--rag-green-wash)', color: 'var(--rag-green-text)' },
  yellow: { backgroundColor: 'var(--rag-amber-wash)', color: 'var(--rag-amber-text)' },
  red: { backgroundColor: 'var(--rag-red-wash)', color: 'var(--rag-red-text)' },
};
const SEG_COLOURS = ['green', 'yellow', 'red'] as const;

const NOT_REPORTER_REASON = "Only this project's EM and PMO can write its weekly report.";

const PRICING_LABEL: Record<string, string> = {
  fixed_price: 'Fixed-price',
  time_materials: 'T&M',
};

function initials(name: string | null): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase() || '?';
}

// Today's comments read as a conversation (time), older ones as a record (date).
function commentWhen(iso: string): string {
  const d = new Date(iso);
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString();
}

type ReportComment = WeeklyReportEntry['comments'][number];

function newestFirst(comments: ReportComment[]): ReportComment[] {
  const byParent = new Map<string | null, ReportComment[]>();
  const ids = new Set(comments.map((c) => c.id));
  for (const c of comments) {
    const parent = c.parent_comment_id && ids.has(c.parent_comment_id) ? c.parent_comment_id : null;
    byParent.set(parent, [...(byParent.get(parent) ?? []), c]);
  }
  const replies = (id: string): ReportComment[] =>
    (byParent.get(id) ?? []).flatMap((c) => [c, ...replies(c.id)]);
  return [...(byParent.get(null) ?? [])].reverse().flatMap((c) => [c, ...replies(c.id)]);
}

function StatsLine({ detail }: { detail: WeeklyReportDetail }) {
  const { worst, measured_count, applied_count, red_count, yellow_count } = detail.stats;

  const spread: string[] = [];
  if (measured_count === 0) spread.push('KPI Metrics: No figures entered this week');
  else if (red_count + yellow_count === 0)
    spread.push(`KPI Metrics: All ${measured_count} on norm`);
  else
    spread.push(
      `KPI Metrics: ${red_count} red, ${yellow_count} amber and ${measured_count - red_count - yellow_count} green`,
    );
  if (measured_count > 0 && measured_count < applied_count) {
    spread.push(`${applied_count - measured_count} still blank`);
  }

  return (
    <p className="text-base text-secondary">
      {worst && worst.computed_value !== null ? (
        <>
          <span className="font-semibold text-primary">{worst.name}</span>{' '}
          <span className="font-semibold text-primary">
            {formatMetricValue(worst.computed_value, worst.name, worst.component_count)}
          </span>
          {` vs norm ${formatBand(worst.name, worst.component_count, worst.green_band)} · `}
        </>
      ) : null}
      {spread.join(' · ')}
    </p>
  );
}

function ReportCard({
  entry,
  draft,
  onDraftChange,
  onComment,
}: {
  entry: WeeklyReportEntry;
  draft: string;
  onDraftChange: (body: string) => void;
  onComment: (report_id: string, body: string) => void;
}) {
  const thread = useMemo(() => newestFirst(entry.comments), [entry.comments]);
  return (
    <Card padding={4} className="space-y-3">
      {/* The reporter's name is the card's identity — the only bold element up here. Section
          labels below drop to eyebrows so the written content stays the loudest thing. */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-muted text-sm font-medium">
              {initials(entry.reporter_name)}
            </AvatarFallback>
          </Avatar>
          <span className="truncate text-base font-semibold text-primary">
            {entry.reporter_name ?? 'Unknown'}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-sm text-secondary">{formatReportedOn(entry.updated_at)}</span>
          {colourBadge(entry.overall_colour)}
        </div>
      </div>

      {entry.executive_summary ? (
        <div className="space-y-0.5">
          <div className="text-xs uppercase tracking-wide text-secondary">Summary</div>
          <p className="text-base text-primary">{entry.executive_summary}</p>
        </div>
      ) : null}
      {entry.risk_issue ? (
        <div className="space-y-0.5">
          <div className="text-xs uppercase tracking-wide text-secondary">Risk / Issue</div>
          <p className="text-base text-primary">{entry.risk_issue}</p>
        </div>
      ) : null}
      {/* A Green entry carries no recovery plan — hide any stale Road-to-Green saved by older
          revisions so the card never shows "Green" and a recovery plan side by side. */}
      {entry.road_to_green && entry.overall_colour !== 'green' ? (
        <div
          className="border-l-2 pl-3 text-base text-secondary"
          style={{
            borderColor: ragFill(colourKey(entry.overall_colour)) ?? 'var(--color-border)',
          }}
        >
          <span className="font-semibold text-primary">Road to Green</span> ·{' '}
          <span className="text-primary">{entry.road_to_green}</span>
          {entry.road_to_green_owner_name ? (
            <>
              {' · '}
              <span className="font-medium text-primary">{entry.road_to_green_owner_name}</span>
            </>
          ) : null}
          {entry.road_to_green_due ? (
            <span className="whitespace-nowrap">
              {` · due ${formatDueDate(entry.road_to_green_due)}`}
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="space-y-3 border-t border-border pt-3">
        {entry.published ? (
          <ChatComposer
            value={draft}
            onChange={onDraftChange}
            onSubmit={(body) => onComment(entry.report_id, body)}
            placeholder="Write a comment — Enter to submit"
            density="compact"
            elevation="none"
            style={
              {
                '--_chat-composer-radius': 'var(--radius-element)',
                '--_button-radius': 'var(--radius-full)',
              } as CSSProperties
            }
            input={<ChatComposerInput label="Write a comment" maxRows={5} hasHistory={false} />}
          />
        ) : (
          <p className="text-xs text-secondary">Comments open once this report is submitted.</p>
        )}
        {thread.length > 0 ? (
          <div className="space-y-3">
            <div className="text-xs uppercase tracking-wide text-secondary">
              Comments ({thread.length})
            </div>
            {thread.map((c) => (
              // Replies indent by one avatar column so the thread reads at a glance.
              <div key={c.id} className={`flex gap-2.5 ${c.parent_comment_id ? 'pl-9' : ''}`}>
                <Avatar className="mt-0.5 h-7 w-7">
                  <AvatarFallback className="bg-muted text-sm font-medium">
                    {initials(c.author_name)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="truncate text-base font-medium text-primary">
                      {c.author_name ?? 'Unknown'}
                    </span>
                    <span className="shrink-0 text-sm text-secondary">
                      {commentWhen(c.created_at)}
                    </span>
                  </div>
                  <p className="text-base text-primary [overflow-wrap:anywhere]">{c.body}</p>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </Card>
  );
}

export function WeeklyReportDetailDialog({
  project_id,
  iso_year,
  iso_week,
  onOpenChange,
  startInCompose = false,
  projectOptions,
  onProjectChange,
  openedFromExplorer = false,
}: {
  /** null = opened without an explicit project context (FUT-589 AC1) — the dialog blocks on
   * a pick-a-project prompt instead of silently defaulting to some project. */
  project_id: string | null;
  iso_year: number;
  iso_week: number;
  onOpenChange: (open: boolean) => void;
  /** Open with the report composer visible — the "+ New weekly report" entry point. The
   * dialog itself has no compose button (the mock's footer is Close + Raise backfill only). */
  startInCompose?: boolean;
  /** Mock's PROJECT dropdown in the composer — the caller's manageable projects. Switching
   * remounts the dialog on the new project (the caller keys it by project_id). */
  projectOptions?: { value: string; label: string }[];
  onProjectChange?: (project_id: string) => void;
  openedFromExplorer?: boolean;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const detailQuery = useQuery({
    queryKey: pmKeys.weeklyReportDetail({ project_id, iso_year, iso_week }),
    queryFn: () =>
      fetchWeeklyReportDetail({ project_id: project_id as string, iso_year, iso_week }),
    enabled: project_id !== null,
    // Refusals here are deterministic (not assigned as-of that week / no access) — retrying
    // just leaves the user staring at skeletons before the error message can show.
    retry: false,
  });
  const detail = detailQuery.data;
  const invalidate = () => {
    queryClient.invalidateQueries({
      queryKey: pmKeys.weeklyReportDetail({ project_id, iso_year, iso_week }),
    });
    queryClient.invalidateQueries({ queryKey: pmKeys.all });
  };

  const [formOpen, setFormOpen] = useState(startInCompose);

  const alreadyReported =
    detail?.reports.some((r) => r.reporter_id === detail.my_reporter_id) ?? false;
  const notReporter = Boolean(detail && !detail.can_report);
  const projectEnded = Boolean(detail?.project_ended);
  const projectEndedReason = detail?.project_date_to
    ? `This project ended ${formatDueDate(detail.project_date_to)}, before this week started.`
    : 'This project has already ended.';
  const composeOffered = Boolean(detail?.can_manage && detail.week_editable && !alreadyReported);
  const canCompose = composeOffered && !notReporter && !projectEnded;

  const [summary, setSummary] = useState('');
  const [riskIssue, setRiskIssue] = useState('');
  const [roadToGreen, setRoadToGreen] = useState('');
  const [roadToGreenDue, setRoadToGreenDue] = useState('');
  const [hasActiveRisk, setHasActiveRisk] = useState(false);
  // The reporter's declared QCDP colours — prefilled from this week's effective colours
  // (computed, or an earlier override) once the composer opens with data.
  const [colours, setColours] = useState<Partial<Record<KpiCategory, ReportColour>>>({});
  const prefilled = useRef(false);
  const prefilledColours = useRef<Partial<Record<KpiCategory, ReportColour>>>({});
  // The composer's discard prompt, holding whichever way out the reporter asked for: Cancel,
  // X / Escape, switching project, or the footer's KPI Explorer link.
  const [pendingExit, setPendingExit] = useState<{ run: () => void } | null>(null);

  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const commentDirty = Object.values(commentDrafts).some((b) => b.trim() !== '');
  // The read view's own discard prompt, holding whichever way out the reader asked for —
  // closing the dialog, or one of the two footer buttons that navigate the page away.
  const [pendingLeave, setPendingLeave] = useState<{ run: () => void } | null>(null);

  // Submit is always clickable now (only the pending save disables it). Clicking with gaps
  // reveals inline field errors and scrolls to the first one, instead of a dead grey button
  // that never says what's missing (FUT-740). Errors surface only after the first submit
  // attempt, then clear live as each field is filled. Refs let the click scroll + focus the
  // first offending control.
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [riskAttempted, setRiskAttempted] = useState(false);
  const summaryRef = useRef<HTMLTextAreaElement>(null);
  const riskIssueRef = useRef<HTMLTextAreaElement>(null);
  const roadToGreenRef = useRef<HTMLTextAreaElement>(null);
  const dueRef = useRef<HTMLDivElement>(null);
  const pillarsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!formOpen || !detail || prefilled.current) return;
    prefilled.current = true;
    const declared: Partial<Record<KpiCategory, ReportColour>> = {};
    for (const f of detail.flags) {
      declared[f.category] =
        f.final_colour === 'yellow' || f.final_colour === 'red' ? f.final_colour : 'green';
    }
    prefilledColours.current = declared;
    setColours(declared);
  }, [formOpen, detail]);

  const save = useMutation({
    // The composer only renders once a project is chosen — the cast documents that.
    mutationFn: () =>
      upsertWeeklyReport({
        project_id: project_id as string,
        iso_year,
        iso_week,
        executive_summary: summary.trim(),
        risk_issue: hasActiveRisk ? riskIssue.trim() || null : null,
        road_to_green: hasActiveRisk ? roadToGreen.trim() || null : null,
        road_to_green_due: hasActiveRisk ? roadToGreenDue || null : null,
        category_colours: colours,
      }),
    onSuccess: () => {
      setSubmitAttempted(false); // a fresh reopen shouldn't inherit stale error styling
      setRiskAttempted(false);
      toast.success('Report submitted');
      setFormOpen(false);
      invalidate();
    },
    onError: (err: Error) => toast.error(err.message || 'Could not save report'),
  });

  const comment = useMutation({
    mutationFn: ({ report_id, body }: { report_id: string; body: string }) =>
      addWeeklyReportComment({ report_id, body }),
    onSuccess: invalidate,
    onError: (err: Error) => toast.error(err.message || 'Could not add comment'),
  });

  // Overall in the composer is auto = worst of the four declared colours (mock: "auto from
  // QCDP (worst)"), falling back to this week's effective colours until a pillar is touched.
  const declaredOverall: ReportColour | null = detail
    ? KPI_CATEGORIES.reduce<ReportColour | null>((worst, c) => {
        const colour =
          colours[c] ?? detail.flags.find((f) => f.category === c)?.final_colour ?? null;
        if (colour === null) return worst;
        if (worst === null) return colour;
        return COLOUR_RANK[colour] > COLOUR_RANK[worst] ? colour : worst;
      }, null)
    : null;
  const flagsAllGreen = declaredOverall === 'green';
  // Epic 3: a week with any measured KPI over norm cannot be declared all-Green.
  const kpiOverNorm =
    detail !== undefined && (detail.stats.yellow_count > 0 || detail.stats.red_count > 0);
  const allGreenBlocked = kpiOverNorm && flagsAllGreen;
  const riskNeedsFlag = hasActiveRisk && flagsAllGreen;

  const summaryMissing = summary.trim() === '';
  const riskIssueMissing = hasActiveRisk && riskIssue.trim() === '';
  const roadToGreenMissing = hasActiveRisk && roadToGreen.trim() === '';
  const dueFloor = dueDateFloor({ iso_year, iso_week });
  const dueMissing = hasActiveRisk && roadToGreenDue === '';
  const summaryError =
    submitAttempted && summaryMissing ? 'Add an executive summary before submitting.' : undefined;
  const riskIssueError =
    riskAttempted && riskIssueMissing ? 'Describe the risk or issue before submitting.' : undefined;
  const roadToGreenError =
    riskAttempted && roadToGreenMissing
      ? 'A Road-to-Green action is required while a risk is active.'
      : undefined;
  const dueError =
    riskAttempted && dueMissing ? 'Pick the date the Road-to-Green action is due.' : undefined;

  const toggleActiveRisk = (v: boolean) => {
    setHasActiveRisk(v);
    setRiskIssue('');
    setRoadToGreen('');
    setRoadToGreenDue('');
    setRiskAttempted(false);
  };

  const handleSubmit = () => {
    setSubmitAttempted(true);
    if (hasActiveRisk) setRiskAttempted(true);
    const target =
      riskNeedsFlag || allGreenBlocked
        ? pillarsRef
        : summaryMissing
          ? summaryRef
          : riskIssueMissing
            ? riskIssueRef
            : roadToGreenMissing
              ? roadToGreenRef
              : dueMissing
                ? dueRef
                : null;
    if (target) {
      target.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (target === dueRef) dueRef.current?.querySelector('input')?.focus();
      else if (target !== pillarsRef) target.current?.focus();
      return;
    }
    save.mutate();
  };

  const dirty =
    summary.trim() !== '' ||
    hasActiveRisk ||
    riskIssue.trim() !== '' ||
    roadToGreen.trim() !== '' ||
    roadToGreenDue !== '' ||
    KPI_CATEGORIES.some((c) => colours[c] !== prefilledColours.current[c]);

  // Leaving the composer ends the attempt: a later reopen is a fresh form, not the previous
  // attempt's leftovers — its error styling included (FUT-740).
  const resetComposer = () => {
    setSummary('');
    setRiskIssue('');
    setRoadToGreen('');
    setRoadToGreenDue('');
    setHasActiveRisk(false);
    setColours(prefilledColours.current);
    setSubmitAttempted(false);
    setRiskAttempted(false);
  };

  // Cancel falls back to the read view — except when the composer was the entry point (the
  // board's "+ New weekly report"), where no read view was ever asked for.
  const exitComposer = (exit: 'cancel' | 'close') => {
    if (exit === 'close' || startInCompose) onOpenChange(false);
    else setFormOpen(false);
  };

  // Every way out of a composer holding unsaved input asks first; the thunk is what happens
  // once the reporter says yes, so a new exit only has to describe where it goes.
  const guardComposer = (leave: () => void) => {
    if (save.isPending) return;
    if (dirty) {
      setPendingExit({ run: leave });
      return;
    }
    resetComposer();
    leave();
  };

  const requestExit = (exit: 'cancel' | 'close') => guardComposer(() => exitComposer(exit));

  const discardReport = () => {
    const leave = pendingExit?.run;
    setPendingExit(null);
    resetComposer();
    leave?.();
  };

  const guardComment = (leave: () => void) => {
    if (commentDirty) setPendingLeave({ run: leave });
    else leave();
  };

  const discardComment = () => {
    const leave = pendingLeave?.run;
    setPendingLeave(null);
    setCommentDrafts({});
    leave?.();
  };

  const pricing = detail?.pricing_model ? (PRICING_LABEL[detail.pricing_model] ?? null) : null;
  const seatsShort =
    detail?.team_size != null && detail.team_size > detail.staffed
      ? detail.team_size - detail.staffed
      : 0;

  // FUT-589 AC1: no project context yet — block on an explicit prompt. Choosing a project
  // hands off to onProjectChange, which remounts this dialog under the chosen context.
  if (project_id === null) {
    return (
      <Dialog isOpen onOpenChange={onOpenChange} width={480} maxHeight="88vh" purpose="form">
        <Layout
          header={<DialogHeader title="New weekly report" onOpenChange={onOpenChange} />}
          content={
            <LayoutContent>
              <div className="space-y-3">
                <p className="text-sm text-secondary">
                  Every report is pinned to a Project + Week. Pick the project to continue — week{' '}
                  {isoWeekBase(iso_year, iso_week)}.
                </p>
                <div className="space-y-1">
                  <Selector
                    label="Project"
                    options={projectOptions ?? []}
                    value=""
                    onChange={(v) => {
                      if (v) onProjectChange?.(v);
                    }}
                    placeholder="Pick a project…"
                  />
                </div>
              </div>
            </LayoutContent>
          }
          footer={
            <LayoutFooter hasDivider>
              <HStack gap={2} hAlign="end">
                <Button variant="secondary" label="Cancel" onClick={() => onOpenChange(false)} />
              </HStack>
            </LayoutFooter>
          }
        />
      </Dialog>
    );
  }

  const composing = formOpen && canCompose;
  // X, Escape and the footer's Close all land here. While the composer holds unsaved input they
  // ask first, exactly as Cancel does; so does an unsent comment draft in the read view.
  // Everywhere else they dismiss straight away.
  const requestDialogClose = (open: boolean) => {
    if (open) return;
    if (composing) requestExit('close');
    else guardComment(() => onOpenChange(false));
  };
  // Footer links navigate the page away, so they clear whichever guard the current mode owns:
  // the composer's unsent report, or an unsent comment in the read view.
  const guardLeave = (leave: () => void) => {
    if (composing) guardComposer(leave);
    else guardComment(leave);
  };
  // The composer carries a Project field that both names and switches the project. When it's
  // present the subtitle drops the project (it would repeat the field) and carries the same
  // account/owner/phase context the read view shows; without the switcher it leads with the
  // project, the only place that names it.
  const showProjectSwitcher = Boolean(
    projectOptions && projectOptions.length > 0 && onProjectChange,
  );
  const projectContext = detail
    ? [
        detail.account_name,
        detail.pm_name ? `EM ${detail.pm_name}` : null,
        detail.pmo_name ? `PMO ${detail.pmo_name}` : null,
        `${detail.phase.charAt(0).toUpperCase()}${detail.phase.slice(1)}`,
        pricing,
      ]
        .filter(Boolean)
        .join(' · ')
    : undefined;
  const headerSubtitle =
    composing && detail && !showProjectSwitcher
      ? [detail.project_name, projectContext].filter(Boolean).join(' · ')
      : projectContext;

  return (
    <>
      <Dialog
        isOpen
        onOpenChange={requestDialogClose}
        width={composing ? 'min(1080px, 94vw)' : 720}
        maxHeight="88vh"
        purpose="form"
      >
        <Layout
          header={
            <DialogHeader
              hasDivider
              title={
                composing
                  ? `New weekly report · ${isoWeekBase(iso_year, iso_week)}`
                  : detail
                    ? `${detail.project_name} · ${isoWeekBase(iso_year, iso_week)}`
                    : 'Weekly report'
              }
              subtitle={headerSubtitle}
              endContent={
                detail ? (
                  <span className="flex items-center gap-2">
                    <span className="text-xs uppercase tracking-wide text-secondary">Overall</span>
                    {colourBadge(composing ? declaredOverall : detail.overall_colour)}
                  </span>
                ) : undefined
              }
              onOpenChange={requestDialogClose}
            />
          }
          footer={
            detailQuery.isError ? (
              <LayoutFooter hasDivider>
                <HStack gap={2} hAlign="end">
                  <Button variant="secondary" label="Close" onClick={() => onOpenChange(false)} />
                </HStack>
              </LayoutFooter>
            ) : detail ? (
              <LayoutFooter hasDivider>
                <HStack gap={2} hAlign="between" vAlign="center">
                  {!openedFromExplorer && detail.stats.applied_count > 0 ? (
                    <Button
                      variant="secondary"
                      onClick={() =>
                        guardLeave(
                          () =>
                            void navigate({
                              to: '/pm/metrics',
                              search: {
                                tab: 'explorer',
                                project: detail.project_id,
                                iso_year: detail.iso_year,
                                iso_week: detail.iso_week,
                              },
                            }),
                        )
                      }
                      label="KPI Explorer"
                    />
                  ) : (
                    <span />
                  )}
                  <HStack gap={2} vAlign="center">
                    {composing ? (
                      <>
                        <Button
                          variant="secondary"
                          label="Cancel"
                          onClick={() => requestExit('cancel')}
                        />
                        {/* Always clickable — validation happens on click (inline errors + scroll to
                        the first gap) rather than a disabled button that never says why. */}
                        <Button
                          variant="primary"
                          label="Submit report"
                          onClick={handleSubmit}
                          isDisabled={save.isPending}
                        />
                      </>
                    ) : (
                      <>
                        <Button
                          variant="secondary"
                          label="Close"
                          onClick={() => requestDialogClose(false)}
                        />
                        {seatsShort > 0 && detail.can_manage ? (
                          <DisabledActionTooltip
                            disabled={!detail.week_editable}
                            reason="Backfills can only be raised for the current week, until Friday 5:00 PM."
                          >
                            <Button
                              variant="primary"
                              label={`Raise backfill (${seatsShort} seat${seatsShort === 1 ? '' : 's'})`}
                              isDisabled={!detail.week_editable}
                              onClick={() =>
                                guardComment(() => {
                                  onOpenChange(false);
                                  void navigate({
                                    to: '/pm/resourcing',
                                    search: { project: project_id },
                                  });
                                })
                              }
                            />
                          </DisabledActionTooltip>
                        ) : null}
                      </>
                    )}
                  </HStack>
                </HStack>
              </LayoutFooter>
            ) : undefined
          }
          content={
            <LayoutContent>
              {detailQuery.isError ? (
                <p className="rounded-lg border border-border px-3 py-8 text-center text-sm text-secondary">
                  {(detailQuery.error as Error).message ||
                    'This report could not be loaded — you may not have access to this week.'}
                </p>
              ) : detailQuery.isLoading || !detail ? (
                <div className="space-y-2">
                  <Skeleton className="h-24 w-full" />
                  <Skeleton className="h-40 w-full" />
                </div>
              ) : (
                <div className="space-y-4">
                  {/* View-only QCDP snapshot — the composer edits the pillars below (the source of
                    truth), so a stale duplicate here would only contradict them. */}
                  {/* Same treatment as the list cards: StatusDot + full pillar name, off-norm
                    pillars weight their name. */}
                  {!composing ? (
                    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                        {detail.flags.map((f) => {
                          const off =
                            f.final_colour !== null &&
                            f.final_colour !== 'green' &&
                            f.final_colour !== 'gray';
                          const key = colourKey(f.final_colour);
                          const name =
                            KPI_CATEGORY_LABELS[f.category].split(' — ')[1] ??
                            KPI_CATEGORY_LABELS[f.category];
                          return (
                            <span
                              key={f.category}
                              className="flex items-center gap-1.5 text-sm"
                              title={`${KPI_CATEGORY_LABELS[f.category]}: ${COLOUR_LABEL[key]}`}
                            >
                              <StatusDot
                                variant={COLOUR_VARIANT[key]}
                                label={`${KPI_CATEGORY_LABELS[f.category]}: ${COLOUR_LABEL[key]}`}
                                style={markStyle(key)}
                              />
                              <span
                                className={off ? 'font-semibold text-primary' : 'text-secondary'}
                              >
                                {name}
                              </span>
                            </span>
                          );
                        })}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs uppercase tracking-wide text-secondary">
                          Trend
                        </span>
                        <span className="flex gap-px overflow-hidden rounded-sm">
                          {[...detail.trend].reverse().map((t, i, arr) => (
                            <span
                              key={`${t.iso_year}-${t.iso_week}`}
                              className="inline-block h-2.5 w-4"
                              style={{
                                backgroundColor:
                                  ragFill(colourKey(t.colour)) ?? 'var(--color-background-gray)',
                              }}
                              title={`${isoWeekBase(t.iso_year, t.iso_week)}: ${COLOUR_LABEL[colourKey(t.colour)]}${
                                i === arr.length - 1 ? ' (this week)' : ''
                              }`}
                            />
                          ))}
                        </span>
                      </div>
                    </div>
                  ) : null}

                  <StatsLine detail={detail} />

                  {/* Composing is a focused view (mock: the submit modal is just the form) — the
                submitted reports and their comment threads only render in the read view. */}
                  {composing ? null : detail.reports.length === 0 ? (
                    // Empty state is an invitation to act: a reporter who can still write this
                    // week's report gets the composer one click away, right where the gap is.
                    // Quieter than the shared EmptyState on purpose — inside a dialog the empty
                    // slot is a hint, not a hero: caption-scale type and a hairline button.
                    <div className="flex flex-col items-center rounded-lg border border-border px-3 py-8 text-center">
                      <CalendarDays className="mb-2 h-5 w-5 text-secondary" strokeWidth={1.5} />
                      <p className="text-sm font-medium text-primary">No reports yet</p>
                      <p className="mt-0.5 text-xs text-secondary">
                        {detail.can_manage && detail.week_editable
                          ? `Reports for ${isoWeekBase(iso_year, iso_week)} stay open until Friday 5:00 PM.`
                          : `No one submitted a report for ${isoWeekBase(iso_year, iso_week)}.`}
                      </p>
                      {composeOffered ? (
                        <DisabledActionTooltip
                          disabled={notReporter || projectEnded}
                          reason={projectEnded ? projectEndedReason : NOT_REPORTER_REASON}
                          className="mt-3"
                        >
                          <Button
                            variant="secondary"
                            size="sm"
                            className={notReporter || projectEnded ? undefined : 'mt-3'}
                            isDisabled={notReporter || projectEnded}
                            onClick={() => setFormOpen(true)}
                          >
                            New weekly report
                          </Button>
                        </DisabledActionTooltip>
                      ) : null}
                    </div>
                  ) : (
                    detail.reports.map((r) => (
                      <ReportCard
                        key={r.report_id}
                        entry={r}
                        draft={commentDrafts[r.report_id] ?? ''}
                        onDraftChange={(body) =>
                          setCommentDrafts((prev) => ({ ...prev, [r.report_id]: body }))
                        }
                        onComment={(report_id, body) => comment.mutate({ report_id, body })}
                      />
                    ))
                  )}

                  {formOpen && detail.can_manage && !detail.week_editable ? (
                    // Epic 3: flags are set for the current week only and lock Friday 5:00 PM (VNT).
                    // Past/future weeks stay readable and commentable.
                    <p className="rounded-lg border border-border px-3 py-4 text-center text-sm text-secondary">
                      {isoWeekBase(iso_year, iso_week)} is locked — reports cover the current week
                      only and close at Friday 5:00 PM.
                    </p>
                  ) : null}

                  {composing ? (
                    <section className="space-y-5">
                      {/* The report's project — names it and switches it without leaving the
                        composer. The header carries the title + week, so this field is the only
                        place the project name appears. */}
                      {showProjectSwitcher ? (
                        <div className="space-y-1">
                          <Selector
                            label="Project"
                            width={360}
                            options={projectOptions ?? []}
                            value={project_id ?? ''}
                            onChange={(v) => {
                              if (v && v !== project_id) {
                                guardComposer(() => onProjectChange?.(v));
                              }
                            }}
                          />
                        </div>
                      ) : null}

                      <div ref={pillarsRef} className="space-y-2">
                        <div className="text-xs uppercase tracking-wide text-secondary">
                          QCDP pillars
                        </div>
                        <div className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-4">
                          {KPI_CATEGORIES.map((cat) => {
                            const current = colours[cat];
                            const value =
                              current === 'yellow' ? 'yellow' : current === 'red' ? 'red' : 'green';
                            return (
                              <div key={cat} className="space-y-1.5">
                                <span className="block text-sm font-semibold text-primary">
                                  {KPI_CATEGORY_LABELS[cat]}
                                </span>
                                {/* Real radios inside labels (visually-hidden control) — Astryx's
                                  SegmentedControl can't tint per item, so this is the accessible
                                  escape hatch for the status wash (FUT-740). */}
                                <div
                                  role="radiogroup"
                                  aria-label={KPI_CATEGORY_LABELS[cat]}
                                  className="grid w-full grid-cols-3 overflow-hidden rounded-md border border-border"
                                >
                                  {SEG_COLOURS.map((sc, i) => {
                                    const on = value === sc;
                                    return (
                                      <label
                                        key={sc}
                                        className={`cursor-pointer py-1.5 text-center text-sm transition-colors ${
                                          i > 0 ? 'border-l border-border' : ''
                                        } ${on ? 'font-semibold' : 'bg-card text-secondary hover:bg-muted'}`}
                                        style={on ? SEG_TINT[sc] : undefined}
                                      >
                                        <input
                                          type="radio"
                                          name={`qcdp-${cat}`}
                                          value={sc}
                                          checked={on}
                                          onChange={() =>
                                            setColours((prev) => ({ ...prev, [cat]: sc }))
                                          }
                                          className="sr-only"
                                        />
                                        {COLOUR_LABEL[sc]}
                                      </label>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <Textarea
                        ref={summaryRef}
                        label="Executive summary"
                        isRequired
                        value={summary}
                        onChange={setSummary}
                        placeholder="What happened this week, and why this status?"
                        rows={3}
                        status={summaryError ? { type: 'error', message: summaryError } : undefined}
                      />

                      <div
                        className={hasActiveRisk ? undefined : 'rounded-lg border p-3'}
                        style={
                          hasActiveRisk
                            ? undefined
                            : {
                                borderColor: 'var(--color-border-blue)',
                                backgroundColor:
                                  'color-mix(in oklab, var(--color-background-blue) 45%, transparent)',
                              }
                        }
                      >
                        <Switch
                          label="This project has active Risk / Issue this week"
                          description="Turn on if there is any risk or issue impacting the project this week."
                          value={hasActiveRisk}
                          onChange={toggleActiveRisk}
                        />
                      </div>

                      {riskNeedsFlag && riskAttempted ? (
                        <Banner
                          status="error"
                          title="All four flags are Green. Set Q, C, D, or P to Amber or Red to report an active risk."
                        />
                      ) : (
                        <>
                          {hasActiveRisk ? (
                            <Banner
                              status="info"
                              title="Active risk detected: At least one of the 4 health flags (Q, C, D, P) must be Amber or Red."
                            />
                          ) : null}
                          {kpiOverNorm ? (
                            // The over-norm week is a fact that outlives the block, so the banner
                            // stays put once a pillar carries the flag — only its wording settles
                            // (no instruction left to give). While the week is still all-Green it
                            // instructs, and turns red once it has actually refused a submit, so
                            // the blocked click reads as a refusal and not a dead button — the
                            // same escalation the risk banner above makes.
                            <Banner
                              status={allGreenBlocked && submitAttempted ? 'error' : 'warning'}
                              title={
                                !allGreenBlocked
                                  ? 'KPIs are over norm this week.'
                                  : submitAttempted
                                    ? 'Report not submitted — KPIs are over norm this week. Set Q, C, D, or P to Amber or Red.'
                                    : 'KPIs are over norm this week. Set at least one of Q, C, D, or P to Amber or Red.'
                              }
                            />
                          ) : null}
                        </>
                      )}

                      {hasActiveRisk ? (
                        <>
                          <Textarea
                            ref={riskIssueRef}
                            label="Risk / Issue"
                            isRequired
                            value={riskIssue}
                            onChange={setRiskIssue}
                            placeholder="What's the issue (happened) or risk (may happen)?"
                            rows={3}
                            status={
                              riskIssueError
                                ? { type: 'error', message: riskIssueError }
                                : undefined
                            }
                          />

                          <div className="grid gap-4 md:grid-cols-3">
                            <div className="md:col-span-2">
                              <Textarea
                                ref={roadToGreenRef}
                                label="Road-to-Green action"
                                isRequired
                                value={roadToGreen}
                                onChange={setRoadToGreen}
                                placeholder="What brings it back to Green?"
                                rows={2}
                                status={
                                  roadToGreenError
                                    ? { type: 'error', message: roadToGreenError }
                                    : undefined
                                }
                              />
                            </div>
                            <div ref={dueRef}>
                              <DateInput
                                label="Due"
                                isRequired
                                width="100%"
                                min={dueFloor}
                                format={formatDueDate}
                                value={roadToGreenDue || undefined}
                                onChange={(v) => setRoadToGreenDue(v ?? '')}
                                placeholder="Select a date…"
                                status={dueError ? { type: 'error', message: dueError } : undefined}
                              />
                            </div>
                          </div>
                        </>
                      ) : null}
                    </section>
                  ) : null}
                </div>
              )}
            </LayoutContent>
          }
        />
      </Dialog>
      <AlertDialog
        isOpen={pendingExit !== null || pendingLeave !== null}
        onOpenChange={(open) => {
          if (open) return;
          setPendingExit(null);
          setPendingLeave(null);
        }}
        title={pendingLeave ? 'Discard this comment?' : 'Discard this report?'}
        description={
          pendingLeave
            ? 'What you have written has not been posted yet.'
            : 'What you have written for this week has not been submitted.'
        }
        cancelLabel="Keep editing"
        actionLabel="Discard"
        actionVariant="destructive"
        onAction={() => {
          if (pendingLeave) discardComment();
          else discardReport();
        }}
      />
    </>
  );
}
