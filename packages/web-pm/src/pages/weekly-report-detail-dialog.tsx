import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { CalendarDays } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  addWeeklyReportComment,
  ensureWeeklyReport,
  fetchWeeklyReportDetail,
  type KpiCategory,
  type RagStatus,
  type ReportColour,
  upsertWeeklyReport,
  type WeeklyReportDetail,
  type WeeklyReportEntry,
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
  Avatar,
  AvatarFallback,
  Badge,
  Button,
  Combobox,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Textarea,
  toast,
} from './_ui-compat.tsx';
import { formatMetricValue, KPI_CATEGORIES, KPI_CATEGORY_LABELS } from './kpi-shared.tsx';

const COLOUR_LABEL: Record<ReportColour, string> = {
  green: 'Green',
  yellow: 'Yellow',
  red: 'Red',
  gray: 'Gray',
};

// Same ranking as the backend's worstColour — gray (N/A) dampens but never hides yellow/red.
const COLOUR_RANK: Record<ReportColour, number> = { green: 0, gray: 1, yellow: 2, red: 3 };

// The composer's QCDP dropdown triggers take the colour they announce, like the mock's
// red-on-red selects.
const SELECT_COLOUR_CLASS: Record<ReportColour, string> = {
  green: 'border-semantic-success text-success',
  yellow: 'border-warning text-warning',
  red: 'border-error text-error',
  gray: 'border-hairline text-secondary',
};

const CATEGORY_LETTER: Record<KpiCategory, string> = {
  quality: 'Q',
  cost_capacity: 'C',
  delivery: 'D',
  process: 'P',
};

const PRICING_LABEL: Record<string, string> = {
  fixed_price: 'Fixed-price',
  time_materials: 'T&M',
};

function weekLabel(iso_year: number, iso_week: number): string {
  return `${iso_year}-W-${String(iso_week).padStart(2, '0')}`;
}

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
    <Badge variant={variant} className="font-normal">
      {COLOUR_LABEL[colour]}
    </Badge>
  );
}

export function colourDotClass(colour: ReportColour): string {
  const bg =
    colour === 'green'
      ? 'bg-success'
      : colour === 'yellow'
        ? 'bg-warning'
        : colour === 'red'
          ? 'bg-error'
          : 'bg-ink-faint';
  return `inline-block size-2.5 rounded-full ${bg}`;
}

function trendSquareClass(colour: ReportColour): string {
  const bg =
    colour === 'green'
      ? 'bg-success'
      : colour === 'yellow'
        ? 'bg-warning'
        : colour === 'red'
          ? 'bg-error'
          : 'bg-ink-faint';
  return `inline-block size-5 rounded-md ${bg}`;
}

function reporterRole(detail: WeeklyReportDetail, reporter_id: string): 'PM' | 'PMO' | null {
  if (reporter_id === detail.pm_person_id) return 'PM';
  if (reporter_id === detail.pmo_person_id) return 'PMO';
  return null;
}

