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
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
  DisabledActionTooltip,
  Input,
  Label,
  RichTextEditor,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@seta/shared-ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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

// Section eyebrow + "(optional)" affix share one look across the form.
function Eyebrow({ children }: { children: string }) {
  return <div className="text-caption font-semibold uppercase text-ink-muted">{children}</div>;
}

function Optional() {
  return <span className="font-normal text-ink-muted"> (optional)</span>;
}

export function NewRequisitionDialog({ disabled = false }: { disabled?: boolean }) {
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
  // Local-midnight today as yyyy-mm-dd — toISOString() alone is UTC and drifts a day
  // around midnight for non-UTC users.
  const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10);
  // ISO date strings (yyyy-mm-dd from <input type="date">) compare correctly with `<`.
  // The inputs' min/max only guard the picker — typed dates still land in state, so the
  // same bounds are re-checked here and on Create.
  const startError = start && start < today ? 'Start date cannot be in the past.' : null;
  const dueError = !due
    ? null
    : start && due < start
      ? 'Due date must be on or after the start date.'
      : !start && due < today
        ? 'Due date cannot be in the past.'
        : null;
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
  // Required-field feedback is the field itself: red border + scroll-to on Create,
  // no separate warning text. Typing clears the highlight because these derive live.
  const titleInvalid = submitAttempted && !title.trim();
  const aboutInvalid = submitAttempted && isRichTextEmpty(jd.about);
  const titleRef = useRef<HTMLInputElement>(null);
  const aboutRef = useRef<HTMLDivElement>(null);
  const startDateRef = useRef<HTMLInputElement>(null);
  const dueDateRef = useRef<HTMLInputElement>(null);

  // Anything worth keeping? Esc/overlay/Cancel ask before throwing it away.
  const dirty =
    title.trim() !== '' ||
    accountId !== '' ||
    projectId !== '' ||
    start !== '' ||
    due !== '' ||
    headcount !== 1 ||
    skills.length > 0 ||
    SECTIONS.some((s) => !isRichTextEmpty(jd[s.key]));

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

  // Every dismissal path (Esc, overlay click, Cancel) funnels through here so a
  // half-written JD is never lost to one keystroke.
  function requestClose() {
    if (dirty) setConfirmDiscard(true);
    else close();
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
      toast.success('Requisition created');
      void queryClient.invalidateQueries({
        queryKey: hiringKeys.requisitions(),
      });
      close();
    },
    onError: (e: Error) => setError(e.message),
  });

  function submit() {
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
    mutation.mutate();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (v) setOpen(true);
        else requestClose();
      }}
    >
      <DisabledActionTooltip disabled={disabled} reason={PERMISSION_DENIED.requisition.create}>
        <DialogTrigger asChild>
          <Button size="sm" disabled={disabled}>
            New requisition
          </Button>
        </DialogTrigger>
      </DisabledActionTooltip>
      <DialogContent
        unstyled
        onOpenAutoFocus={(e) => e.preventDefault()}
        className="w-[min(760px,94vw)]"
      >
        <DialogTitle className="sr-only">New requisition</DialogTitle>
        <div className="flex max-h-[88vh] flex-col overflow-hidden rounded-xl">
          <header className="border-b border-hairline bg-canvas px-6 py-3">
            <h1 className="text-section-title font-semibold text-ink">New requisition</h1>
          </header>
          <div className="min-h-0 flex-1 overflow-auto">
            <div className="space-y-5 px-6 pb-5 pt-3">
              <Eyebrow>Role</Eyebrow>
              <div className="space-y-1">
                <Label htmlFor="new-req-title">Job title *</Label>
                <Input
                  id="new-req-title"
                  ref={titleRef}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Senior Backend Engineer"
                  aria-invalid={titleInvalid}
                  className={titleInvalid ? '!border-danger' : undefined}
                />
                {titleInvalid && (
                  <p className="text-caption text-danger-ink">Job title is required.</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="new-req-grade">Grade</Label>
                  <Select value={grade} onValueChange={setGrade}>
                    <SelectTrigger id="new-req-grade" className="w-full">
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
                  <Label htmlFor="new-req-type">Type</Label>
                  <Select value={kind} onValueChange={(v) => setKind(v as 'new' | 'replacement')}>
                    <SelectTrigger id="new-req-type" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="new">New</SelectItem>
                      <SelectItem value="replacement">Replacement</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="border-t border-hairline pt-4">
                <Eyebrow>Placement & timeline</Eyebrow>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="new-req-account">
                    Account
                    <Optional />
                  </Label>
                  <Select
                    value={accountId}
                    onValueChange={(v) => {
                      setAccountId(v);
                      setProjectId('');
                    }}
                  >
                    <SelectTrigger id="new-req-account" className="w-full">
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
                  <Label htmlFor="new-req-project">
                    Project
                    <Optional />
                  </Label>
                  <Select value={projectId} onValueChange={setProjectId} disabled={!accountId}>
                    <SelectTrigger id="new-req-project" className="w-full">
                      <SelectValue
                        placeholder={accountId ? 'No project' : 'Pick an account first'}
                      />
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
                  <Label htmlFor="new-req-mode">Interview mode</Label>
                  <Select
                    value={mode}
                    onValueChange={(v) => setMode(v as 'online' | 'onsite' | 'either')}
                  >
                    <SelectTrigger id="new-req-mode" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="online">Online (Teams)</SelectItem>
                      <SelectItem value="onsite">Onsite</SelectItem>
                      <SelectItem value="either">Either</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="new-req-headcount">Headcount (openings)</Label>
                  <Input
                    id="new-req-headcount"
                    type="number"
                    min={1}
                    value={headcount}
                    onChange={(e) => setHeadcount(Math.max(1, Number(e.target.value) || 1))}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="new-req-start">
                    Start date
                    <Optional />
                  </Label>
                  <Input
                    id="new-req-start"
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
                  <Label htmlFor="new-req-due">
                    Due date
                    <Optional />
                  </Label>
                  <Input
                    id="new-req-due"
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

              <div className="space-y-3 border-t border-hairline pt-4">
                <Eyebrow>Skills</Eyebrow>
                <SkillPicker value={skills} onChange={setSkills} showLevel={false} />
              </div>

              {/* External/Internal variant switcher is temporarily hidden — content saves
                  under the default variant until the two-variant flow is finalized. */}
              <div className="border-t border-hairline pt-4">
                <Eyebrow>JD detail</Eyebrow>
              </div>

              {SECTIONS.map((s) => (
                <div key={s.key} ref={s.key === 'about' ? aboutRef : undefined}>
                  <div
                    className={`mb-1 font-semibold ${s.key === 'nice_to_have' ? 'text-ink-muted' : 'text-ink'}`}
                  >
                    {s.key === 'about' ? 'About the role *' : s.label}
                  </div>
                  <RichTextEditor
                    value={jd[s.key]}
                    onChange={(html) => setJd((d) => ({ ...d, [s.key]: html }))}
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
          <footer className="space-y-2 border-t border-hairline bg-canvas px-6 py-3">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="flex items-center justify-end gap-2">
              <Button variant="secondary" onClick={requestClose} disabled={mutation.isPending}>
                Cancel
              </Button>
              <Button onClick={submit} disabled={mutation.isPending}>
                {mutation.isPending ? 'Creating…' : 'Create'}
              </Button>
            </div>
          </footer>
        </div>
      </DialogContent>
      <AlertDialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard this requisition?</AlertDialogTitle>
            <AlertDialogDescription>
              Everything you entered will be lost. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction onClick={close}>Discard</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
