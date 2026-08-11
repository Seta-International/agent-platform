import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { ArrowRight, CalendarDays } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
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
  Avatar,
  AvatarFallback,
  Badge,
  Banner,
  Button,
  Card,
  DateInput,
  Dialog,
  DialogHeader,
  DisabledActionTooltip,
  HStack,
  Input,
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
  formatBand,
  formatMetricValue,
  isoWeekBase,
  KPI_CATEGORIES,
  KPI_CATEGORY_LABELS,
} from './kpi-shared.tsx';
import { COMING_SOON_REASON, WEEKLY_REPORT_COMPOSER_COMING_SOON } from './pm-coming-soon.tsx';

// RAG wording: the stored value stays 'yellow' (API contract), the user reads "Amber".
type ColourKey = ReportColour | 'none';
const colourKey = (colour: ReportColour | null): ColourKey => colour ?? 'none';

const COLOUR_LABEL: Record<ColourKey, string> = {
  green: 'Green',
  yellow: 'Amber',
  red: 'Red',
  gray: 'Gray',
  none: 'Not assessed',
};

// RAG colour → Astryx status variant, same mapping as the list cards.
const COLOUR_VARIANT: Record<ColourKey, 'success' | 'warning' | 'error' | 'neutral'> = {
  green: 'success',
  yellow: 'warning',
  red: 'error',
  gray: 'neutral',
  none: 'neutral',
};

// Same ranking as the backend's worstColour — gray (N/A) dampens but never hides yellow/red.
const COLOUR_RANK: Record<ReportColour, number> = { green: 0, gray: 1, yellow: 2, red: 3 };

// Composer QCDP segmented — the selected cell wears its status as a soft wash. Astryx's own
// SegmentedControl paints a neutral thumb (no per-item colour), so the composer hand-builds the
// group with these Astryx status tokens (FUT-740).
const SEG_TINT: Record<'green' | 'yellow' | 'red', string> = {
  green: 'bg-success-muted text-success',
  yellow: 'bg-warning-muted text-warning',
  red: 'bg-error-muted text-error',
};
const SEG_COLOURS = ['green', 'yellow', 'red'] as const;
const QCDP_ORDER: KpiCategory[] = ['quality', 'delivery', 'cost_capacity', 'process'];

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

export function colourBadge(colour: ReportColour | null) {
  if (colour === null) {
    return (
      <Badge variant="secondary" className="font-normal">
        —
      </Badge>
    );
  }
  const variant =
    colour === 'green'
      ? 'success'
      : colour === 'yellow'
        ? 'warning'
        : colour === 'red'
          ? 'destructive'
          : 'secondary';
  return (
    <Badge variant={variant} className="font-normal" style={badgeStyle(colour)}>
      {COLOUR_LABEL[colour]}
    </Badge>
  );
}

const RAG_MARK_TOKEN: Record<ColourKey, { fill: string; on: string } | null> = {
  green: { fill: 'var(--rag-green)', on: 'var(--rag-on-green)' },
  yellow: { fill: 'var(--rag-amber)', on: 'var(--rag-on-amber)' },
  red: { fill: 'var(--rag-red)', on: 'var(--rag-on-red)' },
  gray: null,
  none: null,
};
const markStyle = (key: ColourKey) => {
  const token = RAG_MARK_TOKEN[key];
  return token ? { backgroundColor: token.fill } : undefined;
};
const badgeStyle = (key: ColourKey) => {
  const token = RAG_MARK_TOKEN[key];
  return token ? { backgroundColor: token.fill, color: token.on } : undefined;
};
const TREND_FILL: Record<ColourKey, string> = {
  green: 'var(--rag-green)',
  yellow: 'var(--rag-amber)',
  red: 'var(--rag-red)',
  gray: 'var(--color-background-gray)',
  none: 'var(--color-background-gray)',
};

function reporterRole(detail: WeeklyReportDetail, reporter_id: string): 'EM' | 'PMO' | null {
  if (reporter_id === detail.pm_person_id) return 'EM';
  if (reporter_id === detail.pmo_person_id) return 'PMO';
  return null;
}

