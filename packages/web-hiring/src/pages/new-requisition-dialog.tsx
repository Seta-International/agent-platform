import {
  AlertDialog,
  Banner,
  Button,
  DateInput,
  Dialog,
  DialogHeader,
  DisabledActionTooltip,
  Divider,
  Field,
  Grid,
  HStack,
  Input,
  Layout,
  LayoutContent,
  LayoutFooter,
  NumberInput,
  RichTextEditor,
  Selector,
  useToast,
  VStack,
} from '@seta/shared-ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { type ClipboardEvent, useId, useRef, useState } from 'react';
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
import { GroupLabel } from './form-group-label.tsx';
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
  const [submitAttempted, setSubmitAttempted] = useState(false);
  // Nullable so the field can be cleared; validated below (the branch keeps its own granular date
  // validation via startInPast/dueBeforeStart, so `dateError` from main is intentionally dropped).
  const [headcount, setHeadcount] = useState<number | null>(1);
  const headcountError =
    headcount === null ||
    headcount === undefined ||
    Number.isNaN(headcount) ||
    !Number.isInteger(headcount) ||
    headcount < 1
      ? 'Headcount must be a positive whole number.'
      : headcount > 9
        ? 'Headcount cannot exceed 9.'
        : null;
  const [skills, setSkills] = useState<PickedSkill[]>([]);
  const [variant, setVariant] = useState<JdVariant>('internal');
  const [jd, setJd] = useState<Record<JdSectionKey, string>>({
    about: '',
    responsibilities: '',
    requirements: '',
    nice_to_have: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const missingRequired = !title.trim() || isRichTextEmpty(jd.about);
  // FUT-559 error focus: red per-field message + scroll to the first empty required field.
  const titleFieldRef = useRef<HTMLDivElement>(null);
  const aboutFieldRef = useRef<HTMLDivElement>(null);
  // Stable id base for the JD Field wrappers (label ↔ control association).
  const jdFieldBase = useId();
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
        headcount: headcount ?? 1,
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
    if (missingRequired || startInPast || dueBeforeStart || headcountError) {
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
                      placeholder="e.g. Senior Backend Engineer"
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
                      hasClear
                      value={headcount}
                      onChange={(v) => setHeadcount(v)}
                      onInvalid={(e) => e.preventDefault()}
                      onKeyDown={(e) => {
                        if (
                          e.key === 'e' ||
                          e.key === 'E' ||
                          e.key === '.' ||
                          e.key === ',' ||
                          e.key === '+' ||
                          e.key === '-'
                        ) {
                          e.preventDefault();
                        }
                      }}
                      onPaste={(e: ClipboardEvent<HTMLInputElement>) => {
                        const text = e.clipboardData?.getData('text') ?? '';
                        if (/[eE+\-.,]/.test(text) || !/^\d+$/.test(text.trim())) {
                          e.preventDefault();
                        }
                      }}
                      status={
                        headcountError &&
                        (submitAttempted || headcount === null || headcount < 1 || headcount > 9)
                          ? { type: 'error', message: headcountError }
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
                    temporarily hidden — content saves under the default variant for now. */}
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
                          value={jd[s.key]}
                          onChange={(html) => setJd((d) => ({ ...d, [s.key]: html }))}
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
            </LayoutContent>
          }
          footer={
            <LayoutFooter hasDivider>
              <div className="space-y-2">
                {error && <Banner status="error" title={error} />}
                <div className="flex items-center justify-end gap-2">
                  <HStack gap={2} hAlign="end">
                    {/* Route Cancel through the same dirty-guard as the close (X) button so
                        unsaved input prompts a discard confirmation instead of vanishing. */}
                    <Button
                      variant="secondary"
                      label="Cancel"
                      onClick={() => handleOpenChange(false)}
                      isDisabled={mutation.isPending}
                    />
                    <Button
                      variant="primary"
                      icon={<Plus className="size-4" />}
                      label={mutation.isPending ? 'Creating…' : 'Create'}
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
