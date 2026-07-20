import {
  AlertDialog,
  Avatar,
  Badge,
  Banner,
  Button,
  DateInput,
  DisabledActionTooltip,
  DropdownMenu,
  DropdownMenuItem,
  EmptyState,
  IconButton,
  Input,
  NumberInput,
  RichTextDisplay,
  RichTextEditor,
  Selector,
  useToast,
} from '@seta/shared-ui';
import { usePermission } from '@seta/web-identity';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Calendar as CalendarIcon, MoreHorizontal, Pencil, Share2, X } from 'lucide-react';
import { type ReactNode, useRef, useState } from 'react';
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
  resumeRequisition,
  setRequisitionJd,
  setRequisitionSkills,
} from '../api/hiring-client.ts';
import { GRADES } from '../lib/grades.ts';
import { PERMISSION_DENIED } from '../lib/permission-messages.ts';
import { hiringKeys } from '../state/query-keys.ts';
import { CancelRequisitionDialog } from './cancel-requisition-dialog.tsx';
import { CandidateDetailDrawer } from './candidate-detail-drawer.tsx';
import { MarkFilledDialog } from './mark-filled-dialog.tsx';
import {
  daysLeft,
  formatDate,
  isRichTextEmpty,
  STATUS_BADGE_CLASS,
  STATUS_LABEL,
} from './requisition-format.ts';
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

// Display-only relabel: application.stage's first value is 'new' in the DB, but the
// board card's stage track calls that same phase "Sourcing" — show the same word here
// so they don't read as two different concepts. No stored value changes.
const APPLICANT_STAGE_LABEL: Record<string, string> = {
  new: 'Sourcing',
  screening: 'Screening',
  interview: 'Interview',
  offer: 'Offer',
};

// Terminal applications show their outcome instead of the stage they died at — otherwise a
// rejected/transferred applicant reads as still "Screening" and disagrees with the Candidates
// board (which lists only active + hired).
const APPLICANT_STATUS_BADGE: Record<string, string> = {
  hired: 'bg-success-muted text-success',
  rejected: 'bg-danger-muted text-danger',
  transferred: 'bg-surface text-secondary',
  cancelled: 'bg-surface text-secondary',
};

const APPLICANT_STATUS_LABEL: Record<string, string> = {
  hired: 'Hired',
  rejected: 'Rejected',
  transferred: 'Transferred',
  cancelled: 'Cancelled',
};

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

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-base">
      <span className="text-secondary">{label}</span>
      <span className="font-medium text-primary">{value}</span>
    </div>
  );
}

// FUT-559 (e99780eb): read-only — dates change only through the full Edit JD form, not inline
// here. Keeps the Timeline a stable, glanceable summary.
function DateField({
  label,
  value,
  extra,
}: {
  label: string;
  value: string | null;
  extra?: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <CalendarIcon className="mt-0.5 size-4 shrink-0 text-secondary" aria-hidden />
      <div>
        <div className="text-sm text-secondary">{label}</div>
        <span className="text-base font-medium text-primary">
          {value ? formatDate(value) : '—'}
        </span>
        {extra}
      </div>
    </div>
  );
}

