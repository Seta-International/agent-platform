import {
  Alert,
  AlertDescription,
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DisabledActionTooltip,
  Input,
  Label,
  SegmentedControl,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
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
import { type PickedSkill, SkillPicker } from './skill-picker.tsx';

const SECTIONS: {
  key: JdSectionKey;
  label: string;
  hint?: string;
  placeholder: string;
}[] = [
  {
    key: 'about',
    label: 'About the role *',
    placeholder: 'One short paragraph on the role and its context…',
  },
  {
    key: 'responsibilities',
    label: 'Responsibilities',
    hint: 'one per line, optional',
    placeholder: 'Design and build…\nReview PRs…',
  },
  {
    key: 'requirements',
    label: 'Requirements',
    hint: 'one per line, optional',
    placeholder: '5+ years…\nStrong…',
  },
  {
    key: 'nice_to_have',
    label: 'Nice to have',
    hint: 'one per line, optional',
    placeholder: 'Domain experience…',
  },
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
  const [variant, setVariant] = useState<JdVariant>('external');
  const [jd, setJd] = useState<Record<JdSectionKey, string>>({
    about: '',
    responsibilities: '',
    requirements: '',
    nice_to_have: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const missingRequired = !title.trim() || !jd.about.trim();
  const requiredError =
    submitAttempted && missingRequired
      ? !title.trim() && !jd.about.trim()
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
    setVariant('external');
    setJd({
      about: '',
      responsibilities: '',
      requirements: '',
      nice_to_have: '',
    });
    setError(null);
    setSubmitAttempted(false);
  }

  const mutation = useMutation({
    mutationFn: () => {
      const jd_sections = SECTIONS.filter((s) => jd[s.key].trim()).map((s) => ({
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
      setOpen(false);
      reset();
    },
    onError: (e: Error) => setError(e.message),
  });

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
          <Button size="sm" disabled={disabled}>
            New requisition
          </Button>
        </DialogTrigger>
      </DisabledActionTooltip>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New requisition</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 max-h-[70vh] overflow-y-auto">
          <div className="space-y-1">
            <Label>Job title *</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Senior Backend Engineer"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Grade</Label>
              <Select value={grade} onValueChange={setGrade}>
                <SelectTrigger className="w-full">
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
              <Label>Type</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as 'new' | 'replacement')}>
                <SelectTrigger className="w-full">
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
              <Label>Account</Label>
              <Select
                value={accountId}
                onValueChange={(v) => {
                  setAccountId(v);
                  setProjectId('');
                }}
              >
                <SelectTrigger className="w-full">
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
              <Label>Project</Label>
              <Select value={projectId} onValueChange={setProjectId} disabled={!accountId}>
                <SelectTrigger className="w-full">
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
              <Label>Interview mode</Label>
              <Select
                value={mode}
                onValueChange={(v) => setMode(v as 'online' | 'onsite' | 'either')}
              >
                <SelectTrigger className="w-full">
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
              <Label>Headcount (openings)</Label>
              <Input
                type="number"
                min={1}
                value={headcount}
                onChange={(e) => setHeadcount(Math.max(1, Number(e.target.value) || 1))}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Start date</Label>
              <Input
                type="date"
                value={start}
                max={due || undefined}
                onChange={(e) => setStart(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Due date</Label>
              <Input
                type="date"
                value={due}
                min={start || undefined}
                onChange={(e) => setDue(e.target.value)}
              />
            </div>
          </div>
          {dateError && <p className="text-body-sm text-danger-ink">{dateError}</p>}
          <div className="space-y-1">
            <Label>Tech stack</Label>
            <SkillPicker value={skills} onChange={setSkills} />
          </div>
          <div className="flex items-center justify-between pt-2">
            <div className="text-caption font-semibold uppercase text-ink-muted">JD detail</div>
            <SegmentedControl
              value={variant}
              onValueChange={(v) => setVariant(v as JdVariant)}
              options={[
                { value: 'external', label: 'External' },
                {
                  value: 'internal',
                  label: 'Internal',
                  disabled: true,
                  disabledReason: 'Coming soon',
                },
              ]}
            />
          </div>
          {SECTIONS.map((s) => (
            <div key={s.key} className="space-y-1">
              <Label>
                {s.label}
                {s.hint && <span className="ml-1 font-normal text-ink-subtle">— {s.hint}</span>}
              </Label>
              <Textarea
                value={jd[s.key]}
                onChange={(e) => setJd((d) => ({ ...d, [s.key]: e.target.value }))}
                placeholder={s.placeholder}
              />
            </div>
          ))}
          {requiredError && <p className="text-body-sm text-danger-ink">{requiredError}</p>}
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                setSubmitAttempted(true);
                if (missingRequired || dateError) return;
                mutation.mutate();
              }}
              disabled={mutation.isPending}
            >
              {mutation.isPending ? 'Creating…' : 'Create requisition'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
