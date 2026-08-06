import {
  AlertDialog,
  Badge,
  Banner,
  Button,
  DateInput,
  DialogFooter,
  DialogHeader,
  DisabledActionTooltip,
  Divider,
  DropdownMenu,
  DropdownMenuItem,
  EmptyState,
  Field,
  Grid,
  Input,
  NumberInput,
  ProgressBar,
  RichTextDisplay,
  RichTextEditor,
  Selector,
  Tab,
  TabList,
  Text,
  useToast,
  VStack,
} from '@seta/shared-ui';
import { usePermission } from '@seta/web-identity';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MoreHorizontal, Pencil, Share2 } from 'lucide-react';
import { type CSSProperties, useId, useRef, useState } from 'react';
import {
  type ApplicantRow,
  addOpening,
  closeOpening,
  editRequisition,
  fetchAccounts,
  fetchProjects,
  holdRequisition,
  type JdSectionKey,
  type JdVariant,
  type ReqStatus,
  resumeRequisition,
  setRequisitionJd,
  setRequisitionSkills,
} from '../api/hiring-client.ts';
import { GRADES } from '../lib/grades.ts';
import { PERMISSION_DENIED } from '../lib/permission-messages.ts';
import { hiringKeys } from '../state/query-keys.ts';
import { CancelRequisitionDialog } from './cancel-requisition-dialog.tsx';
import { CandidateDetailDrawer } from './candidate-detail-drawer.tsx';
import { DetailRow } from './detail-row.tsx';
import { GroupLabel } from './form-group-label.tsx';
import { MarkFilledDialog } from './mark-filled-dialog.tsx';
import { daysLeft, formatDate, isRichTextEmpty, STATUS_LABEL } from './requisition-format.ts';
import { type PickedSkill, SkillPicker } from './skill-picker.tsx';
import { on409, useRequisition } from './utils.ts';

// Skill proficiency: requisition_skill.min_level is 1–5; render a word like the design.
const LEVEL_LABEL: Record<number, string> = {
  1: 'Basic',
  2: 'Intermediate',
  3: 'Advanced',
  4: 'Expert',
  5: 'Master',
};

// Requisition titles are usually stored as "Role — Client". The header mirrors the candidate
// drawer's name + seniority shape, so split the client off into the subtitle instead of repeating
// it across the title, the subtitle and the Client fact. If the client isn't baked into the title,
// surface it as the subtitle anyway; if there's no client at all, the title stands alone.
function splitReqTitle(fullTitle: string, client?: string): { role: string; subtitle?: string } {
  if (!client) return { role: fullTitle };
  for (const sep of [' — ', ' – ', ' - ']) {
    const suffix = sep + client;
    if (fullTitle.endsWith(suffix)) {
      const role = fullTitle.slice(0, -suffix.length).trim();
      if (role) return { role, subtitle: client };
    }
  }
  return { role: fullTitle, subtitle: client };
}

// The requisition detail renders its own DialogHeader/DialogFooter as plain children (not through
// a Layout header/footer slot), so it can't inherit slot padding. When mounted in the modal it
// sits under a full-bleed `<Layout padding={0}>`, which zeroes both `--layout-padding-outer-*` (the
// dialog-edge sides) and `--layout-padding-inner-y` (the content-facing edges: header bottom, footer
// top). Left unset, the header/footer would sit flush against the dialog edges AND their labels/
// actions would touch the body and the divider. Restore all three so the bars breathe exactly like
// the candidate drawer (which gets these from a normally-padded Layout) in both modal and page route.
const HEADER_FOOTER_PADDING: CSSProperties = {
  '--layout-padding-outer-x': 'var(--spacing-6)',
  '--layout-padding-outer-y': 'var(--spacing-4)',
  '--layout-padding-inner-y': 'var(--spacing-4)',
} as CSSProperties;

const SECTIONS: { key: JdSectionKey; label: string }[] = [
  { key: 'about', label: 'About the role' },
  { key: 'responsibilities', label: 'Responsibilities' },
  { key: 'requirements', label: 'Requirements' },
  { key: 'nice_to_have', label: 'Nice to have' },
];

// application.stage badge colors on the applicants list — kept within the existing
// success/primary/warning/neutral token set (no new accent color).
const APPLICANT_STAGE_BADGE: Record<string, string> = {
  new: 'bg-success-muted text-success',
  screening: 'bg-surface text-secondary',
  interview: 'bg-accent-bg/12 text-accent',
  offer: 'bg-warning-muted text-warning',
};

// Applicant-stage labels — kept identical to the candidate board/detail (New / Screening /
// Interview / Offer) so the same application.stage reads the same word everywhere. No stored
// value changes.
const APPLICANT_STAGE_LABEL: Record<string, string> = {
  new: 'New',
  screening: 'Screening',
  interview: 'Interview',
  offer: 'Offer',
};

// Terminal applications show their outcome instead of the stage they died at — otherwise a
// rejected/transferred applicant reads as still "Screening" and disagrees with the Candidates
// board (which lists only active + hired).
const APPLICANT_STATUS_BADGE: Record<string, string> = {
  hired: 'bg-success-muted text-success',
  rejected: 'bg-error-muted text-error',
  transferred: 'bg-surface text-secondary',
  cancelled: 'bg-surface text-secondary',
};

const APPLICANT_STATUS_LABEL: Record<string, string> = {
  hired: 'Hired',
  rejected: 'Rejected',
  transferred: 'Transferred',
  cancelled: 'Cancelled',
};