function StatsLine({ detail }: { detail: WeeklyReportDetail }) {
  const navigate = useNavigate();
  const { worst, measured_count, applied_count, red_count, yellow_count } = detail.stats;
  const seatsShort = detail.team_size != null ? detail.team_size - detail.staffed : 0;

  const spread: string[] = [];
  if (measured_count === 0) spread.push('No figures entered this week');
  else if (red_count + yellow_count === 0) spread.push(`All ${measured_count} on norm`);
  else spread.push(`${red_count} red and ${yellow_count} amber of ${measured_count} measured`);
  if (measured_count > 0 && measured_count < applied_count) {
    spread.push(`${applied_count - measured_count} still blank`);
  }
  if (seatsShort > 0) spread.push(`${seatsShort} seat${seatsShort === 1 ? '' : 's'} short`);

  return (
    <div className="space-y-2">
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
      {applied_count > 0 ? (
        <Button
          variant="ghost"
          size="sm"
          className="-ml-3 gap-1.5 text-secondary"
          onClick={() =>
            void navigate({
              to: '/pm/metrics',
              search: {
                tab: 'explorer',
                project: detail.project_id,
                iso_year: detail.iso_year,
                iso_week: detail.iso_week,
              },
            })
          }
        >
          {`See all ${applied_count} metrics in KPI Explorer`}
          <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
        </Button>
      ) : null}
    </div>
  );
}

