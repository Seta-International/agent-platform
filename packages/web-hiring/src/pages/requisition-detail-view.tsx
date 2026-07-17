import {
  Alert,
  AlertDescription,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Avatar,
  AvatarFallback,
  Badge,
  Button,
  DisabledActionTooltip,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  Input,
  Label,
  RichTextDisplay,
  RichTextEditor,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@seta/shared-ui';
import { usePermission } from '@seta/web-identity';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Calendar as CalendarIcon, MoreHorizontal, Pencil, Share2, X } from 'lucide-react';
import { type ReactNode, useRef, useState } from 'react';
import {
  editRequisition,
  fetchAccounts,
  fetchProjects,
  holdRequisition,
  type JdSectionKey,
  type JdVariant,
  type OpenRequisitionsBoard,
  resumeRequisition,
  setRequisitionJd,
  setRequisitionSkills,
} from '../api/hiring-client.ts';
import { GRADES } from '../lib/grades.ts';
import { PERMISSION_DENIED } from '../lib/permission-messages.ts';
import { hiringKeys } from '../state/query-keys.ts';
import { CancelRequisitionDialog } from './cancel-requisition-dialog.tsx';
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

// Order-insensitive fingerprint of a skill set — change detection for save and dirty checks.
function skillsSignature(list: { skill_id: string; level?: number }[]): string {
  return [...list]
    .sort((a, b) => a.skill_id.localeCompare(b.skill_id))
    .map((s) => `${s.skill_id}:${s.level ?? ''}`)
    .join('|');
}

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
  new: 'bg-success-tint text-success-ink',
  screening: 'bg-surface-2 text-ink-muted',
  interview: 'bg-primary/12 text-primary',
  offer: 'bg-warning-tint text-warning-ink',
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
// rejected applicant reads as still "Screening" and the count disagrees with the Candidates
// board (which lists only active + hired).
const APPLICANT_STATUS_BADGE: Record<string, string> = {
  hired: 'bg-success-tint text-success-ink',
  rejected: 'bg-danger-tint text-danger-ink',
  transferred: 'bg-surface-2 text-ink-muted',
  cancelled: 'bg-surface-2 text-ink-muted',
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

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
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
    <div className="flex items-center justify-between gap-3 text-body-sm">
      <span className="text-ink-muted">{label}</span>
      <span className="font-medium text-ink">{value}</span>
    </div>
  );
}

