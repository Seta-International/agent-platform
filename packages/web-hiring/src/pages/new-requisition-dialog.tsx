import {
  Banner,
  Button,
  DateInput,
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
  DisabledActionTooltip,
  Input,
  Label,
  NumberInput,
  RichTextEditor,
  SegmentedControl,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@seta/shared-ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
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
  // ISO date strings (yyyy-mm-dd from <input type="date">) compare correctly with `<`.
  const dateError = start && due && start >= due ? 'Start date must be before due date.' : null;
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
  const missingRequired = !title.trim() || isRichTextEmpty(jd.about);
  const requiredError =
    submitAttempted && missingRequired
      ? !title.trim() && isRichTextEmpty(jd.about)
        ? 'Job title and About the role are required.'
        : !title.trim()
          ? 'Job title is required.'
          : 'About the role is required.'
      : null;

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
  }

  // Radix only fires onOpenChange for its own dismissals (Esc, overlay); closing
  // programmatically must reset explicitly or the next open shows stale data.
  function close() {
    setOpen(false);
    reset();
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
    if (missingRequired || dateError) return;
    mutation.mutate();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DisabledActionTooltip disabled={disabled} reason={PERMISSION_DENIED.requisition.create}>
        <DialogTrigger asChild>
          <Button size="sm" label="New requisition" isDisabled={disabled} />
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
              <div className="space-y-1">
                <Label htmlFor="new-req-title">Job title *</Label>
                <Input
                  id="new-req-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Senior Backend Engineer"
                />
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
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="new-req-account">Account</Label>
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
                  <Label htmlFor="new-req-project">Project</Label>
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

              <SkillPicker value={skills} onChange={setSkills} showLevel={false} />

              <div className="flex items-center justify-between">
                <div className="text-caption font-semibold uppercase text-ink-muted">JD detail</div>
                <SegmentedControl
                  value={variant}
                  onValueChange={(v) => setVariant(v as JdVariant)}
                  options={[
                    { value: 'external', label: 'External' },
                    { value: 'internal', label: 'Internal' },
                  ]}
                />
              </div>

              {SECTIONS.map((s) => (
                <div key={s.key}>
                  <div
                    className={`mb-1 font-semibold ${s.key === 'nice_to_have' ? 'text-ink-muted' : 'text-ink'}`}
                  >
                    {s.key === 'about' ? 'About the role *' : s.label}
                  </div>
                  <RichTextEditor
                    value={jd[s.key]}
                    onChange={(html) => setJd((d) => ({ ...d, [s.key]: html }))}
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
          <footer className="space-y-2 border-t border-hairline bg-canvas px-6 py-3">
            {error && <Banner status="error" title={error} />}
            <div className="flex items-center justify-between gap-2">
              <p className="text-body-sm text-danger-ink">{requiredError}</p>
              <div className="flex shrink-0 gap-2">
                <Button
                  variant="secondary"
                  label="Cancel"
                  onClick={close}
                  isDisabled={mutation.isPending}
                />
                <Button
                  label={mutation.isPending ? 'Creating…' : 'Create'}
                  onClick={submit}
                  isDisabled={mutation.isPending}
                />
              </div>
            </div>
          </footer>
        </div>
      </DialogContent>
    </Dialog>
  );
}
