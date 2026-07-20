import {
  AlertDialog,
  Banner,
  Button,
  DateInput,
  Dialog,
  DialogHeader,
  DisabledActionTooltip,
  HStack,
  Input,
  Layout,
  LayoutContent,
  LayoutFooter,
  NumberInput,
  RichTextEditor,
  Selector,
  useToast,
} from '@seta/shared-ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useRef, useState } from 'react';
import {
  fetchAccounts,
  fetchProjects,
  type JdSectionKey,
  type JdVariant,
  openRequisition,
} from '../api/hiring-client.ts';
import { GRADES } from '../lib/grades.ts';
import { PERMISSION_DENIED } from '../lib/permission-messages.ts';
import { hiringKeys } from '../state/query-keys.ts';
import { isRichTextEmpty } from './requisition-format.ts';
import { type PickedSkill, SkillPicker } from './skill-picker.tsx';

// Mirrors RequisitionDetailView's editing-mode SECTIONS — kept in sync by hand so the
// create and edit forms read as the same layout (see FUT-404).
const SECTIONS: { key: JdSectionKey; label: string }[] = [
  { key: 'about', label: 'About the role' },
  { key: 'responsibilities', label: 'Responsibilities' },
  { key: 'requirements', label: 'Requirements' },
  { key: 'nice_to_have', label: 'Nice to have' },
];