// Read-only: dates change only through the full edit form (Edit JD), not inline here.
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
      <CalendarIcon className="mt-0.5 size-4 shrink-0 text-ink-subtle" aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="text-caption text-ink-muted">{label}</div>
        <span className="text-body-sm font-medium text-ink">{value ? formatDate(value) : '—'}</span>
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
      className={`flex w-full flex-col items-center gap-2 rounded-lg border border-hairline px-2 py-3 text-center text-caption font-medium hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50 ${
        destructive ? 'text-danger-ink' : 'text-ink'
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
  const [editVariant, setEditVariant] = useState<JdVariant>('external');
  const [sections, setSections] = useState<SectionGrid>(emptySections());
  const [skills, setSkills] = useState<PickedSkill[]>([]);
  const [moreActionsOpen, setMoreActionsOpen] = useState(false);
  const [showFillConfirm, setShowFillConfirm] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  // 'cancel' backs out of edit mode, 'close' also dismisses the panel — both ask first
  // when there are unsaved edits.
  const [confirmDiscard, setConfirmDiscard] = useState<'cancel' | 'close' | null>(null);
  // Local-midnight today as yyyy-mm-dd — toISOString() alone is UTC and drifts a day
  // around midnight for non-UTC users.
  const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10);
  const originalStart = data?.requisition.start_date ?? '';
  const originalDue = data?.requisition.due_date ?? '';
  // ISO date strings (yyyy-mm-dd from <input type="date">) compare correctly with `<`.
  // "Not in the past" only applies to values the user changes — a requisition whose stored
  // dates have since passed must stay editable (title fixes etc.) without forced re-dating.
  const startError =
    start && start !== originalStart && start < today ? 'Start date cannot be in the past.' : null;
  const dueError = !due
    ? null
    : start && due < start
      ? 'Due date must be on or after the start date.'
      : !start && due !== originalDue && due < today
        ? 'Due date cannot be in the past.'
        : null;
  const missingRequired = !title.trim() || isRichTextEmpty(sections.about);
  // Same required-field feedback as NewRequisitionDialog: red border + scroll-to on
  // Update, no warning text; the highlight clears live as the user types.
  const titleInvalid = submitAttempted && !title.trim();
  const aboutInvalid = submitAttempted && isRichTextEmpty(sections.about);
  const titleRef = useRef<HTMLInputElement>(null);
  const aboutRef = useRef<HTMLDivElement>(null);
  const startDateRef = useRef<HTMLInputElement>(null);
  const dueDateRef = useRef<HTMLInputElement>(null);

  // Unsaved edits worth keeping? Cancel and panel-close ask before throwing them away.
  const originalSections = emptySections();
  if (data) {
    for (const s of data.jd_sections)
      if (s.variant === editVariant) originalSections[s.section] = s.body;
  }
  const editDirty =
    editing &&
    data !== undefined &&
    (title !== data.requisition.title ||
      grade !== (data.requisition.grade ?? '') ||
      kind !== data.requisition.kind ||
      mode !== (data.requisition.default_interview_mode ?? 'online') ||
      accountId !== (data.requisition.account_id ?? '') ||
      projectId !== (data.requisition.project_id ?? '') ||
      start !== originalStart ||
      due !== originalDue ||
      SECTIONS.some((s) => sections[s.key] !== originalSections[s.key]) ||
      skillsSignature(skills) !==
        skillsSignature(
          data.skills
            .filter((s): s is typeof s & { skill_id: string } => s.skill_id != null)
            .map((s) => ({ skill_id: s.skill_id, level: s.min_level ?? undefined })),
        ));

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
    on409(e, queryClient, hiringKeys.requisition(requisitionId));
  }

  const pause = useMutation({
    mutationFn: () =>
      holdRequisition(requisitionId, {
        expected_version: data?.requisition.version,
      }),
    onSuccess: () => {
      toast.success('Requisition paused');
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
      toast.success('Requisition resumed');
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
      const skillsChanged = skillsSignature(skills) !== skillsSignature(originalSkills);
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
      toast.success('Saved');
      setEditing(false);
      refresh();
    },
    onError: (e: Error) => on409(e, queryClient, hiringKeys.requisition(requisitionId)),
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
    if (missingRequired) {
      const target = !title.trim() ? titleRef.current : aboutRef.current;
      target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (!title.trim()) titleRef.current?.focus({ preventScroll: true });
      return;
    }
    if (startError || dueError) {
      const target = startError ? startDateRef.current : dueDateRef.current;
      target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      target?.focus({ preventScroll: true });
      return;
    }
    save.mutate();
  }

  function cancelEditing() {
    if (editDirty) setConfirmDiscard('cancel');
    else setEditing(false);
  }

  function requestClose() {
    if (editDirty) {
      setConfirmDiscard('close');
      return;
    }
    setEditing(false);
    onClose?.();
  }

  function discardConfirmed() {
    const also = confirmDiscard;
    setConfirmDiscard(null);
    setEditing(false);
    if (also === 'close') onClose?.();
  }

  function shareJob() {
    const url = `${window.location.origin}/hiring/requisitions?selectedRequisitionId=${requisitionId}`;
    void navigator.clipboard.writeText(url);
    toast.success('Link copied to clipboard');
  }

  if (isLoading) {
    return (
      <div className="flex flex-col overflow-hidden">
        <div className="p-6 text-ink-muted">Loading…</div>
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="flex flex-col overflow-hidden p-6">
        <Alert variant="destructive">
          <AlertDescription>{(error as Error)?.message ?? 'Not found'}</AlertDescription>
        </Alert>
      </div>
    );
  }

  const req = data.requisition;
  const isTerminal = req.status === 'filled' || req.status === 'cancelled';
  const isOnHold = req.status === 'on_hold';
  const onHoldReason =
    'This requisition is on hold — resume it from the Requisitions board to make changes.';

  // The board list's row (already fetched for the page this modal is opened from) carries
  // candidate name/role/applied-date that the detail endpoint's bare application rows don't
  // — reuse it instead of a second round-trip. Falls back to nothing if opened without that
  // cache warm (e.g. a direct link), and only "at Company" is skipped since no such field
  // exists on a candidate. The board list is active-pipeline-only.
  const cachedRow = queryClient
    .getQueryData<OpenRequisitionsBoard>(hiringKeys.requisitions())
    ?.requisitions.find((r) => r.id === requisitionId);
  const applicantRows = (cachedRow?.applicants ?? []).filter((a) => a.status === 'active');
  // Closed applications (transferred/rejected/…) come from the detail read — shown as a
  // dimmed trail so "where did X go?" is answered in place without inflating the count.
  const activeCount = data.applicants.filter((a) => a.status === 'active').length;
  const pastApplicants = data.applicants.filter(
    (a) => a.status !== 'active' && a.status !== 'hired',
  );

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
    // Same chrome as NewRequisitionDialog (FUT-404): title-only header, form column,
    // footer actions bottom-right. data-req-editing lets the modal wrapper narrow the
    // panel to the New-requisition width.
    return (
      <div
        data-req-editing=""
        className={`flex flex-col overflow-hidden ${variant === 'modal' ? 'min-h-0 flex-1' : 'h-full'}`}
      >
        <header className="border-b border-hairline bg-canvas px-6 py-3">
          <h1 className="truncate text-section-title font-semibold text-ink">{title}</h1>
        </header>
        <div className="min-h-0 flex-1 overflow-auto">
          <div className="mx-auto w-full max-w-[760px] space-y-5 px-6 pb-5 pt-3">
            <div className="space-y-1">
              <Label htmlFor="jd-title">Job title *</Label>
              <Input
                id="jd-title"
                ref={titleRef}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                aria-invalid={titleInvalid}
                className={titleInvalid ? '!border-danger' : undefined}
              />
              {titleInvalid && (
                <p className="text-caption text-danger-ink">Job title is required.</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="jd-grade">Grade</Label>
                <Select value={grade} onValueChange={setGrade}>
                  <SelectTrigger id="jd-grade" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GRADES.map((g) => (
                      <SelectItem key={g} value={g}>
                        {g}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="jd-type">Type</Label>
                <Select value={kind} onValueChange={(v) => setKind(v as 'new' | 'replacement')}>
                  <SelectTrigger id="jd-type" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">New</SelectItem>
                    <SelectItem value="replacement">Replacement</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="jd-account">Account</Label>
                <Select
                  value={accountId}
                  onValueChange={(v) => {
                    setAccountId(v);
                    setProjectId('');
                  }}
                >
                  <SelectTrigger id="jd-account" className="w-full">
                    <SelectValue placeholder="No account" />
                  </SelectTrigger>
                  <SelectContent>
                    {(accounts ?? []).map((a) => (
                      <SelectItem key={a.account_id} value={a.account_id}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="jd-project">Project</Label>
                <Select value={projectId} onValueChange={setProjectId} disabled={!accountId}>
                  <SelectTrigger id="jd-project" className="w-full">
                    <SelectValue placeholder={accountId ? 'No project' : 'Pick an account first'} />
                  </SelectTrigger>
                  <SelectContent>
                    {(projects ?? []).map((p) => (
                      <SelectItem key={p.project_id} value={p.project_id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="jd-mode">Interview mode</Label>
                <Select
                  value={mode}
                  onValueChange={(v) => setMode(v as 'online' | 'onsite' | 'either')}
                >
                  <SelectTrigger id="jd-mode" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="online">Online (Teams)</SelectItem>
                    <SelectItem value="onsite">Onsite</SelectItem>
                    <SelectItem value="either">Either</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="jd-start">Start date</Label>
                <Input
                  id="jd-start"
                  ref={startDateRef}
                  type="date"
                  value={start}
                  min={today}
                  max={due || undefined}
                  onChange={(e) => setStart(e.target.value)}
                  aria-invalid={!!startError}
                  className={startError ? '!border-danger' : undefined}
                />
                {startError && <p className="text-caption text-danger-ink">{startError}</p>}
              </div>
              <div className="space-y-1">
                <Label htmlFor="jd-due">Due date</Label>
                <Input
                  id="jd-due"
                  ref={dueDateRef}
                  type="date"
                  value={due}
                  min={start || today}
                  onChange={(e) => setDue(e.target.value)}
                  aria-invalid={!!dueError}
                  className={dueError ? '!border-danger' : undefined}
                />
                {dueError && <p className="text-caption text-danger-ink">{dueError}</p>}
              </div>
            </div>

            <SkillPicker value={skills} onChange={setSkills} />

            {/* External/Internal variant switcher is temporarily hidden (same as the New
                form) — edits keep whichever variant the requisition's content already uses. */}
            <div className="text-caption font-semibold uppercase text-ink-muted">JD detail</div>

            {SECTIONS.map((s) => (
              <div key={s.key} ref={s.key === 'about' ? aboutRef : undefined}>
                <div
                  className={`mb-1 font-semibold ${s.key === 'nice_to_have' ? 'text-ink-muted' : 'text-ink'}`}
                >
                  {s.key === 'about' ? 'About the role *' : s.label}
                </div>
                <RichTextEditor
                  value={sections[s.key]}
                  onChange={(html) => setSections((g) => ({ ...g, [s.key]: html }))}
                  className={s.key === 'about' && aboutInvalid ? '!border-danger' : undefined}
                  placeholder={
                    s.key === 'about'
                      ? 'Write the about section…'
                      : `Write the ${s.label.toLowerCase()}…`
                  }
                />
                {s.key === 'about' && aboutInvalid && (
                  <p className="mt-1 text-caption text-danger-ink">About the role is required.</p>
                )}
              </div>
            ))}
          </div>
        </div>
        <footer className="border-t border-hairline bg-canvas px-6 py-3">
          <div className="flex items-center justify-end gap-2">
            <Button variant="secondary" onClick={cancelEditing} disabled={save.isPending}>
              Cancel
            </Button>
            <Button onClick={submitEdit} disabled={save.isPending}>
              {save.isPending ? 'Updating…' : 'Update'}
            </Button>
          </div>
        </footer>
        <AlertDialog
          open={confirmDiscard !== null}
          onOpenChange={(v) => {
            if (!v) setConfirmDiscard(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Discard your changes?</AlertDialogTitle>
              <AlertDialogDescription>
                Your edits to this requisition will be lost. This can't be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep editing</AlertDialogCancel>
              <AlertDialogAction onClick={discardConfirmed}>Discard</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col overflow-hidden ${variant === 'modal' ? 'min-h-0 flex-1' : 'h-full'}`}
    >
      <header className="flex items-start justify-between gap-4 border-b border-hairline bg-canvas px-6 py-4">
        <div className="flex min-w-0 items-start gap-3">
          <button
            type="button"
            onClick={requestClose}
            aria-label="Close dialog"
            className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-hairline text-ink-muted hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-focus"
          >
            <X className="size-4" />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-section-title font-semibold text-ink">{req.title}</h1>
              <span
                className={`shrink-0 rounded-full px-2.5 py-1 text-caption font-medium ${STATUS_BADGE_CLASS[req.status]}`}
              >
                {STATUS_LABEL[req.status]}
              </span>
            </div>
            {subtitle && <p className="mt-0.5 truncate text-body-sm text-ink-muted">{subtitle}</p>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {!isTerminal && (
            <DisabledActionTooltip
              disabled={!canManage && !canClose}
              reason={PERMISSION_DENIED.requisition.manage}
            >
              <DropdownMenu open={moreActionsOpen} onOpenChange={setMoreActionsOpen}>
                <DropdownMenuTrigger asChild>
                  <Button variant="secondary" size="sm" disabled={!canManage && !canClose}>
                    <MoreHorizontal className="mr-1.5 size-4" />
                    More actions
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {req.status === 'open' && (
                    <DropdownMenuItem disabled={!canManage} onSelect={() => pause.mutate()}>
                      Pause
                    </DropdownMenuItem>
                  )}
                  {req.status === 'on_hold' && (
                    <DropdownMenuItem disabled={!canManage} onSelect={() => resume.mutate()}>
                      Resume
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    disabled={!canClose}
                    onSelect={(e) => {
                      e.preventDefault();
                      setMoreActionsOpen(false);
                      setTimeout(() => setShowFillConfirm(true), 150);
                    }}
                  >
                    Mark filled
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={!canClose}
                    className="text-danger-ink"
                    onSelect={(e) => {
                      e.preventDefault();
                      setMoreActionsOpen(false);
                      setTimeout(() => setShowCancelDialog(true), 150);
                    }}
                  >
                    Cancel
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </DisabledActionTooltip>
          )}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-auto bg-surface-1">
        <div className="grid grid-cols-1 gap-5 p-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-5">
            {/* Full job description */}
            <section
              id="full-job-description"
              className="rounded-xl border border-hairline bg-canvas p-5"
            >
              <h1 className="mb-4 text-section-title font-semibold text-ink">Job description</h1>
              {!hasAnyDetail ? (
                req.note?.trim() ? (
                  <p className="text-body-sm text-ink">{req.note}</p>
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
                      <div className="mb-2 font-semibold text-ink">Tech stack</div>
                      <div className="flex flex-wrap gap-2">
                        {data.skills.map((s) => (
                          <Badge
                            key={s.skill_name}
                            variant="secondary"
                            className="rounded-md border border-hairline bg-surface-2 px-3 py-1.5 text-body-sm text-ink-muted"
                          >
                            {s.skill_name}
                            {s.min_level ? ` · ${LEVEL_LABEL[s.min_level] ?? s.min_level}` : ''}
                          </Badge>
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
                          className={`mb-1 font-semibold ${s.key === 'nice_to_have' ? 'text-ink-muted' : 'text-ink'}`}
                        >
                          {s.label}
                        </div>
                        <RichTextDisplay value={body} />
                      </div>
                    );
                  })}
                </div>
              )}
              <p className="mt-5 text-caption text-ink-subtle">
                Posted {req.created_at.slice(0, 10)} · {openDaysLabel(req.created_at)}
              </p>
            </section>

            {/* Applicants */}
            <section className="rounded-xl border border-hairline bg-canvas p-5">
              <div className="mb-1 flex items-center justify-between">
                <h2 className="font-semibold text-ink">Applicants ({activeCount})</h2>
              </div>
              {applicantRows.length === 0 ? (
                <p className="py-4 text-body-sm text-ink-subtle">
                  {pastApplicants.length > 0 ? 'No active applicants.' : 'No applicants yet.'}
                </p>
              ) : (
                <div className="divide-y divide-hairline">
                  {applicantRows.slice(0, 5).map((a) => (
                    <div
                      key={`${a.name}-${a.applied_date}`}
                      className="flex items-center gap-3 py-3"
                    >
                      <Avatar className="size-9">
                        <AvatarFallback className="bg-primary/15 text-caption font-semibold text-primary">
                          {initialsOf(a.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium text-ink">{a.name}</div>
                        <div className="truncate text-body-sm text-ink-muted">
                          {[a.role, `Applied ${relativeDays(a.applied_date)}`]
                            .filter(Boolean)
                            .join(' · ')}
                        </div>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2.5 py-1 text-caption font-medium ${
                          (a.status !== 'active'
                            ? APPLICANT_STATUS_BADGE[a.status]
                            : APPLICANT_STAGE_BADGE[a.stage]) ?? 'bg-surface-2 text-ink-muted'
                        }`}
                      >
                        {a.status !== 'active'
                          ? (APPLICANT_STATUS_LABEL[a.status] ?? a.status)
                          : (APPLICANT_STAGE_LABEL[a.stage] ?? a.stage)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {pastApplicants.length > 0 && (
                <div className="mt-2 border-t border-hairline pt-3 opacity-70">
                  <div className="mb-1 text-caption font-semibold uppercase text-ink-muted">
                    Past applicants ({pastApplicants.length})
                  </div>
                  <div className="divide-y divide-hairline">
                    {pastApplicants.map((a) => (
                      <div key={a.id} className="flex items-center gap-3 py-2">
                        <span className="min-w-0 flex-1 truncate text-body-sm text-ink-muted">
                          {a.candidate_name ?? 'Internal applicant'}
                        </span>
                        <span
                          className={`shrink-0 rounded-full px-2.5 py-0.5 text-caption font-medium ${
                            APPLICANT_STATUS_BADGE[a.status ?? ''] ?? 'bg-surface-2 text-ink-muted'
                          }`}
                        >
                          {APPLICANT_STATUS_LABEL[a.status ?? ''] ?? a.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>
          </div>

          <div className="space-y-5">
            {/* Timeline */}
            <section className="rounded-xl border border-hairline bg-canvas p-5">
              <h2 className="mb-4 font-semibold text-ink">Timeline</h2>
              <div className="space-y-4">
                <DateField label="Start date" value={req.start_date} />
                <DateField
                  label="Due date"
                  value={req.due_date}
                  extra={
                    req.due_date && (
                      <span
                        className={`ml-1.5 text-body-sm ${
                          daysLeft(req.due_date) < 0 ? 'text-danger-ink' : 'text-warning-ink'
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
            <section className="rounded-xl border border-hairline bg-canvas p-5">
              <h2 className="mb-3 font-semibold text-ink">Job details</h2>
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
            <section className="rounded-xl border border-hairline bg-canvas p-5">
              <h2 className="mb-3 font-semibold text-ink">Quick actions</h2>
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
                <DisabledActionTooltip disabled={isOnHold} reason={onHoldReason} className="w-full">
                  <QuickAction
                    icon={<Share2 className="size-4" aria-hidden />}
                    label="Share Job"
                    onClick={shareJob}
                    disabled={isOnHold}
                  />
                </DisabledActionTooltip>
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
    </div>
  );
}
