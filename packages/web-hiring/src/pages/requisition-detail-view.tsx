import {
  Avatar,
  Badge,
  Banner,
  Button,
  Calendar,
  DateInput,
  DisabledActionTooltip,
  DropdownMenu,
  DropdownMenuItem,
  EmptyState,
  IconButton,
  Input,
  Popover,
  RichTextDisplay,
  RichTextEditor,
  SegmentedControl,
  SegmentedControlItem,
  Selector,
  useToast,
} from '@seta/shared-ui';
import { usePermission } from '@seta/web-identity';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Calendar as CalendarIcon, MoreHorizontal, Pencil, Share2, X } from 'lucide-react';
import { type ReactNode, useState } from 'react';
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
    <div className="flex items-center justify-between gap-3 text-body-sm">
      <span className="text-ink-muted">{label}</span>
      <span className="font-medium text-ink">{value}</span>
    </div>
  );
}

function DateField({
  label,
  value,
  editable,
  canManage,
  onChange,
  extra,
}: {
  label: string;
  value: string | null;
  editable: boolean;
  canManage: boolean;
  onChange: (value: string) => void;
  extra?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex items-start gap-3">
      <CalendarIcon className="mt-0.5 size-4 shrink-0 text-ink-subtle" aria-hidden />
      <div>
        <div className="text-caption text-ink-muted">{label}</div>
        <DisabledActionTooltip
          disabled={!editable}
          reason={
            !canManage
              ? PERMISSION_DENIED.requisition.edit
              : 'Only editable while the requisition is open.'
          }
        >
          {editable ? (
            <Popover
              isOpen={open}
              onOpenChange={setOpen}
              alignment="start"
              label="Set date"
              content={
                <Calendar
                  mode="single"
                  value={value ?? undefined}
                  onChange={(v) => {
                    onChange(v);
                    setOpen(false);
                  }}
                />
              }
            >
              <Button
                type="button"
                variant="ghost"
                size="sm"
                label={value ? formatDate(value) : 'Set date'}
              />
            </Popover>
          ) : (
            <span className="text-body-sm font-medium text-ink">
              {value ? formatDate(value) : '—'}
            </span>
          )}
        </DisabledActionTooltip>
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
  const [editVariant, setEditVariant] = useState<JdVariant>('external');
  const [sections, setSections] = useState<SectionGrid>(emptySections());
  const [skills, setSkills] = useState<PickedSkill[]>([]);
  const [showFillConfirm, setShowFillConfirm] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  // ISO date strings (yyyy-mm-dd from <input type="date">) compare correctly with `<`.
  const dateError = start && due && start >= due ? 'Start date must be before due date.' : null;
  const missingRequired = !title.trim() || isRichTextEmpty(sections.about);
  const requiredError =
    submitAttempted && missingRequired
      ? !title.trim() && isRichTextEmpty(sections.about)
        ? 'Job title and About the role are required.'
        : !title.trim()
          ? 'Job title is required.'
          : 'About the role is required.'
      : null;

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
  const setDate = useMutation({
    mutationFn: (patch: { start_date?: string; due_date?: string }) =>
      editRequisition(requisitionId, {
        expected_version: data?.requisition.version,
        patch,
      }),
    onSuccess: refresh,
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
    if (missingRequired || dateError) return;
    save.mutate();
  }

  function cancelEditing() {
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
        <div className="p-6 text-ink-muted">Loading…</div>
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
  // Same "on hold/terminal freezes everything" rule the board card uses — dates only move
  // while the requisition is actively open.
  const datesEditable = canManage && req.status === 'open';

  // The board list's row (already fetched for the page this modal is opened from) carries
  // candidate name/role/applied-date that the detail endpoint's bare application rows don't
  // — reuse it instead of a second round-trip. Falls back to nothing if opened without that
  // cache warm (e.g. a direct link), and only "at Company" is skipped since no such field
  // exists on a candidate.
  const cachedRow = queryClient
    .getQueryData<OpenRequisitionsBoard>(hiringKeys.requisitions())
    ?.requisitions.find((r) => r.id === requisitionId);
  const applicantRows = cachedRow?.applicants ?? [];

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
        <header className="flex items-start justify-between gap-4 border-b border-hairline bg-canvas px-6 py-4">
          <div className="min-w-0">
            <h1 className="truncate text-section-title font-semibold text-ink">{title}</h1>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                label="Cancel"
                onClick={cancelEditing}
                isDisabled={save.isPending}
              />
              <Button
                size="sm"
                label={save.isPending ? 'Updating…' : 'Update'}
                onClick={submitEdit}
                isDisabled={save.isPending}
              />
            </div>
            {requiredError && <p className="text-caption text-danger-ink">{requiredError}</p>}
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-auto">
          <div className="mx-auto max-w-[720px] space-y-5 px-6 py-5">
            <div className="space-y-1">
              <Input
                label="Job title"
                isRequired
                value={title}
                onChange={(value) => setTitle(value)}
              />
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
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <DateInput
                  label="Start date"
                  value={start || undefined}
                  max={due || undefined}
                  onChange={(v) => setStart(v ?? '')}
                />
              </div>
              <div className="space-y-1">
                <DateInput
                  label="Due date"
                  value={due || undefined}
                  min={start || undefined}
                  onChange={(v) => setDue(v ?? '')}
                />
              </div>
            </div>
            {dateError && <p className="text-body-sm text-danger-ink">{dateError}</p>}

            <SkillPicker value={skills} onChange={setSkills} />

            <div className="flex items-center justify-between">
              <div className="text-caption font-semibold uppercase text-ink-muted">JD detail</div>
              <SegmentedControl
                label="JD variant"
                value={editVariant}
                onChange={(v) => setEditVariant(v as JdVariant)}
              >
                <SegmentedControlItem value="external" label="External" />
                <SegmentedControlItem value="internal" label="Internal" />
              </SegmentedControl>
            </div>

            {SECTIONS.map((s) => (
              <div key={s.key}>
                <div
                  className={`mb-1 font-semibold ${s.key === 'nice_to_have' ? 'text-ink-muted' : 'text-ink'}`}
                >
                  {s.key === 'about' ? 'About the role *' : s.label}
                </div>
                <RichTextEditor
                  value={sections[s.key]}
                  onChange={(html) => setSections((g) => ({ ...g, [s.key]: html }))}
                  placeholder={
                    s.key === 'about'
                      ? 'Write the about section…'
                      : `Write the ${s.label.toLowerCase()}…`
                  }
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col overflow-hidden ${variant === 'modal' ? 'min-h-0 flex-1' : 'h-full'}`}
    >
      <header className="flex items-start justify-between gap-4 border-b border-hairline bg-canvas px-6 py-4">
        <div className="flex min-w-0 items-start gap-3">
          <IconButton
            type="button"
            variant="secondary"
            onClick={requestClose}
            label="Close dialog"
            icon={<X className="size-4" />}
            className="mt-0.5 shrink-0"
          />
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
              <DropdownMenu
                placement="below"
                button={{
                  variant: 'secondary',
                  size: 'sm',
                  label: 'More actions',
                  icon: <MoreHorizontal className="size-4" />,
                  isDisabled: !canManage && !canClose,
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
                  style={{ color: 'var(--color-danger-ink)' }}
                  onClick={() => setTimeout(() => setShowCancelDialog(true), 0)}
                />
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
                            variant="neutral"
                            className="rounded-md border border-hairline bg-surface-2 px-3 py-1.5 text-body-sm text-ink-muted"
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
                <h2 className="font-semibold text-ink">Applicants ({data.applicants.length})</h2>
              </div>
              {applicantRows.length === 0 ? (
                <p className="py-4 text-body-sm text-ink-subtle">No applicants yet.</p>
              ) : (
                <div className="divide-y divide-hairline">
                  {applicantRows.slice(0, 5).map((a) => (
                    <div
                      key={`${a.name}-${a.applied_date}`}
                      className="flex items-center gap-3 py-3"
                    >
                      <Avatar name={a.name} size={36} />
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
                          APPLICANT_STAGE_BADGE[a.stage] ?? 'bg-surface-2 text-ink-muted'
                        }`}
                      >
                        {APPLICANT_STAGE_LABEL[a.stage] ?? a.stage}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          <div className="space-y-5">
            {/* Timeline */}
            <section className="rounded-xl border border-hairline bg-canvas p-5">
              <h2 className="mb-4 font-semibold text-ink">Timeline</h2>
              <div className="space-y-4">
                <DateField
                  label="Start date"
                  value={req.start_date}
                  editable={datesEditable}
                  canManage={canManage}
                  onChange={(start_date) => setDate.mutate({ start_date })}
                />
                <DateField
                  label="Due date"
                  value={req.due_date}
                  editable={datesEditable}
                  canManage={canManage}
                  onChange={(due_date) => setDate.mutate({ due_date })}
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
                  disabled={!canManage}
                  reason={PERMISSION_DENIED.requisition.edit}
                  className="w-full"
                >
                  <QuickAction
                    icon={<Pencil className="size-4" aria-hidden />}
                    label="Edit JD"
                    onClick={startEditing}
                    disabled={!canManage}
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
    </div>
  );
}