export function NewRequisitionDialog({ disabled = false }: { disabled?: boolean }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [grade, setGrade] = useState('L4');
  const [kind, setKind] = useState<'new' | 'replacement'>('new');
  const [mode, setMode] = useState<'online' | 'onsite' | 'either'>('online');
  const [accountId, setAccountId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [start, setStart] = useState('');
  const [due, setDue] = useState('');
  const [headcount, setHeadcount] = useState(1);
  const [skills, setSkills] = useState<PickedSkill[]>([]);
  const [variant, setVariant] = useState<JdVariant>('internal');
  const [jd, setJd] = useState<Record<JdSectionKey, string>>({
    about: '',
    responsibilities: '',
    requirements: '',
    nice_to_have: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const missingRequired = !title.trim() || isRichTextEmpty(jd.about);
  // FUT-559 error focus: red per-field message + scroll to the first empty required field.
  const titleFieldRef = useRef<HTMLDivElement>(null);
  const aboutFieldRef = useRef<HTMLDivElement>(null);
  const titleInvalid = submitAttempted && !title.trim();
  const aboutInvalid = submitAttempted && isRichTextEmpty(jd.about);
  // FUT-559 date bounds: a new requisition can't start in the past, and due must land on or
  // after the start. yyyy-mm-dd ISO strings compare lexically; use local-midnight today.
  const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10);
  const startInPast = !!start && start < today;
  const dueBeforeStart = !!due && (due < today || (!!start && due < start));
  const startError = submitAttempted && startInPast ? 'Start date cannot be in the past.' : null;
  const dueError =
    submitAttempted && dueBeforeStart
      ? start && due < start
        ? 'Due date must be on or after the start date.'
        : 'Due date cannot be in the past.'
      : null;
  // Unsaved-input guard: confirm before dismissing a form the recruiter has started.
  const dirty = !!(
    title.trim() ||
    start ||
    due ||
    accountId ||
    projectId ||
    skills.length ||
    grade !== 'L4' ||
    headcount !== 1 ||
    kind !== 'new' ||
    mode !== 'online' ||
    variant !== 'internal' ||
    SECTIONS.some((s) => !isRichTextEmpty(jd[s.key]))
  );

  const { data: accounts } = useQuery({
    queryKey: hiringKeys.accounts(),
    queryFn: fetchAccounts,
    enabled: open,
  });
  const { data: projects } = useQuery({
    queryKey: hiringKeys.projects(accountId || undefined),
    queryFn: () => fetchProjects(accountId || undefined),
    enabled: open && !!accountId,
  });

  function reset() {
    setTitle('');
    setGrade('L4');
    setKind('new');
    setMode('online');
    setAccountId('');
    setProjectId('');
    setStart('');
    setDue('');
    setHeadcount(1);
    setSkills([]);
    setVariant('internal');
    setJd({
      about: '',
      responsibilities: '',
      requirements: '',
      nice_to_have: '',
    });
    setError(null);
    setSubmitAttempted(false);
    setConfirmDiscard(false);
  }

  // Radix only fires onOpenChange for its own dismissals (Esc, overlay); closing
  // programmatically must reset explicitly or the next open shows stale data.
  function close() {
    setOpen(false);
    reset();
  }

  function handleOpenChange(v: boolean) {
    // FUT-559: don't drop a form the recruiter has started — ask first.
    if (!v && dirty) {
      setConfirmDiscard(true);
      return;
    }
    setOpen(v);
    if (!v) reset();
  }

  const mutation = useMutation({
    mutationFn: () => {
      const jd_sections = SECTIONS.filter((s) => !isRichTextEmpty(jd[s.key])).map((s) => ({
        variant,
        section: s.key,
        body: jd[s.key],
      }));
      return openRequisition({
        title,
        kind,
        grade: grade || undefined,
        account_id: accountId || undefined,
        project_id: projectId || undefined,
        default_interview_mode: mode,
        start_date: start || undefined,
        due_date: due || undefined,
        headcount,
        jd_sections,
        skills: skills.map((s) => ({
          skill_id: s.skill_id,
          skill_name: s.skill_name,
          min_level: s.level,
        })),
      });
    },
    onSuccess: () => {
      toast({ body: 'Requisition created' });
      void queryClient.invalidateQueries({
        queryKey: hiringKeys.requisitions(),
      });
      close();
    },
    onError: (e: Error) => setError(e.message),
  });

  function submit() {
    setSubmitAttempted(true);
    if (missingRequired || startInPast || dueBeforeStart) {
      const target = !title.trim()
        ? titleFieldRef.current
        : isRichTextEmpty(jd.about)
          ? aboutFieldRef.current
          : null;
      target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    mutation.mutate();
  }

  return (
    <>
      <DisabledActionTooltip disabled={disabled} reason={PERMISSION_DENIED.requisition.create}>
        <Button
          size="sm"
          variant="primary"
          icon={<Plus className="size-3.5" />}
          label="New requisition"
          isDisabled={disabled}
          onClick={() => setOpen(true)}
        />
      </DisabledActionTooltip>
      <Dialog
        isOpen={open}
        onOpenChange={handleOpenChange}
        width={720}
        maxHeight="88vh"
        purpose="form"
      >
        <Layout
          header={
            <DialogHeader title="New requisition" onOpenChange={handleOpenChange} hasDivider />
          }
          content={
            <LayoutContent>
              <div className="space-y-5">
                <div className="space-y-1" ref={titleFieldRef}>
                  <Input
                    label="Job title"
                    isRequired
                    value={title}
                    onChange={(value) => setTitle(value)}
                    placeholder="e.g. Senior Backend Engineer"
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
                      options={(accounts ?? []).map((a) => ({
                        value: a.account_id,
                        label: a.name,
                      }))}
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
                      options={(projects ?? []).map((p) => ({
                        value: p.project_id,
                        label: p.name,
                      }))}
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
                  <NumberInput
                    label="Headcount (openings)"
                    min={1}
                    isIntegerOnly
                    value={headcount}
                    onChange={(v) => setHeadcount(Math.max(1, v || 1))}
                  />
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

                {/* FUT-559 (562f4b86): External/Internal variant switcher is temporarily hidden —
                    content saves under the default variant until the two-variant flow is final. */}
                <div className="text-sm font-semibold uppercase text-secondary">JD detail</div>

                {SECTIONS.map((s) => (
                  <div key={s.key} ref={s.key === 'about' ? aboutFieldRef : undefined}>
                    <div
                      className={`mb-1 font-semibold ${s.key === 'nice_to_have' ? 'text-secondary' : 'text-primary'}`}
                    >
                      {s.key === 'about' ? 'About the role *' : s.label}
                    </div>
                    <RichTextEditor
                      value={jd[s.key]}
                      onChange={(html) => setJd((d) => ({ ...d, [s.key]: html }))}
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
            </LayoutContent>
          }
          footer={
            <LayoutFooter hasDivider>
              <div className="space-y-2">
                {error && <Banner status="error" title={error} />}
                <div className="flex items-center justify-end gap-2">
                  <HStack gap={2} hAlign="end">
                    <Button
                      variant="secondary"
                      label="Cancel"
                      onClick={close}
                      isDisabled={mutation.isPending}
                    />
                    <Button
                      variant="primary"
                      icon={<Plus className="size-4" />}
                      label={mutation.isPending ? 'Creating…' : 'Create requisition'}
                      onClick={submit}
                      isDisabled={mutation.isPending}
                    />
                  </HStack>
                </div>
              </div>
            </LayoutFooter>
          }
        />
      </Dialog>
      <AlertDialog
        isOpen={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        title="Discard this requisition?"
        description="Your inputs haven't been saved."
        cancelLabel="Keep editing"
        actionLabel="Discard"
        actionVariant="destructive"
        onAction={close}
      />
    </>
  );
}