function QuickAction({
  icon,
  label,
  onClick,
  disabled,
  destructive,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex w-full flex-col items-center gap-2 rounded-lg border border-border px-2 py-3 text-center text-sm font-medium hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50 ${
        destructive ? 'text-error' : 'text-primary'
      }`}
    >
      {icon}
      {label}
    </button>
  );
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
  const missingRequired = !title.trim() || isRichTextEmpty(sections.about);
  // FUT-559 error focus: mark each empty required field in red on submit and scroll to the
  // first offender, instead of a single lumped message the user has to hunt the field for.
  const titleFieldRef = useRef<HTMLDivElement>(null);
  const aboutFieldRef = useRef<HTMLDivElement>(null);
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
    if (missingRequired || startInPast || dueBeforeStart || dueInPast) {
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

  // FUT-559: read applicants from the detail endpoint (candidate_id + name + seniority +
  // status), and split the active pipeline from the closed trail. A transferred/rejected
  // candidate must NOT linger in the old role's active list (bug: it still showed under Role A
  // after a transfer) — it drops to a dimmed "Past applicants" section instead.
  const activeApplicants = data.applicants.filter((a) => a.status === 'active');
  const pastApplicants = data.applicants.filter(
    (a) => a.status !== 'active' && a.status !== 'hired',
  );
  const renderApplicant = (a: ApplicantRow) => {
    const name = a.candidate_name ?? 'Unknown candidate';
    const terminal = a.status !== 'active';
    return (
      <button
        key={a.id}
        type="button"
        onClick={() => a.candidate_id && setSelectedCandidate(a.candidate_id)}
        className="flex w-full items-center gap-3 py-3 text-left hover:bg-surface"
      >
        <Avatar name={name} size={36} />
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

  // While editing, reflect the in-progress Account/Project/Grade selection instead of the
  // last-saved server values, so the subtitle updates live as the user picks a new one.
  const liveAccountName = editing
    ? (accounts?.find((a) => a.account_id === accountId)?.name ?? null)
    : data.account_name;
  const subtitle = [liveAccountName, data.project_name, req.grade ? `Grade ${req.grade}` : null]
    .filter(Boolean)
    .join(' • ');

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
      >
        {/* FUT-559 edit-layout parity: title-only header + a footer action bar, matching the
            New requisition dialog — actions live at the bottom-right, not stacked in the header. */}
        <header className="border-b border-border bg-body px-6 py-4">
          <h1 className="truncate text-lg font-semibold text-primary">{title}</h1>
        </header>
        <div className="min-h-0 flex-1 overflow-auto">
          <div className="mx-auto max-w-[720px] space-y-5 px-6 py-5">
            <div className="space-y-1" ref={titleFieldRef}>
              <Input
                label="Job title"
                isRequired
                value={title}
                onChange={(value) => setTitle(value)}
              />
              {titleInvalid && <p className="text-sm text-error">Job title is required.</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Selector
                  label="Grade"
                  options={GRADES.map((g) => ({ value: g, label: g }))}
                  value={grade}
                  onChange={setGrade}
                />
              </div>
              <div className="space-y-1">
                <Selector
                  label="Type"
                  options={[
                    { value: 'new', label: 'New' },
                    { value: 'replacement', label: 'Replacement' },
                  ]}
                  value={kind}
                  onChange={(v) => setKind(v as 'new' | 'replacement')}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
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
              </div>
              <div className="space-y-1">
                <Selector
                  label="Project"
                  options={(projects ?? []).map((p) => ({ value: p.project_id, label: p.name }))}
                  value={projectId}
                  onChange={setProjectId}
                  isDisabled={!accountId}
                  placeholder={accountId ? 'No project' : 'Pick an account first'}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
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
              </div>
              <div className="space-y-1">
                <NumberInput
                  label="Headcount (openings)"
                  min={1}
                  isIntegerOnly
                  value={openCount}
                  onChange={(v) => setOpenCount(Math.max(1, v || 1))}
                />
                {openCount < originalOpenCount && (
                  <p className="text-sm text-secondary">
                    Saving cancels {originalOpenCount - openCount} open opening
                    {originalOpenCount - openCount > 1 ? 's' : ''}. Filled openings are kept.
                  </p>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <DateInput
                  label="Start date"
                  value={start || undefined}
                  onChange={(v) => setStart(v ?? '')}
                />
                {startError && <p className="text-sm text-error">{startError}</p>}
              </div>
              <div className="space-y-1">
                <DateInput
                  label="Due date"
                  value={due || undefined}
                  onChange={(v) => setDue(v ?? '')}
                />
                {dueError && <p className="text-sm text-error">{dueError}</p>}
              </div>
            </div>

            <SkillPicker value={skills} onChange={setSkills} />

            {/* FUT-559 (562f4b86): the External/Internal variant switcher is temporarily hidden —
                edits keep whichever variant the requisition's content already uses. */}
            <div className="text-sm font-semibold uppercase text-secondary">JD detail</div>

            {SECTIONS.map((s) => (
              <div key={s.key} ref={s.key === 'about' ? aboutFieldRef : undefined}>
                <div
                  className={`mb-1 font-semibold ${s.key === 'nice_to_have' ? 'text-secondary' : 'text-primary'}`}
                >
                  {s.key === 'about' ? 'About the role *' : s.label}
                </div>
                <RichTextEditor
                  value={sections[s.key]}
                  onChange={(html) => setSections((g) => ({ ...g, [s.key]: html }))}
                  className={s.key === 'about' && aboutInvalid ? '!border-error' : undefined}
                  placeholder={
                    s.key === 'about'
                      ? 'Write the about section…'
                      : `Write the ${s.label.toLowerCase()}…`
                  }
                />
                {s.key === 'about' && aboutInvalid && (
                  <p className="mt-1 text-sm text-error">About the role is required.</p>
                )}
              </div>
            ))}
          </div>
        </div>
        <footer className="flex items-center justify-end gap-2 border-t border-border bg-body px-6 py-3">
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
        </footer>
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

  return (
    <div
      className={`flex flex-col overflow-hidden ${variant === 'modal' ? 'min-h-0 flex-1' : 'h-full'}`}
    >
      <header className="flex items-start justify-between gap-4 border-b border-border bg-body px-6 py-4">
        <div className="flex min-w-0 items-start gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-lg font-semibold text-primary">{req.title}</h1>
              <span
                className={`shrink-0 rounded-full px-2.5 py-1 text-sm font-medium ${STATUS_BADGE_CLASS[req.status]}`}
              >
                {STATUS_LABEL[req.status]}
              </span>
            </div>
            {subtitle && <p className="mt-0.5 truncate text-base text-secondary">{subtitle}</p>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {!isTerminal && (
            <DisabledActionTooltip
              disabled={(!canManage && !canClose) || isOnHold}
              reason={!canManage && !canClose ? PERMISSION_DENIED.requisition.manage : onHoldReason}
            >
              <DropdownMenu
                placement="below"
                button={{
                  variant: 'secondary',
                  size: 'sm',
                  label: 'More actions',
                  icon: <MoreHorizontal className="size-4" />,
                  isDisabled: (!canManage && !canClose) || isOnHold,
                }}
              >
                {req.status === 'open' && (
                  <DropdownMenuItem
                    label="Pause"
                    isDisabled={!canManage}
                    onClick={() => pause.mutate()}
                  />
                )}
                {req.status === 'on_hold' && (
                  <DropdownMenuItem
                    label="Resume"
                    isDisabled={!canManage}
                    onClick={() => resume.mutate()}
                  />
                )}
                <DropdownMenuItem
                  label="Mark filled"
                  isDisabled={!canClose}
                  onClick={() => setTimeout(() => setShowFillConfirm(true), 0)}
                />
                <DropdownMenuItem
                  label="Cancel"
                  isDisabled={!canClose}
                  style={{ color: 'var(--color-text-red)' }}
                  onClick={() => setTimeout(() => setShowCancelDialog(true), 0)}
                />
              </DropdownMenu>
            </DisabledActionTooltip>
          )}
          {/* FUT-559: close sits at the far right of the header as a borderless ghost icon —
              same idiom as every other dialog's dismiss. */}
          <IconButton
            type="button"
            variant="ghost"
            onClick={requestClose}
            label="Close dialog"
            icon={<X className="size-4" />}
            className="shrink-0 text-secondary"
          />
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-auto bg-card">
        <div className="grid grid-cols-1 gap-5 p-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-5">
            {/* Full job description */}
            <section
              id="full-job-description"
              className="rounded-xl border border-border bg-body p-5"
            >
              <h1 className="mb-4 text-lg font-semibold text-primary">Job description</h1>
              {!hasAnyDetail ? (
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
                            className="rounded-md border border-border bg-surface px-3 py-1.5 text-base text-secondary"
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
                        <div
                          className={`mb-1 font-semibold ${s.key === 'nice_to_have' ? 'text-secondary' : 'text-primary'}`}
                        >
                          {s.label}
                        </div>
                        <RichTextDisplay value={body} />
                      </div>
                    );
                  })}
                </div>
              )}
              <p className="mt-5 text-sm text-secondary">
                Posted {req.created_at.slice(0, 10)} · {openDaysLabel(req.created_at)}
              </p>
            </section>

            {/* Applicants — active pipeline only; a transferred/rejected candidate drops to the
                dimmed "Past applicants" trail below instead of lingering in this role's list. */}
            <section className="rounded-xl border border-border bg-body p-5">
              <div className="mb-1 flex items-center justify-between">
                <h2 className="font-semibold text-primary">
                  Applicants ({activeApplicants.length})
                </h2>
              </div>
              {activeApplicants.length === 0 ? (
                <p className="py-4 text-base text-secondary">
                  {pastApplicants.length > 0 ? 'No active applicants.' : 'No applicants yet.'}
                </p>
              ) : (
                <div className="divide-y divide-border">
                  {activeApplicants.slice(0, 5).map((a) => renderApplicant(a))}
                </div>
              )}
              {pastApplicants.length > 0 && (
                <div className="mt-4 border-t border-border pt-3">
                  <div className="mb-1 text-sm font-medium text-secondary">
                    Past applicants ({pastApplicants.length})
                  </div>
                  <div className="divide-y divide-border opacity-70">
                    {pastApplicants.slice(0, 5).map((a) => renderApplicant(a))}
                  </div>
                </div>
              )}
            </section>
          </div>

          <div className="space-y-5">
            {/* Timeline */}
            <section className="rounded-xl border border-border bg-body p-5">
              <h2 className="mb-4 font-semibold text-primary">Timeline</h2>
              <div className="space-y-4">
                <DateField label="Start date" value={req.start_date} />
                <DateField
                  label="Due date"
                  value={req.due_date}
                  extra={
                    req.due_date && (
                      <span
                        className={`ml-1.5 text-base ${
                          daysLeft(req.due_date) < 0 ? 'text-error' : 'text-warning'
                        }`}
                      >
                        (
                        {daysLeft(req.due_date) >= 0
                          ? `${daysLeft(req.due_date)} days left`
                          : `${-daysLeft(req.due_date)}d overdue`}
                        )
                      </span>
                    )
                  }
                />
              </div>
            </section>

            {/* Job details */}
            <section className="rounded-xl border border-border bg-body p-5">
              <h2 className="mb-3 font-semibold text-primary">Job details</h2>
              <div className="space-y-2.5">
                <DetailRow label="Account" value={data.account_name ?? '—'} />
                <DetailRow label="Project" value={data.project_name ?? '—'} />
                <DetailRow
                  label="Type"
                  value={req.kind === 'replacement' ? 'Replacement' : 'New'}
                />
              </div>
            </section>

            {/* Quick actions */}
            <section className="rounded-xl border border-border bg-body p-5">
              <h2 className="mb-3 font-semibold text-primary">Quick actions</h2>
              <div className="grid grid-cols-2 gap-2">
                <DisabledActionTooltip
                  disabled={!canManage || isOnHold}
                  reason={!canManage ? PERMISSION_DENIED.requisition.edit : onHoldReason}
                  className="w-full"
                >
                  <QuickAction
                    icon={<Pencil className="size-4" aria-hidden />}
                    label="Edit JD"
                    onClick={startEditing}
                    disabled={!canManage || isOnHold}
                  />
                </DisabledActionTooltip>
                <QuickAction
                  icon={<Share2 className="size-4" aria-hidden />}
                  label="Share Job"
                  onClick={shareJob}
                />
              </div>
            </section>
          </div>
        </div>
      </div>
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