// Mock's headline line: "Staffed 5/7 · util 102% · predictability 40% · CSS 3.60" — each
// metric value is coloured by its own RAG status; unmeasured metrics simply don't appear.
function StatsLine({ detail }: { detail: WeeklyReportDetail }) {
  const short = detail.team_size != null && detail.staffed < detail.team_size;
  const statusClass = (status: RagStatus | null) =>
    status === 'red'
      ? 'text-error'
      : status === 'yellow'
        ? 'text-warning'
        : status === 'green'
          ? 'text-success'
          : 'text-primary';
  return (
    <p className="text-sm text-secondary">
      {detail.team_size != null ? (
        <>
          Staffed{' '}
          <span className={`font-semibold ${short ? 'text-error' : 'text-primary'}`}>
            {detail.staffed}/{detail.team_size}
          </span>
        </>
      ) : null}
      {detail.headline_metrics.map((m) => (
        <span key={m.label}>
          {' · '}
          {m.label}{' '}
          <span className={`font-semibold ${statusClass(m.status)}`}>
            {formatMetricValue(m.computed_value, m.name, m.component_count)}
          </span>
        </span>
      ))}
    </p>
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
  const [draft, setDraft] = useState('');
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
    if (draft.trim() === '' || commentPending) return;
    onComment(entry.report_id, draft.trim());
    setDraft('');
    justSent.current = true;
    inputRef.current?.focus();
  };
  return (
    <div className="space-y-3 rounded-lg bg-surface-1 p-4">
      {/* The reporter's name is the card's identity — the only bold element up here. Section
          labels below drop to eyebrows so the written content stays the loudest thing. */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {role ? <Badge variant={role === 'PM' ? 'success' : 'secondary'}>{role}</Badge> : null}
          <span className="font-semibold text-primary">{entry.reporter_name ?? 'Unknown'}</span>
          {entry.status === 'draft' ? (
            // Only the author ever sees a draft (server substitutes the last published
            // revision for everyone else) — say which situation this is.
            <Badge variant="secondary" className="font-normal">
              {entry.published ? 'Draft — others see your last submitted version' : 'Draft'}
            </Badge>
          ) : null}
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
          <p className="text-sm text-primary">{entry.executive_summary}</p>
        </div>
      ) : null}
      {entry.risk_issue ? (
        <div className="space-y-0.5">
          <div className="text-xs uppercase tracking-wide text-secondary">Risk / Issue</div>
          <p className="text-sm text-primary">{entry.risk_issue}</p>
        </div>
      ) : null}
      {entry.road_to_green ? (
        <div className="rounded-md bg-warning-muted px-3 py-2 text-sm">
          <span className="font-semibold text-warning">Road to Green:</span>{' '}
          <span className="text-primary">{entry.road_to_green}</span>
          {entry.road_to_green_owner_name ? (
            <>
              {' · '}
              <span className="font-semibold text-primary">{entry.road_to_green_owner_name}</span>
            </>
          ) : null}
          {entry.road_to_green_due ? ` · due ${entry.road_to_green_due}` : ''}
        </div>
      ) : null}

      <div className="space-y-2 border-t border-hairline pt-3">
        <div className="text-xs uppercase tracking-wide text-secondary">
          Comments{entry.comments.length > 0 ? ` (${entry.comments.length})` : ''}
        </div>
        {entry.comments.length > 0 ? (
          <div ref={threadRef} className="max-h-64 space-y-3 overflow-y-auto pr-1">
            {entry.comments.map((c) => (
              // Replies indent by one avatar column so the thread reads at a glance.
              <div key={c.id} className={`flex gap-2.5 ${c.parent_comment_id ? 'pl-9' : ''}`}>
                <Avatar className="mt-0.5 h-7 w-7">
                  <AvatarFallback className="bg-surface-3 text-[10px] font-medium">
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
                  <p className="text-sm text-primary [overflow-wrap:anywhere]">{c.body}</p>
                </div>
              </div>
            ))}
          </div>
        ) : null}
        {entry.published ? (
          <Input
            ref={inputRef}
            value={draft}
            placeholder="Write a comment — Enter to send"
            onChange={setDraft}
            onKeyDown={(e) => {
              // IME (Vietnamese Telex/VNI…) fires an extra Enter keydown while composing —
              // submitting on it double-posts the comment once the composition commits.
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) submit();
            }}
            className="bg-canvas"
          />
        ) : (
          <p className="text-xs text-secondary">Comments open once this report is submitted.</p>
        )}
      </div>
    </div>
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

  // Same composer creates and updates: while the week is open (Epic 3 lock) the reporter can
  // keep adjusting QCDP and text; an existing report prefills the form and the save carries
  // its version so a concurrent edit conflicts instead of silently overwriting.
  const myReport = detail?.reports.find((r) => r.reporter_id === detail.my_reporter_id) ?? null;
  // Product rule (2026-07-16): the first comment freezes the report — the version people
  // discussed can never change under them. Server enforces; the UI explains.
  const lockedByComments = (myReport?.comments.length ?? 0) > 0;

  // FUT-591 AC1 (draft-on-entry): opening the composer ensures exactly one draft of the
  // caller exists for this (Project, Week) — idempotent, so re-opens are no-ops. The
  // `ensured` ref (not the dep list) guarantees a single call per dialog mount.
  const ensured = useRef(false);
  useEffect(() => {
    if (ensured.current || !formOpen || project_id === null || !detail) return;
    if (!detail.can_manage || !detail.week_editable) return;
    ensured.current = true;
    ensureWeeklyReport({ project_id, iso_year, iso_week })
      .then(() => invalidate())
      .catch(() => {
        // Refusals (no person link, race with the week closing) surface on save — the
        // composer itself stays usable.
      });
  });
  const [summary, setSummary] = useState('');
  const [riskIssue, setRiskIssue] = useState('');
  const [roadToGreen, setRoadToGreen] = useState('');
  const [roadToGreenDue, setRoadToGreenDue] = useState('');
  // The reporter's declared QCDP colours — prefilled from this week's effective colours
  // (computed, or an earlier override) once the composer opens with data.
  const [colours, setColours] = useState<Partial<Record<KpiCategory, ReportColour>>>({});
  const prefilled = useRef(false);
  useEffect(() => {
    if (!formOpen || !detail || prefilled.current) return;
    prefilled.current = true;
    setColours(Object.fromEntries(detail.flags.map((f) => [f.category, f.final_colour])));
    if (myReport) {
      setSummary(myReport.executive_summary ?? '');
      setRiskIssue(myReport.risk_issue ?? '');
      setRoadToGreen(myReport.road_to_green ?? '');
      setRoadToGreenDue(myReport.road_to_green_due ?? '');
    }
  }, [formOpen, detail, myReport]);

  const save = useMutation({
    // The composer only renders once a project is chosen — the cast documents that.
    mutationFn: (mode: 'draft' | 'submit') =>
      upsertWeeklyReport({
        project_id: project_id as string,
        iso_year,
        iso_week,
        expected_version: myReport?.version,
        save_mode: mode,
        executive_summary: summary.trim(),
        risk_issue: riskIssue.trim() || null,
        road_to_green: roadToGreen.trim() || null,
        road_to_green_due: roadToGreenDue || null,
        category_colours: colours,
      }),
    onSuccess: (_data, mode) => {
      if (mode === 'draft') {
        toast.success(
          myReport?.published
            ? 'Draft saved — everyone else keeps seeing your last submitted version.'
            : 'Draft saved — not visible to others until you submit.',
        );
      } else {
        toast.success(myReport?.published ? 'Report updated' : 'Report submitted');
      }
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
    ? KPI_CATEGORIES.reduce<ReportColour>((worst, c) => {
        const colour =
          colours[c] ?? detail.flags.find((f) => f.category === c)?.final_colour ?? 'red';
        return COLOUR_RANK[colour] > COLOUR_RANK[worst] ? colour : worst;
      }, 'green')
    : null;
  const nonGreen = declaredOverall !== null && declaredOverall !== 'green';
  // Epic 3: a week with any measured KPI over norm cannot be declared all-Green.
  const kpiOverNorm =
    detail !== undefined && (detail.stats.yellow_count > 0 || detail.stats.red_count > 0);
  const allGreenBlocked = kpiOverNorm && declaredOverall === 'green';
  const pricing = detail?.pricing_model ? (PRICING_LABEL[detail.pricing_model] ?? null) : null;
  const seatsShort =
    detail?.team_size != null && detail.team_size > detail.staffed
      ? detail.team_size - detail.staffed
      : 0;

  // FUT-589 AC1: no project context yet — block on an explicit prompt. Choosing a project
  // hands off to onProjectChange, which remounts this dialog under the chosen context.
  if (project_id === null) {
    return (
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New weekly report</DialogTitle>
            <p className="text-sm text-secondary">
              Every report is pinned to a Project + Week. Pick the project to continue — week{' '}
              {weekLabel(iso_year, iso_week)}.
            </p>
          </DialogHeader>
          <Combobox
            options={projectOptions ?? []}
            value=""
            onChange={(v) => {
              if (v) onProjectChange?.(v);
            }}
            placeholder="Pick a project…"
          />
          <DialogFooter>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      {/* Three fixed bands (header / scrolling body / footer) — the action buttons never
          scroll away, and opening a panel scrolls the body down to it. */}
      <DialogContent className="max-w-3xl grid-rows-[auto_minmax(0,1fr)_auto] max-h-[85vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle>
            {detail ? `${detail.project_name} · ${weekLabel(iso_year, iso_week)}` : 'Weekly report'}
          </DialogTitle>
          {detail ? (
            <p className="text-sm text-secondary">
              {detail.account_name}
              {detail.pm_name ? ` · PM ${detail.pm_name}` : ''}
              {detail.pmo_name ? ` · PMO ${detail.pmo_name}` : ''}
              {` · ${detail.phase.charAt(0).toUpperCase()}${detail.phase.slice(1)}`}
            </p>
          ) : null}
        </DialogHeader>

        {detailQuery.isError ? (
          // Refusals are expected here (FUT-590: not assigned to this project in that week) —
          // surface the server's reason instead of skeletons that never resolve.
          <div className="min-h-0 overflow-y-auto">
            <p className="rounded-lg bg-surface-1 px-3 py-8 text-center text-sm text-secondary">
              {(detailQuery.error as Error).message ||
                'This report could not be loaded — you may not have access to this week.'}
            </p>
          </div>
        ) : detailQuery.isLoading || !detail ? (
          <div className="min-h-0 space-y-2 overflow-y-auto">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : (
          <div className="min-h-0 space-y-4 overflow-y-auto pr-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-2">{colourBadge(detail.overall_colour)}</span>
              {detail.flags.map((f) => (
                <span
                  key={f.category}
                  className="flex items-center gap-1.5 rounded-md border border-hairline px-2.5 py-1 text-sm font-medium text-primary"
                  title={`${KPI_CATEGORY_LABELS[f.category]}: ${COLOUR_LABEL[f.final_colour]}`}
                >
                  <span className={colourDotClass(f.final_colour)} />
                  {CATEGORY_LETTER[f.category]}
                </span>
              ))}
              {pricing ? (
                <Badge variant="secondary" className="font-normal">
                  {pricing}
                </Badge>
              ) : null}
              <div className="ml-auto flex items-center gap-1.5">
                <span className="text-xs text-secondary">Trend</span>
                {[...detail.trend].reverse().map((t, i, arr) => (
                  <span
                    key={`${t.iso_year}-${t.iso_week}`}
                    // The last square is the week being viewed — a hairline ring marks
                    // "you are here" without adding a label.
                    className={`${trendSquareClass(t.colour)}${
                      i === arr.length - 1 ? ' ring-2 ring-ink/25 ring-offset-1' : ''
                    }`}
                    title={`${weekLabel(t.iso_year, t.iso_week)}: ${COLOUR_LABEL[t.colour]}${
                      i === arr.length - 1 ? ' (this week)' : ''
                    }`}
                  />
                ))}
              </div>
            </div>

            <StatsLine detail={detail} />

            {/* Composing is a focused view (mock: the submit modal is just the form) — the
                submitted reports and their comment threads only render in the read view.
                Exception: a comment-locked report can't compose, so its thread stays
                visible for the "reply instead" path. */}
            {formOpen && !lockedByComments ? null : detail.reports.length === 0 ? (
              // Empty state is an invitation to act: a reporter who can still write this
              // week's report gets the composer one click away, right where the gap is.
              // Quieter than the shared EmptyState on purpose — inside a dialog the empty
              // slot is a hint, not a hero: caption-scale type and a hairline button.
              <div className="flex flex-col items-center rounded-lg bg-surface-1 px-3 py-8 text-center">
                <CalendarDays className="mb-2 h-5 w-5 text-secondary" strokeWidth={1.5} />
                <p className="text-sm font-medium text-primary">No reports yet</p>
                <p className="mt-0.5 text-xs text-secondary">
                  {detail.can_manage && detail.week_editable
                    ? `Reports for ${weekLabel(iso_year, iso_week)} stay open until Friday 5:00 PM.`
                    : `No one submitted a report for ${weekLabel(iso_year, iso_week)}.`}
                </p>
                {detail.can_manage && detail.week_editable ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="mt-3"
                    onClick={() => setFormOpen(true)}
                  >
                    New weekly report
                  </Button>
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
              <p className="rounded-lg bg-surface-1 px-3 py-4 text-center text-sm text-secondary">
                {weekLabel(iso_year, iso_week)} is locked — reports cover the current week only and
                close at Friday 5:00 PM.
              </p>
            ) : null}

            {formOpen && detail.can_manage && detail.week_editable && lockedByComments ? (
              <p className="rounded-lg bg-surface-1 px-3 py-4 text-center text-sm text-secondary">
                This report has comments and is locked — the version people discussed cannot change.
                Reply in the thread above instead.
              </p>
            ) : null}

            {formOpen && detail.can_manage && detail.week_editable && !lockedByComments ? (
              // The composer mirrors the read card's anatomy (same container, same section
              // order, Road-to-Green already inside its amber box) — you fill in the exact
              // card everyone else will see.
              <section className="space-y-4 rounded-lg bg-surface-1 p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {(() => {
                      const role = detail.my_reporter_id
                        ? reporterRole(detail, detail.my_reporter_id)
                        : null;
                      return role ? (
                        <Badge variant={role === 'PM' ? 'success' : 'secondary'}>{role}</Badge>
                      ) : null;
                    })()}
                    <h3 className="text-base font-semibold text-primary">
                      {myReport?.status === 'submitted'
                        ? 'Update weekly report'
                        : 'New weekly report'}
                    </h3>
                    {myReport?.status === 'draft' ? (
                      <Badge variant="secondary" className="font-normal">
                        Draft — not in roll-up
                      </Badge>
                    ) : null}
                  </div>
                </div>

                {/* Mock's PROJECT dropdown — switch which project this report is for without
                    leaving the composer. Only the caller's manageable projects are offered. */}
                {projectOptions && projectOptions.length > 0 && onProjectChange ? (
                  <div className="space-y-1">
                    <div className="text-xs uppercase tracking-wide text-secondary">Project</div>
                    <Combobox
                      options={projectOptions}
                      value={project_id}
                      onChange={(v) => {
                        if (v && v !== project_id) onProjectChange(v);
                      }}
                      className="w-80 bg-canvas"
                    />
                  </div>
                ) : null}

                {/* Mock: the reporter sets each QCDP pillar; the computed colour is only the
                    prefill. Overall below recomputes live as the worst of the four. */}
                <div className="grid grid-cols-2 gap-x-8 gap-y-3">
                  {KPI_CATEGORIES.map((cat) => {
                    const value = colours[cat] ?? 'red';
                    return (
                      <div key={cat} className="space-y-1">
                        <div className="text-xs uppercase tracking-wide text-secondary">
                          {KPI_CATEGORY_LABELS[cat].split(' ')[0]}
                        </div>
                        <Select
                          value={value}
                          onValueChange={(v) =>
                            setColours((prev) => ({ ...prev, [cat]: v as ReportColour }))
                          }
                        >
                          <SelectTrigger
                            className={`w-40 bg-canvas font-medium ${SELECT_COLOUR_CLASS[value]}`}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {(['green', 'yellow', 'red', 'gray'] as const).map((c) => (
                              <SelectItem key={c} value={c}>
                                <span className="flex items-center gap-2">
                                  <span className={colourDotClass(c)} />
                                  {COLOUR_LABEL[c]}
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    );
                  })}
                </div>

                <div className="space-y-1">
                  <div className="text-xs uppercase tracking-wide text-secondary">
                    Overall status · auto from QCDP (worst)
                  </div>
                  <div className="flex items-center gap-2 rounded-md bg-canvas px-3 py-2.5">
                    {colourBadge(declaredOverall)}
                    <span className="text-sm text-secondary">= worst of the four</span>
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="text-xs uppercase tracking-wide text-secondary">
                    Executive summary
                  </div>
                  <Textarea
                    value={summary}
                    onChange={setSummary}
                    placeholder="Overall health + key deviation…"
                    rows={3}
                    className="bg-canvas"
                  />
                </div>

                <div className="space-y-1">
                  <div className="text-xs uppercase tracking-wide text-secondary">Risk / Issue</div>
                  <Textarea
                    value={riskIssue}
                    onChange={setRiskIssue}
                    placeholder="Issue (đã xảy ra) / Risk (chưa xảy ra)…"
                    rows={2}
                    className="bg-canvas"
                  />
                </div>

                {/* A Green week has nothing to recover from — the whole Road-to-Green block
                    only exists when health is not Green. */}
                {nonGreen ? (
                  <>
                    <p className="rounded-md bg-warning-muted px-3 py-2 text-sm">
                      <span className="font-semibold text-warning">Non-Green</span>
                      <span className="text-primary">
                        {' '}
                        — road-to-green is mandatory and becomes a tracked Recovery action.
                      </span>
                    </p>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="col-span-2 space-y-1">
                        <div className="text-xs uppercase tracking-wide text-secondary">
                          Road-to-Green action
                        </div>
                        <Textarea
                          value={roadToGreen}
                          onChange={setRoadToGreen}
                          placeholder="What will bring it back to Green?"
                          rows={2}
                          className="bg-canvas"
                        />
                      </div>
                      <div className="space-y-1">
                        <div className="text-xs uppercase tracking-wide text-secondary">Due</div>
                        <Input
                          type="date"
                          value={roadToGreenDue}
                          onChange={setRoadToGreenDue}
                          // A recovery deadline can only be in the future.
                          min={new Date().toISOString().slice(0, 10)}
                          className="bg-canvas"
                        />
                      </div>
                    </div>
                  </>
                ) : null}

                {allGreenBlocked ? (
                  <p className="rounded-md bg-warning-muted px-3 py-2 text-sm">
                    <span className="font-semibold text-warning">KPIs over norm</span>
                    <span className="text-primary">
                      {' '}
                      — this week has Yellow/Red KPI results, so at least one flag must be
                      non-Green.
                    </span>
                  </p>
                ) : null}

                {/* A gate-blocked edit can still be kept privately: the published version
                    stays visible to everyone else until a valid re-submit replaces it. */}
                {myReport?.published &&
                (summary.trim() === '' ||
                  allGreenBlocked ||
                  (nonGreen && (roadToGreen.trim() === '' || roadToGreenDue === ''))) ? (
                  <p className="rounded-md bg-warning-muted px-3 py-2 text-sm text-primary">
                    Submitting is blocked by the checks above — <b>Save draft</b> keeps your changes
                    privately; everyone else continues to see your last submitted version.
                  </p>
                ) : null}
              </section>
            ) : null}
          </div>
        )}

        {/* Fixed footer, per view: composing pins Cancel + Submit report; reading ends in
            Close + "Raise backfill (N seat)" (only when the week is short-staffed, handing
            off to RA Monitoring filtered to this project). */}
        {detail && formOpen && detail.can_manage && detail.week_editable && !lockedByComments ? (
          <DialogFooter className="gap-2 border-t border-hairline pt-4">
            <Button variant="ghost" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            {/* Draft lifecycle (FUT-591/601): save anything without the gate; a draft save
                over a submitted report demotes it out of the roll-up. */}
            <Button
              variant="secondary"
              onClick={() => save.mutate('draft')}
              disabled={save.isPending}
            >
              Save draft
            </Button>
            <Button
              onClick={() => save.mutate('submit')}
              disabled={
                save.isPending ||
                summary.trim() === '' ||
                allGreenBlocked ||
                (nonGreen && (roadToGreen.trim() === '' || roadToGreenDue === '')) ||
                (roadToGreen.trim() !== '' && roadToGreenDue === '')
              }
            >
              Submit report
            </Button>
          </DialogFooter>
        ) : null}
        {detail && !(formOpen && detail.can_manage && detail.week_editable && !lockedByComments) ? (
          <DialogFooter className="gap-2 border-t border-hairline pt-4">
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            {seatsShort > 0 && detail.can_manage ? (
              <Button
                onClick={() => {
                  onOpenChange(false);
                  void navigate({ to: '/pm/resourcing', search: { project: project_id } });
                }}
              >
                Raise backfill ({seatsShort} seat{seatsShort === 1 ? '' : 's'})
              </Button>
            ) : null}
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