// Facts-panel status pill: map the lifecycle status onto a Badge tone (chromatic colour is
// reserved for status only, per the design system).
const STATUS_VARIANT: Record<ReqStatus, 'success' | 'warning' | 'neutral' | 'error'> = {
  open: 'success',
  on_hold: 'warning',
  filled: 'neutral',
  cancelled: 'error',
};

const MODE_LABEL: Record<string, string> = {
  online: 'Online (Teams)',
  onsite: 'Onsite',
  either: 'Online or onsite',
};

const APPROVAL_LABEL: Record<string, string> = {
  draft: 'Draft',
  pending_approval: 'Pending approval',
  approved: 'Approved',
  rejected: 'Rejected',
};

// The Candidates tab groups the active pipeline by stage — a section per stage so the funnel
// reads top-to-bottom (application.stage's first value is 'new', shown as "New").
const CANDIDATE_STAGES = ['new', 'screening', 'interview', 'offer'];

function daysSince(dateStr: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000));
}

function relativeDays(dateStr: string): string {
  const days = daysSince(dateStr);
  if (days === 0) return 'today';
  if (days === 1) return '1 day ago';
  return `${days} days ago`;
}

function openDaysLabel(dateStr: string): string {
  const days = daysSince(dateStr);
  if (days === 0) return 'Open today';
  if (days === 1) return 'Open 1 day';
  return `Open ${days} days`;
}

// FUT-329: there's no variant switcher in the reference design, so this view picks
// one variant to render. `external` is the default everywhere else (new-requisition
// dialog, old jd-tab.tsx) and is where most content actually ends up, so prefer it —
// only fall back to `internal` when a requisition has internal content and no
// external content at all.
function pickJdVariant(sections: { variant: JdVariant; body: string }[]): JdVariant {
  const hasExternal = sections.some((s) => s.variant === 'external' && !isRichTextEmpty(s.body));
  const hasInternal = sections.some((s) => s.variant === 'internal' && !isRichTextEmpty(s.body));
  return hasInternal && !hasExternal ? 'internal' : 'external';
}

type SectionGrid = Record<JdSectionKey, string>;

function emptySections(): SectionGrid {
  return {
    about: '',
    responsibilities: '',
    requirements: '',
    nice_to_have: '',
  };
}

interface Props {
  requisitionId: string;
  variant: 'page' | 'modal';
  onClose?: () => void;
}