function ReportCard({
  detail,
  entry,
  onComment,
  commentPending,
}: {
  detail: WeeklyReportDetail;
  entry: WeeklyReportEntry;
  onComment: (report_id: string, body: string) => void;
  commentPending: boolean;
}) {
  const [commentBody, setCommentBody] = useState('');
  const role = reporterRole(detail, entry.reporter_id);
  // Keep the caret in the box after Enter — the refetch that appends the new comment
  // re-renders the card and would otherwise drop focus mid-conversation.
  const inputRef = useRef<HTMLInputElement | null>(null);
  const justSent = useRef(false);
  // The thread scrolls inside a capped box (input pinned below it) — otherwise every new
  // comment grows the card and shoves the input further down the dialog.
  const threadRef = useRef<HTMLDivElement | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies(entry.comments.length): the refocus + scroll-to-latest must fire when the refetched comment list lands — the length IS the signal, not a value the effect reads
  useEffect(() => {
    const thread = threadRef.current;
    if (thread) thread.scrollTop = thread.scrollHeight;
    if (!justSent.current) return;
    justSent.current = false;
    inputRef.current?.focus();
  }, [entry.comments.length]);
  const submit = () => {
    if (commentBody.trim() === '' || commentPending) return;
    onComment(entry.report_id, commentBody.trim());
    setCommentBody('');
    justSent.current = true;
    inputRef.current?.focus();
  };
  return (
    <Card padding={4} className="space-y-3">
      {/* The reporter's name is the card's identity — the only bold element up here. Section
          labels below drop to eyebrows so the written content stays the loudest thing. */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {role ? <Badge variant="secondary">{role}</Badge> : null}
          <span className="text-base font-semibold text-primary">
            {entry.reporter_name ?? 'Unknown'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-secondary">
            {new Date(entry.updated_at).toLocaleDateString()}
          </span>
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
            borderColor:
              RAG_MARK_TOKEN[colourKey(entry.overall_colour)]?.fill ?? 'var(--color-border)',
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
            <span className="whitespace-nowrap">{` · due ${entry.road_to_green_due}`}</span>
          ) : null}
        </div>
      ) : null}

      <div className="space-y-2 border-t border-border pt-3">
        {entry.comments.length > 0 ? (
          <div className="text-xs uppercase tracking-wide text-secondary">
            Comments ({entry.comments.length})
          </div>
        ) : null}
        {entry.comments.length > 0 ? (
          <div ref={threadRef} className="max-h-64 space-y-3 overflow-y-auto pr-1">
            {entry.comments.map((c) => (
              // Replies indent by one avatar column so the thread reads at a glance.
              <div key={c.id} className={`flex gap-2.5 ${c.parent_comment_id ? 'pl-9' : ''}`}>
                <Avatar className="mt-0.5 h-7 w-7">
                  <AvatarFallback className="bg-muted text-xs font-medium">
                    {initials(c.author_name)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="truncate text-xs font-medium text-primary">
                      {c.author_name ?? 'Unknown'}
                    </span>
                    <span className="shrink-0 text-xs text-secondary">
                      {commentWhen(c.created_at)}
                    </span>
                  </div>
                  <p className="text-base text-primary [overflow-wrap:anywhere]">{c.body}</p>
                </div>
              </div>
            ))}
          </div>
        ) : null}
        {entry.published ? (
          // Explicit Send button so posting never depends on the Enter key (Vietnamese IME can
          // swallow the submitting keydown behind `isComposing`); Enter stays as a shortcut.
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Input
                ref={inputRef}
                value={commentBody}
                width="100%"
                placeholder="Write a comment — Enter to submit"
                onChange={setCommentBody}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing) submit();
                }}
                className="bg-card"
              />
            </div>
            <Button
              variant="secondary"
              size="sm"
              isDisabled={commentBody.trim() === '' || commentPending}
              onClick={submit}
            >
              Send
            </Button>
          </div>
        ) : (
          <p className="text-xs text-secondary">Comments open once this report is submitted.</p>
        )}
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
  const composeOffered = Boolean(detail?.can_manage && detail.week_editable && !alreadyReported);
  const composeBlocked = notReporter || WEEKLY_REPORT_COMPOSER_COMING_SOON;
  const canCompose = composeOffered && !composeBlocked;

  const [summary, setSummary] = useState('');
  const [riskIssue, setRiskIssue] = useState('');
  const [roadToGreen, setRoadToGreen] = useState('');
  const [roadToGreenDue, setRoadToGreenDue] = useState('');
  const [hasActiveRisk, setHasActiveRisk] = useState(false);
  // The reporter's declared QCDP colours — prefilled from this week's effective colours
  // (computed, or an earlier override) once the composer opens with data.
  const [colours, setColours] = useState<Partial<Record<KpiCategory, ReportColour>>>({});
  const prefilled = useRef(false);

  // Submit is always clickable now (only the pending save disables it). Clicking with gaps
  // reveals inline field errors and scrolls to the first one, instead of a dead grey button
  // that never says what's missing (FUT-740). Errors surface only after the first submit
  // attempt, then clear live as each field is filled. Refs let the click scroll + focus the
  // first offending control.
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const summaryRef = useRef<HTMLTextAreaElement>(null);
  const riskIssueRef = useRef<HTMLTextAreaElement>(null);
  const roadToGreenRef = useRef<HTMLTextAreaElement>(null);
  const dueRef = useRef<HTMLInputElement>(null);
  const pillarsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!formOpen || !detail || prefilled.current) return;
    prefilled.current = true;
    const declared: Partial<Record<KpiCategory, ReportColour>> = {};
    for (const f of detail.flags) {
      declared[f.category] =
        f.final_colour === 'yellow' || f.final_colour === 'red' ? f.final_colour : 'green';
    }
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
  const dueMissing = hasActiveRisk && roadToGreenDue === '';
  const summaryError =
    submitAttempted && summaryMissing ? 'Add an executive summary before submitting.' : undefined;
  const riskIssueError =
    submitAttempted && riskIssueMissing
      ? 'Describe the risk or issue before submitting.'
      : undefined;
  const roadToGreenError =
    submitAttempted && roadToGreenMissing
      ? 'A Road-to-Green action is required while a risk is active.'
      : undefined;
  const dueError =
    submitAttempted && dueMissing ? 'Set a due date for the Road-to-Green action.' : undefined;

  const handleSubmit = () => {
    setSubmitAttempted(true);
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
      if (target !== pillarsRef) target.current?.focus();
      return;
    }
    save.mutate();
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
  // The composer carries a Project field that both names and switches the project. When it's
  // present the header subtitle drops the project (it would repeat the field) and keeps only
  // the week; without the switcher the subtitle stays the sole place the project is named.
  const showProjectSwitcher = Boolean(
    projectOptions && projectOptions.length > 0 && onProjectChange,
  );
  const headerSubtitle = detail
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

  return (
    <Dialog
      isOpen
      onOpenChange={onOpenChange}
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
            subtitle={
              composing && detail
                ? // The week now rides in the title. Project lives in the body switcher when it's
                  // shown, so nothing is left for the subtitle; otherwise it names the project.
                  showProjectSwitcher
                  ? undefined
                  : detail.project_name
                : headerSubtitle
            }
            endContent={
              detail ? (
                <span className="flex items-center gap-2">
                  <span className="text-xs uppercase tracking-wide text-secondary">Overall</span>
                  {colourBadge(composing ? declaredOverall : detail.overall_colour)}
                </span>
              ) : undefined
            }
            onOpenChange={onOpenChange}
          />
        }
        footer={
          detail ? (
            <LayoutFooter hasDivider>
              <HStack gap={2} hAlign="end">
                {composing ? (
                  <>
                    <Button variant="ghost" label="Cancel" onClick={() => setFormOpen(false)} />
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
                    <Button variant="secondary" label="Close" onClick={() => onOpenChange(false)} />
                    {seatsShort > 0 && detail.can_manage ? (
                      // A backfill answers this week's seat shortage — a past (locked) week is
                      // read-only, so composing one there would act on stale numbers. The week
                      // also closes on Friday at 17:00, so the reason names both gates rather
                      // than telling a reader on the current week that it is not the current one.
                      <DisabledActionTooltip
                        disabled={!detail.week_editable}
                        reason="Backfills can only be raised for the current week, until Friday 5:00 PM."
                      >
                        <Button
                          variant="primary"
                          label={`Raise backfill (${seatsShort} seat${seatsShort === 1 ? '' : 's'})`}
                          isDisabled={!detail.week_editable}
                          onClick={() => {
                            onOpenChange(false);
                            void navigate({
                              to: '/pm/resourcing',
                              search: { project: project_id },
                            });
                          }}
                        />
                      </DisabledActionTooltip>
                    ) : null}
                  </>
                )}
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
                            <span className={off ? 'font-semibold text-primary' : 'text-secondary'}>
                              {name}
                            </span>
                          </span>
                        );
                      })}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs uppercase tracking-wide text-secondary">Trend</span>
                      <span className="flex gap-px overflow-hidden rounded-sm">
                        {[...detail.trend].reverse().map((t, i, arr) => (
                          <span
                            key={`${t.iso_year}-${t.iso_week}`}
                            className="inline-block h-2.5 w-4"
                            style={{ backgroundColor: TREND_FILL[colourKey(t.colour)] }}
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
                        disabled={composeBlocked}
                        reason={
                          WEEKLY_REPORT_COMPOSER_COMING_SOON
                            ? COMING_SOON_REASON
                            : NOT_REPORTER_REASON
                        }
                        className="mt-3"
                      >
                        <Button
                          variant="secondary"
                          size="sm"
                          className={composeBlocked ? undefined : 'mt-3'}
                          isDisabled={composeBlocked}
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
                      detail={detail}
                      entry={r}
                      onComment={(report_id, body) => comment.mutate({ report_id, body })}
                      commentPending={comment.isPending}
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
                            if (v && v !== project_id) onProjectChange?.(v);
                          }}
                        />
                      </div>
                    ) : null}

                    <div ref={pillarsRef} className="space-y-2">
                      <div className="text-xs uppercase tracking-wide text-secondary">
                        QCDP pillars
                      </div>
                      <div className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-4">
                        {QCDP_ORDER.map((cat) => {
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
                                      } ${on ? `${SEG_TINT[sc]} font-semibold` : 'bg-card text-secondary hover:bg-muted'}`}
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
                        onChange={(v) => setHasActiveRisk(v)}
                      />
                    </div>

                    {riskNeedsFlag && submitAttempted ? (
                      <Banner
                        status="error"
                        title="All four flags are Green. Set Q, D, C, or P to Amber or Red to report an active risk."
                      />
                    ) : (
                      <>
                        {hasActiveRisk ? (
                          <Banner
                            status="info"
                            title="Active risk detected: At least one of the 4 health flags (Q, D, C, P) must be Amber or Red."
                          />
                        ) : null}
                        {allGreenBlocked ? (
                          <Banner
                            status="warning"
                            title="KPIs are over norm this week. Set at least one of Q, D, C, or P to Amber or Red."
                          />
                        ) : null}
                      </>
                    )}

                    <div className={hasActiveRisk ? 'grid gap-4 md:grid-cols-2' : undefined}>
                      <Textarea
                        ref={summaryRef}
                        label="Executive summary"
                        isRequired
                        value={summary}
                        onChange={setSummary}
                        placeholder="Overall health + key deviation…"
                        rows={3}
                        status={summaryError ? { type: 'error', message: summaryError } : undefined}
                      />
                      {hasActiveRisk ? (
                        <Textarea
                          ref={riskIssueRef}
                          label="Risk / Issue"
                          isRequired
                          value={riskIssue}
                          onChange={setRiskIssue}
                          placeholder="Issue (happened) / Risk (may happen)…"
                          rows={3}
                          status={
                            riskIssueError ? { type: 'error', message: riskIssueError } : undefined
                          }
                        />
                      ) : null}
                    </div>

                    {hasActiveRisk ? (
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
                        <DateInput
                          ref={dueRef}
                          label="Due"
                          isRequired
                          value={roadToGreenDue || undefined}
                          min={new Date().toISOString().slice(0, 10)}
                          onChange={(v) => setRoadToGreenDue(v ?? '')}
                          status={dueError ? { type: 'error', message: dueError } : undefined}
                        />
                      </div>
                    ) : null}
                  </section>
                ) : null}
              </div>
            )}
          </LayoutContent>
        }
      />
    </Dialog>
  );
}