export function RequisitionDetailView({ requisitionId, variant, onClose }: Props) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const canManage = usePermission('hiring.requisition.manage');
  const canClose = usePermission('hiring.requisition.close');
  const { data, isLoading, error } = useRequisition(requisitionId);
  const jdVariant: JdVariant = data ? pickJdVariant(data.jd_sections) : 'external';

  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState<'candidates' | 'jd'>('candidates');
  const [title, setTitle] = useState('');
  const [grade, setGrade] = useState('');
  const [kind, setKind] = useState<'new' | 'replacement'>('new');
  const [mode, setMode] = useState<'online' | 'onsite' | 'either'>('online');
  const [accountId, setAccountId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [start, setStart] = useState('');
  const [due, setDue] = useState('');
  // FUT-559: headcount is the count of *open* opening rows — editable here (grow/shrink on save).
  const [openCount, setOpenCount] = useState(1);
  const [editVariant, setEditVariant] = useState<JdVariant>('external');
  const [sections, setSections] = useState<SectionGrid>(emptySections());
  // FUT-559: clicking an applicant row opens the candidate detail drawer in place.
  const [selectedCandidate, setSelectedCandidate] = useState<string | null>(null);
  const [skills, setSkills] = useState<PickedSkill[]>([]);
  const [showFillConfirm, setShowFillConfirm] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [showDiscard, setShowDiscard] = useState(false);
  // ISO date strings (yyyy-mm-dd) compare lexically. FUT-559: only a CHANGED start is held to
  // "not in the past" — an old requisition's stored past start stays editable when untouched.
  const today = new Date().toISOString().slice(0, 10);
  const startChanged = start !== (data?.requisition.start_date ?? '');
  const dueChanged = due !== (data?.requisition.due_date ?? '');
  const startInPast = !!start && startChanged && start < today;
  const dueBeforeStart = !!due && !!start && due < start;
  // A changed due date can't land in the past either (independent of start) — matches the
  // New requisition form; an old requisition's stored past due stays valid when untouched.
  const dueInPast = !!due && dueChanged && !dueBeforeStart && due < today;
  const startError = submitAttempted && startInPast ? 'Start date cannot be in the past.' : null;
  const dueError = submitAttempted
    ? dueBeforeStart
      ? 'Due date must be on or after the start date.'
      : dueInPast
        ? 'Due date cannot be in the past.'
        : null
    : null;
  // FUT-785 headcount validation — mirrors the create form (NewRequisitionDialog).
  const headcountError =
    openCount < 1 || !Number.isInteger(openCount)
      ? 'Headcount must be a positive whole number.'
      : openCount > 9
        ? 'Headcount cannot exceed 9.'
        : null;
  const missingRequired = !title.trim() || isRichTextEmpty(sections.about);
  // FUT-559 error focus: mark each empty required field in red on submit and scroll to the
  // first offender, instead of a single lumped message the user has to hunt the field for.
  const titleFieldRef = useRef<HTMLDivElement>(null);
  const aboutFieldRef = useRef<HTMLDivElement>(null);
  // Stable id base for the JD Field wrappers (label ↔ control association).
  const jdFieldBase = useId();
  const titleInvalid = submitAttempted && !title.trim();
  const aboutInvalid = submitAttempted && isRichTextEmpty(sections.about);
  // Unsaved-edit guard for the Cancel button (FUT-559: confirm before discarding). Compares the
  // reliably-loaded scalar fields against the stored requisition — enough to catch a real edit
  // without the false positives an array (skills/JD) diff can throw during the edit-load tick.
  const originalOpenCount = data ? data.openings.filter((o) => o.status === 'open').length : 0;
  const editsDirty =
    editing &&
    data != null &&
    (title !== (data.requisition.title ?? '') ||
      grade !== (data.requisition.grade ?? '') ||
      kind !== data.requisition.kind ||
      mode !== data.requisition.default_interview_mode ||
      accountId !== (data.requisition.account_id ?? '') ||
      projectId !== (data.requisition.project_id ?? '') ||
      start !== (data.requisition.start_date ?? '') ||
      due !== (data.requisition.due_date ?? '') ||
      openCount !== (originalOpenCount || 1));

  const { data: accounts } = useQuery({
    queryKey: hiringKeys.accounts(),
    queryFn: fetchAccounts,
    enabled: editing,
  });
  const { data: projects } = useQuery({
    queryKey: hiringKeys.projects(accountId || undefined),
    queryFn: () => fetchProjects(accountId || undefined),
    enabled: editing && !!accountId,
  });

  const refresh = () => {
    void queryClient.invalidateQueries({
      queryKey: hiringKeys.requisition(requisitionId),
    });
    void queryClient.invalidateQueries({ queryKey: hiringKeys.requisitions() });
  };

  function onError(e: Error) {
    on409(toast, e, queryClient, hiringKeys.requisition(requisitionId));
  }

  const pause = useMutation({
    mutationFn: () =>
      holdRequisition(requisitionId, {
        expected_version: data?.requisition.version,
      }),
    onSuccess: () => {
      toast({ body: 'Requisition paused' });
      refresh();
    },
    onError,
  });
  const resume = useMutation({
    mutationFn: () =>
      resumeRequisition(requisitionId, {
        expected_version: data?.requisition.version,
      }),
    onSuccess: () => {
      toast({ body: 'Requisition resumed' });
      refresh();
    },
    onError,
  });
  const save = useMutation({
    mutationFn: async () => {
      if (!data) throw new Error('not loaded');
      let version = data.requisition.version;
      const fieldsChanged =
        title !== data.requisition.title ||
        grade !== (data.requisition.grade ?? '') ||
        kind !== data.requisition.kind ||
        mode !== (data.requisition.default_interview_mode ?? 'online') ||
        accountId !== (data.requisition.account_id ?? '') ||
        projectId !== (data.requisition.project_id ?? '') ||
        start !== (data.requisition.start_date ?? '') ||
        due !== (data.requisition.due_date ?? '');
      if (fieldsChanged) {
        const res = await editRequisition(requisitionId, {
          expected_version: version,
          patch: {
            title,
            grade,
            kind,
            default_interview_mode: mode,
            account_id: accountId || undefined,
            project_id: projectId || undefined,
            start_date: start || undefined,
            due_date: due || undefined,
          },
        });
        version = res.version;
      }

      // Headcount is opening rows, not a column: grow by adding openings, shrink by cancelling
      // the highest-seq open ones (filled/closed slots are never touched).
      const openOpen = data.openings.filter((o) => o.status === 'open');
      if (openCount > openOpen.length) {
        for (let i = openOpen.length; i < openCount; i++) await addOpening(requisitionId, {});
      } else if (openCount < openOpen.length) {
        const toCancel = [...openOpen]
          .sort((a, b) => b.seq - a.seq)
          .slice(0, openOpen.length - openCount);
        for (const o of toCancel) {
          await closeOpening(o.id, { expected_version: o.version, status: 'cancelled' });
        }
      }

      const originalSections = emptySections();
      for (const s of data.jd_sections)
        if (s.variant === editVariant) originalSections[s.section] = s.body;
      const jdChanged = SECTIONS.some((s) => sections[s.key] !== originalSections[s.key]);
      if (jdChanged) {
        const jdRes = await setRequisitionJd(requisitionId, {
          expected_version: version,
          sections: SECTIONS.filter((s) => !isRichTextEmpty(sections[s.key])).map((s) => ({
            requisition_id: requisitionId,
            variant: editVariant,
            section: s.key,
            body: sections[s.key],
          })),
        });
        version = jdRes.version;
      }

      const originalSkills = data.skills
        .filter((s): s is typeof s & { skill_id: string } => s.skill_id != null)
        .map((s) => ({
          skill_id: s.skill_id,
          level: s.min_level ?? undefined,
        }));
      const normalizeSkills = (list: { skill_id: string; level?: number }[]) =>
        [...list]
          .sort((a, b) => a.skill_id.localeCompare(b.skill_id))
          .map((s) => `${s.skill_id}:${s.level ?? ''}`)
          .join('|');
      const skillsChanged = normalizeSkills(skills) !== normalizeSkills(originalSkills);
      if (skillsChanged) {
        await setRequisitionSkills(requisitionId, {
          expected_version: version,
          skills: skills.map((s) => ({
            skill_id: s.skill_id,
            skill_name: s.skill_name,
            min_level: s.level,
          })),
        });
      }
    },
    onSuccess: () => {
      toast({ body: 'Saved' });
      setEditing(false);
      refresh();
    },
    onError: (e: Error) => on409(toast, e, queryClient, hiringKeys.requisition(requisitionId)),
  });

  function startEditing() {
    if (!data) return;
    setTitle(data.requisition.title);
    setGrade(data.requisition.grade ?? '');
    setKind((data.requisition.kind as 'new' | 'replacement') ?? 'new');
    setMode((data.requisition.default_interview_mode as typeof mode) ?? 'online');
    setAccountId(data.requisition.account_id ?? '');
    setProjectId(data.requisition.project_id ?? '');
    setStart(data.requisition.start_date ?? '');
    setDue(data.requisition.due_date ?? '');
    setOpenCount(data.openings.filter((o) => o.status === 'open').length || 1);
    setEditVariant(jdVariant);
    const grid = emptySections();
    for (const s of data.jd_sections) if (s.variant === jdVariant) grid[s.section] = s.body;
    setSections(grid);
    setSkills(
      data.skills
        .filter((s): s is typeof s & { skill_id: string } => s.skill_id != null)
        .map((s) => ({
          skill_id: s.skill_id,
          skill_name: s.skill_name,
          level: s.min_level ?? undefined,
        })),
    );
    setSubmitAttempted(false);
    setEditing(true);
  }

  function submitEdit() {
    setSubmitAttempted(true);
    if (missingRequired || startInPast || dueBeforeStart || dueInPast || headcountError) {
      const target = !title.trim()
        ? titleFieldRef.current
        : isRichTextEmpty(sections.about)
          ? aboutFieldRef.current
          : null;
      target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    save.mutate();
  }

  function discardEdits() {
    setShowDiscard(false);
    setSubmitAttempted(false);
    setEditing(false);
  }

  function cancelEditing() {
    if (editsDirty) {
      setShowDiscard(true);
      return;
    }
    setSubmitAttempted(false);
    setEditing(false);
  }

  function requestClose() {
    if (editing && !window.confirm('Discard unsaved changes?')) return;
    setEditing(false);
    onClose?.();
  }

  function shareJob() {
    const url = `${window.location.origin}/hiring/requisitions?selectedRequisitionId=${requisitionId}`;
    void navigator.clipboard.writeText(url);
    toast({ body: 'Link copied to clipboard' });
  }

  if (isLoading) {
    return (
      <div className="flex flex-col overflow-hidden">
        <div className="p-6 text-secondary">Loading…</div>
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="flex flex-col overflow-hidden p-6">
        <Banner status="error" title={(error as Error)?.message ?? 'Not found'} />
      </div>
    );
  }

  const req = data.requisition;
  const isTerminal = req.status === 'filled' || req.status === 'cancelled';
  // FUT-559 (4d3023eb): a paused requisition freezes its detail actions — Edit JD and the
  // lifecycle menu are locked until it's resumed from the Requisitions board.
  const isOnHold = req.status === 'on_hold';
  const onHoldReason =
    'This requisition is on hold — resume it from the Requisitions board to make changes.';
  // A closed requisition keeps its footer visible (so the bar never collapses) but every action is
  // locked — the outcome is settled and can't be reopened.
  const terminalReason =
    req.status === 'filled'
      ? "This requisition is filled — it's closed and can no longer be changed."
      : "This requisition is cancelled — it's closed and can no longer be changed.";

  // FUT-559: read applicants from the detail endpoint (candidate_id + name + seniority +
  // status), and split the active pipeline from the closed trail. A transferred/rejected
  // candidate must NOT linger in the old role's active list (bug: it still showed under Role A
  // after a transfer) — it drops to a dimmed "Past applicants" section instead.
  const activeApplicants = data.applicants.filter((a) => a.status === 'active');
  // Hired applicants are the pipeline's positive terminal outcome: they leave the active stages
  // but earn their own section under Offer (not the dimmed "Past applicants" trail, which is for
  // rejected/transferred/cancelled).
  const hiredApplicants = data.applicants.filter((a) => a.status === 'hired');
  const pastApplicants = data.applicants.filter(
    (a) => a.status !== 'active' && a.status !== 'hired',
  );
  // Cancelling the requisition cancels its active candidates; those in Offer are the sensitive
  // case the cancel dialog must call out (FUT-770).
  const offerApplicantCount = activeApplicants.filter((a) => (a.stage ?? 'new') === 'offer').length;
  // Headcount is opening rows, not a column: a cancelled opening no longer counts toward the
  // target, and a filled one is progress. (See the edit form for the grow/shrink mechanics.)
  const openingsTotal = data.openings.filter((o) => o.status !== 'cancelled').length;
  const openingsFilled = data.openings.filter((o) => o.status === 'filled').length;
  // FUT-569: a requisition whose openings are all filled is fully staffed — freeze the lifecycle
  // actions that would keep it running (cancel, pause/resume, edit, apply) even while its status is
  // still `open`. Mark filled is the deliberate exception: it stays live so the recruiter can close
  // out a fully-staffed req in one click (see the footer). Status `filled` is already terminal above
  // (the footer collapses to no actions), so this guard covers the open-but-complete case (e.g. 1/1
  // filled, status Open). The `openingsTotal > 0` check keeps a requisition with zero live openings
  // from reading as staffed.
  const isFullyStaffed = openingsTotal > 0 && openingsFilled >= openingsTotal;
  // A filled requisition is a closed, fully-resolved position, so its Headcount reads complete
  // (A/A) regardless of how many openings an actual hire filled — the banner below carries the
  // "how it closed" nuance. Non-filled requisitions still show real hire progress.
  const headcountFilled = req.status === 'filled' ? openingsTotal : openingsFilled;
  // Status `filled` only comes from the "Mark filled" button (hiring fills openings but never
  // flips the requisition's status). Since Headcount now reads A/A, the banner is where we say how
  // many openings an actual hire filled — the rest were closed out by the manual mark.
  const markedFilledNotice =
    req.status === 'filled'
      ? openingsTotal > 0 && openingsFilled < openingsTotal
        ? openingsFilled === 0
          ? 'Marked filled with the button — no candidate was hired for this requisition.'
          : `Marked filled with the button — ${openingsFilled} of ${openingsTotal} openings were filled by a hire, the rest were closed manually.`
        : 'Marked filled with the button.'
      : null;
  const fullyStaffedReason = 'This requisition is fully staffed — all openings are filled.';
  const renderApplicant = (a: ApplicantRow) => {
    const name = a.candidate_name ?? 'Unknown candidate';
    const terminal = a.status !== 'active';
    return (
      <button
        key={a.id}
        type="button"
        onClick={() => a.candidate_id && setSelectedCandidate(a.candidate_id)}
        className="-mx-3 flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-3 text-left transition-colors hover:bg-muted"
      >
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium text-primary">{name}</div>
          <div className="truncate text-base text-secondary">
            {[a.candidate_seniority, `Applied ${relativeDays(a.created_at)}`]
              .filter(Boolean)
              .join(' · ')}
          </div>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-sm font-medium ${
            terminal
              ? (APPLICANT_STATUS_BADGE[a.status ?? ''] ?? 'bg-surface text-secondary')
              : (APPLICANT_STAGE_BADGE[a.stage ?? ''] ?? 'bg-surface text-secondary')
          }`}
        >
          {terminal
            ? (APPLICANT_STATUS_LABEL[a.status ?? ''] ?? a.status)
            : (APPLICANT_STAGE_LABEL[a.stage ?? ''] ?? a.stage)}
        </span>
      </button>
    );
  };

  const hasJdContent = SECTIONS.some(
    (s) =>
      !isRichTextEmpty(
        data.jd_sections.find((j) => j.variant === jdVariant && j.section === s.key)?.body,
      ),
  );
  const hasAnyDetail = data.skills.length > 0 || hasJdContent;

  if (editing) {
    return (
      <div
        className={`flex flex-col overflow-hidden ${variant === 'modal' ? 'min-h-0 flex-1' : 'h-full'}`}
        style={HEADER_FOOTER_PADDING}
      >
        {/* FUT-559 edit-layout parity: title-only header + a footer action bar, matching the
            New requisition dialog — actions live at the bottom-right, not stacked in the header. */}
        <header className="border-b border-border bg-body px-6 py-4">
          <h1 className="truncate text-lg font-semibold text-primary">{title}</h1>
        </header>
        <div className="min-h-0 flex-1 overflow-auto">
          <div className="mx-auto max-w-[720px] px-6 py-6">
            <VStack gap={6}>
              {/* Role */}
              <VStack gap={4}>
                <GroupLabel>Role</GroupLabel>
                {/* Wrapper is a scroll target for the submit-time error focus, not styling. */}
                <div ref={titleFieldRef}>
                  <Input
                    label="Job title"
                    isRequired
                    value={title}
                    onChange={(value) => setTitle(value)}
                    status={
                      titleInvalid
                        ? { type: 'error', message: 'Job title is required.' }
                        : undefined
                    }
                  />
                </div>
                <Grid columns={2} gap={4}>
                  <Selector
                    label="Grade"
                    options={GRADES.map((g) => ({ value: g, label: g }))}
                    value={grade}
                    onChange={setGrade}
                  />
                  <Selector
                    label="Type"
                    options={[
                      { value: 'new', label: 'New' },
                      { value: 'replacement', label: 'Replacement' },
                    ]}
                    value={kind}
                    onChange={(v) => setKind(v as 'new' | 'replacement')}
                  />
                </Grid>
                <Grid columns={2} gap={4}>
                  <Selector
                    label="Account"
                    options={(accounts ?? []).map((a) => ({ value: a.account_id, label: a.name }))}
                    value={accountId}
                    onChange={(v) => {
                      setAccountId(v);
                      setProjectId('');
                    }}
                    placeholder="No account"
                  />
                  <Selector
                    label="Project"
                    options={(projects ?? []).map((p) => ({ value: p.project_id, label: p.name }))}
                    value={projectId}
                    onChange={setProjectId}
                    isDisabled={!accountId}
                    placeholder={accountId ? 'No project' : 'Pick an account first'}
                  />
                </Grid>
              </VStack>

              {/* Logistics */}
              <VStack gap={4}>
                <GroupLabel>Logistics</GroupLabel>
                <Grid columns={2} gap={4}>
                  <Selector
                    label="Interview mode"
                    options={[
                      { value: 'online', label: 'Online (Teams)' },
                      { value: 'onsite', label: 'Onsite' },
                      { value: 'either', label: 'Either' },
                    ]}
                    value={mode}
                    onChange={(v) => setMode(v as 'online' | 'onsite' | 'either')}
                  />
                  <NumberInput
                    label="Headcount (openings)"
                    isIntegerOnly
                    value={openCount}
                    onChange={(v) => setOpenCount(v ?? 1)}
                    status={
                      headcountError
                        ? { type: 'error', message: headcountError }
                        : openCount < originalOpenCount
                          ? {
                              type: 'warning',
                              message: `Saving cancels ${
                                originalOpenCount - openCount
                              } open opening${
                                originalOpenCount - openCount > 1 ? 's' : ''
                              }. Filled openings are kept.`,
                            }
                          : undefined
                    }
                  />
                </Grid>
                <Grid columns={2} gap={4}>
                  <DateInput
                    label="Start date"
                    value={start || undefined}
                    onChange={(v) => setStart(v ?? '')}
                    // Can't start a role in the past — disable every day before today.
                    min={today}
                    status={startError ? { type: 'error', message: startError } : undefined}
                  />
                  <DateInput
                    label="Due date"
                    value={due || undefined}
                    onChange={(v) => setDue(v ?? '')}
                    // Due must land on/after the start date (and never before today).
                    min={start && start > today ? start : today}
                    status={dueError ? { type: 'error', message: dueError } : undefined}
                  />
                </Grid>
              </VStack>

              {/* Skills */}
              <VStack gap={4}>
                <GroupLabel>Skills</GroupLabel>
                <SkillPicker value={skills} onChange={setSkills} />
              </VStack>

              <Divider />

              {/* Job description. FUT-559 (562f4b86): the External/Internal variant switcher is
                  temporarily hidden — edits keep whichever variant the content already uses. */}
              <VStack gap={4}>
                <GroupLabel>Job description</GroupLabel>
                {SECTIONS.map((s) => {
                  const isAbout = s.key === 'about';
                  return (
                    <Field
                      key={s.key}
                      ref={isAbout ? aboutFieldRef : undefined}
                      label={s.label}
                      isGroupLabel
                      inputID={`${jdFieldBase}-${s.key}`}
                      labelID={`${jdFieldBase}-${s.key}-label`}
                      isRequired={isAbout}
                      status={
                        isAbout && aboutInvalid
                          ? { type: 'error', message: 'About the role is required.' }
                          : undefined
                      }
                    >
                      <RichTextEditor
                        value={sections[s.key]}
                        onChange={(html) => setSections((g) => ({ ...g, [s.key]: html }))}
                        className={isAbout && aboutInvalid ? '!border-error' : undefined}
                        placeholder={
                          isAbout
                            ? 'Write the about section…'
                            : `Write the ${s.label.toLowerCase()}…`
                        }
                      />
                    </Field>
                  );
                })}
              </VStack>
            </VStack>
          </div>
        </div>
        {/* Same DialogFooter as the view mode and the candidate drawer — right-aligned actions,
            Cancel-first, primary last. Keeps its top divider: the edit form is a single scrollable
            column, so there's no facts-panel column line for it to collide with. */}
        <DialogFooter>
          <Button
            size="sm"
            variant="secondary"
            label="Cancel"
            onClick={cancelEditing}
            isDisabled={save.isPending}
          />
          <Button
            size="sm"
            variant="primary"
            label={save.isPending ? 'Updating…' : 'Update'}
            onClick={submitEdit}
            isDisabled={save.isPending}
          />
        </DialogFooter>
        <AlertDialog
          isOpen={showDiscard}
          onOpenChange={setShowDiscard}
          title="Discard your changes?"
          description="Your edits to this requisition haven't been saved."
          cancelLabel="Keep editing"
          actionLabel="Discard"
          actionVariant="destructive"
          onAction={discardEdits}
        />
      </div>
    );
  }

  // Strip any " — <client>" suffix so the heading is just the role; the client (and every other
  // fact) lives in the right-hand facts panel, so it isn't repeated in the header.
  const { role: headerTitle } = splitReqTitle(req.title, data.account_name ?? undefined);

  return (
    <div
      className={`flex flex-col overflow-hidden ${variant === 'modal' ? 'min-h-0 flex-1' : 'h-full'}`}
      style={HEADER_FOOTER_PADDING}
    >
      {/* Header carries the role title only — no avatar or client subtitle. The More-actions menu
          sits before the close button; status, client and every other fact live in the right-hand
          facts panel, so nothing is duplicated. */}
      <DialogHeader
        hasDivider={false}
        title={headerTitle}
        endContent={
          <DropdownMenu
            placement="below"
            button={{
              variant: 'ghost',
              size: 'sm',
              isIconOnly: true,
              icon: <MoreHorizontal className="size-4" />,
              label: 'More actions',
            }}
          >
            <DropdownMenuItem
              label="Share"
              icon={<Share2 className="size-4" />}
              onClick={shareJob}
            />
          </DropdownMenu>
        }
        onOpenChange={(open) => {
          if (!open) requestClose();
        }}
      />

      {markedFilledNotice && (
        <div className="flex-none px-6 pt-4">
          <Banner status="info" title={markedFilledNotice} />
        </div>
      )}

      <div className="flex min-h-0 flex-1 overflow-hidden bg-card">
        {/* Working area (left): candidate pipeline is the default view, job description second. */}
        <section className="flex min-w-0 flex-1 flex-col">
          <div className="flex-none border-b border-border px-6">
            <TabList
              value={tab}
              onChange={(t) => setTab(t as 'candidates' | 'jd')}
              aria-label="Requisition sections"
            >
              <Tab
                value="candidates"
                label="Candidates"
                endContent={<Badge variant="neutral" label={activeApplicants.length} />}
              />
              <Tab value="jd" label="Job description" />
            </TabList>
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-6">
            {tab === 'candidates' ? (
              activeApplicants.length === 0 &&
              hiredApplicants.length === 0 &&
              pastApplicants.length === 0 ? (
                <EmptyState
                  title="No applicants yet"
                  description="Candidates appear here, grouped by pipeline stage, as they apply."
                />
              ) : (
                <div className="space-y-6">
                  {/* Active pipeline grouped by stage. A transferred/rejected candidate drops to
                      the dimmed "Past applicants" trail instead of lingering in a stage. */}
                  {CANDIDATE_STAGES.map((stageKey) => {
                    const items = activeApplicants.filter((a) => (a.stage ?? 'new') === stageKey);
                    return (
                      <div key={stageKey}>
                        <div className="mb-2 flex items-center gap-2 border-b border-border pb-1.5">
                          <Text type="supporting" className="uppercase">
                            {APPLICANT_STAGE_LABEL[stageKey]}
                          </Text>
                          <Badge variant="neutral" label={items.length} />
                        </div>
                        {items.length === 0 ? (
                          <p className="py-1 text-sm text-secondary">
                            No candidates at this stage.
                          </p>
                        ) : (
                          <div className="divide-y divide-border">
                            {items.map((a) => renderApplicant(a))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {/* Hired sits under Offer as the pipeline's won outcome — same row shape as the
                      stages above, with a success-toned count to mark the positive terminal state. */}
                  {hiredApplicants.length > 0 && (
                    <div>
                      <div className="mb-2 flex items-center gap-2 border-b border-border pb-1.5">
                        <Text type="supporting" className="uppercase">
                          Hired
                        </Text>
                        <Badge variant="success" label={hiredApplicants.length} />
                      </div>
                      <div className="divide-y divide-border">
                        {hiredApplicants.map((a) => renderApplicant(a))}
                      </div>
                    </div>
                  )}
                  {pastApplicants.length > 0 && (
                    <div className="border-t border-border pt-3">
                      <div className="mb-1 text-sm font-medium text-secondary">
                        Past applicants ({pastApplicants.length})
                      </div>
                      <div className="divide-y divide-border opacity-70">
                        {pastApplicants.slice(0, 5).map((a) => renderApplicant(a))}
                      </div>
                    </div>
                  )}
                </div>
              )
            ) : !hasAnyDetail ? (
              req.note?.trim() ? (
                <p className="text-base text-primary">{req.note}</p>
              ) : (
                <EmptyState
                  title="No job description yet"
                  description="Skills and JD content haven't been added for this requisition."
                />
              )
            ) : (
              <div className="space-y-5">
                {data.skills.length > 0 && (
                  <div>
                    <div className="mb-2 font-semibold text-primary">Tech stack</div>
                    <div className="flex flex-wrap gap-2">
                      {data.skills.map((s) => (
                        <Badge
                          key={s.skill_name}
                          variant="neutral"
                          label={`${s.skill_name}${
                            s.min_level ? ` · ${LEVEL_LABEL[s.min_level] ?? s.min_level}` : ''
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                )}
                {SECTIONS.map((s) => {
                  const body =
                    data.jd_sections.find((j) => j.variant === jdVariant && j.section === s.key)
                      ?.body ?? '';
                  if (isRichTextEmpty(body)) return null;
                  return (
                    <div key={s.key}>
                      <div className="mb-1 font-semibold text-primary">{s.label}</div>
                      <RichTextDisplay value={body} />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* Facts panel (right): status, type, client and everything a recruiter checks without
            leaving the pipeline — the single home for these values (the header holds only the title).
            Sits on the same white surface as the pipeline and footer, set apart by the left hairline
            and its own row dividers — no tinted slab (the old bg-body cut off above the footer and
            read cold against the white body). */}
        <aside className="w-[300px] shrink-0 overflow-y-auto border-l border-border px-5 py-4">
          {req.status === 'open' && req.due_date && daysLeft(req.due_date) < 0 && (
            <Banner
              status="error"
              title={`${-daysLeft(req.due_date)} days overdue`}
              className="mb-4"
            />
          )}
          {openingsTotal > 0 && (
            <div className="mb-3">
              <div className="mb-1 flex items-center justify-between">
                <Text type="supporting">Headcount</Text>
                <Text type="supporting">
                  {headcountFilled}/{openingsTotal} filled
                </Text>
              </div>
              <ProgressBar
                label="Headcount filled"
                isLabelHidden
                value={headcountFilled}
                max={openingsTotal}
                variant="success"
              />
            </div>
          )}
          <DetailRow
            label="Status"
            value={<Badge variant={STATUS_VARIANT[req.status]} label={STATUS_LABEL[req.status]} />}
          />
          <DetailRow label="Type" value={req.kind === 'replacement' ? 'Replacement' : 'New'} />
          <DetailRow
            label="Approval"
            value={APPROVAL_LABEL[req.approval_status] ?? req.approval_status}
          />
          <DetailRow label="Client" value={data.account_name ?? '—'} />
          <DetailRow label="Project" value={data.project_name ?? '—'} />
          <DetailRow label="Grade" value={req.grade ?? '—'} />
          {/* The Candidates tab badge counts the active pipeline; this fact counts everyone who
              ever applied. When they differ (terminal/hired applicants exist), show both so the
              two sides reconcile — "0 active · 2 total" explains an empty pipeline with 2 past. */}
          <DetailRow
            label="Candidates"
            value={
              activeApplicants.length === data.applicants.length
                ? `${data.applicants.length} total`
                : `${activeApplicants.length} active · ${data.applicants.length} total`
            }
          />
          <DetailRow label="Start date" value={req.start_date ? formatDate(req.start_date) : '—'} />
          <DetailRow
            label="Due date"
            value={
              req.due_date
                ? `${formatDate(req.due_date)} · ${
                    daysLeft(req.due_date) < 0
                      ? `${-daysLeft(req.due_date)}d overdue`
                      : `${daysLeft(req.due_date)} days left`
                  }`
                : '—'
            }
          />
          <DetailRow
            label="Interview mode"
            value={MODE_LABEL[req.default_interview_mode ?? ''] ?? '—'}
          />
          <DetailRow label="Posted" value={openDaysLabel(req.created_at)} />
        </aside>
      </div>

      {/* Full-width separator above the footer — the same gray line the candidate drawer shows.
          It lives here as its own row (not as the footer's own top border) so the two-column body
          above can't interrupt it at the facts-panel seam; the footer's own divider stays off to
          avoid doubling. */}
      <Divider />
      {/* Footer mirrors the candidate drawer's DialogFooter: secondary lifecycle actions pinned
          left, the primary action (Edit) on the right. A terminal requisition keeps the bar visible
          but every action is disabled (with a reason) — the bar never collapses to an empty strip. */}
      <DialogFooter
        hasDivider={false}
        startContent={
          <div className="flex items-center gap-2">
            <DisabledActionTooltip
              disabled={isTerminal || !canClose || isOnHold || isFullyStaffed}
              reason={
                isTerminal
                  ? terminalReason
                  : !canClose
                    ? PERMISSION_DENIED.requisition.manage
                    : isFullyStaffed
                      ? fullyStaffedReason
                      : onHoldReason
              }
            >
              <Button
                size="sm"
                variant="secondary"
                label="Cancel"
                isDisabled={isTerminal || !canClose || isOnHold || isFullyStaffed}
                style={{ color: 'var(--color-text-red)' }}
                onClick={() => setShowCancelDialog(true)}
              />
            </DisabledActionTooltip>
            {/* Pause/Resume are status-specific: a filled/cancelled requisition is neither open nor
                on_hold, so neither renders for a terminal one — the remaining actions cover it. */}
            {req.status === 'open' && (
              <DisabledActionTooltip
                disabled={!canManage || isFullyStaffed}
                reason={!canManage ? PERMISSION_DENIED.requisition.manage : fullyStaffedReason}
              >
                <Button
                  size="sm"
                  variant="secondary"
                  label="Pause"
                  isDisabled={!canManage || isFullyStaffed}
                  onClick={() => pause.mutate()}
                />
              </DisabledActionTooltip>
            )}
            {req.status === 'on_hold' && (
              <DisabledActionTooltip
                disabled={!canManage || isFullyStaffed}
                reason={!canManage ? PERMISSION_DENIED.requisition.manage : fullyStaffedReason}
              >
                <Button
                  size="sm"
                  variant="secondary"
                  label="Resume"
                  isDisabled={!canManage || isFullyStaffed}
                  onClick={() => resume.mutate()}
                />
              </DisabledActionTooltip>
            )}
          </div>
        }
      >
        {data.has_applied ? (
          <Button size="sm" variant="secondary" label="Applied" isDisabled />
        ) : (
          // Applying is not wired up yet — keep the button visible but always disabled, and explain
          // on hover/focus that it's on the way.
          <DisabledActionTooltip disabled reason="Coming soon">
            <Button size="sm" variant="primary" label="Apply" isDisabled />
          </DisabledActionTooltip>
        )}
        {/* Mark filled is the one lifecycle action that stays live when fully staffed: a req with
            every opening filled is exactly when the recruiter wants to close it out. The other
            actions (cancel, pause/resume, edit, apply) remain frozen by isFullyStaffed. */}
        <DisabledActionTooltip
          disabled={isTerminal || !canClose || isOnHold}
          reason={
            isTerminal
              ? terminalReason
              : !canClose
                ? PERMISSION_DENIED.requisition.manage
                : onHoldReason
          }
        >
          <Button
            size="sm"
            variant="secondary"
            label="Mark filled"
            isDisabled={isTerminal || !canClose || isOnHold}
            onClick={() => setShowFillConfirm(true)}
          />
        </DisabledActionTooltip>
        <DisabledActionTooltip
          disabled={isTerminal || !canManage || isOnHold || isFullyStaffed}
          reason={
            isTerminal
              ? terminalReason
              : !canManage
                ? PERMISSION_DENIED.requisition.edit
                : isFullyStaffed
                  ? fullyStaffedReason
                  : onHoldReason
          }
        >
          <Button
            size="sm"
            variant="secondary"
            label="Edit"
            icon={<Pencil className="size-4" />}
            isDisabled={isTerminal || !canManage || isOnHold || isFullyStaffed}
            onClick={startEditing}
          />
        </DisabledActionTooltip>
      </DialogFooter>
      <MarkFilledDialog
        requisitionId={requisitionId}
        version={req.version}
        open={showFillConfirm}
        onOpenChange={setShowFillConfirm}
        onDone={refresh}
      />
      <CancelRequisitionDialog
        requisitionId={requisitionId}
        version={req.version}
        offerCount={offerApplicantCount}
        open={showCancelDialog}
        onOpenChange={setShowCancelDialog}
        onDone={refresh}
      />
      {selectedCandidate && (
        <CandidateDetailDrawer
          candidateId={selectedCandidate}
          onClose={() => setSelectedCandidate(null)}
        />
      )}
    </div>
  );
}
