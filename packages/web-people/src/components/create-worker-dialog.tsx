import {
  Alert,
  AlertDescription,
  AsyncCombobox,
  Badge,
  Button,
  Combobox,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Dropzone,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@seta/shared-ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { FileText, X } from 'lucide-react';
import { useState } from 'react';
import { fetchOrgStructure } from '../api/org-client.ts';
import {
  addWorkerSkill,
  createWorker,
  editWorker,
  GENDER_OPTIONS,
  parseWorkerCvDraft,
  putToS3,
  requestWorkerCvUpload,
  searchSkills,
} from '../api/people-client.ts';
import {
  applyDraftToForm,
  EMPTY_WORKER_FORM,
  saveWorkerWithCv,
  type WorkerFormValues,
} from '../lib/cv-intake.ts';

const CV_MAX_BYTES = 10 * 1024 * 1024;

const EMPLOYMENT_TYPES = ['full_time', 'part_time', 'contract', 'intern'] as const;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <span className="text-eyebrow uppercase tracking-[0.04em] text-ink-subtle">{title}</span>
      {children}
    </div>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`space-y-1 ${className ?? ''}`}>
      <Label className="text-body-sm">{label}</Label>
      {children}
    </div>
  );
}

export function CreateWorkerDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<WorkerFormValues>(EMPTY_WORKER_FORM);
  const [skillIds, setSkillIds] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: org } = useQuery({
    queryKey: ['people', 'org-structure'],
    queryFn: fetchOrgStructure,
    enabled: open,
  });
  const orgOptions = (org?.units ?? []).map((u) => ({ value: u.id, label: u.name }));

  const set = (field: keyof WorkerFormValues) => (v: string) =>
    setForm((prev) => ({ ...prev, [field]: v }));

  const parse = useMutation({
    mutationFn: parseWorkerCvDraft,
    onSuccess: (draft) => {
      setForm((prev) => applyDraftToForm(draft, prev));
      setSkillIds((prev) => [...new Set([...prev, ...draft.skills.map((s) => s.skill_id)])]);
      setSuggestions(draft.skill_suggestions);
      toast.success('CV parsed — review the pre-filled fields before saving');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const save = useMutation({
    mutationFn: () =>
      saveWorkerWithCv(
        {
          createWorker,
          addWorkerSkill,
          requestCvUpload: requestWorkerCvUpload,
          putToS3,
          patchWorker: (id, patch) => editWorker(id, { expected_version: 1, patch }),
        },
        { form, skillIds, cvFile },
      ),
    onSuccess: ({ warnings }) => {
      toast.success('Worker created');
      for (const w of warnings) toast.error(w);
      onCreated();
      setOpen(false);
      reset();
    },
    onError: (e: Error) => setError(e.message),
  });

  function reset() {
    setForm(EMPTY_WORKER_FORM);
    setSkillIds([]);
    setSuggestions([]);
    setCvFile(null);
    setError(null);
    parse.reset();
  }

  function onFile(file: File) {
    setCvFile(file);
    parse.mutate(file);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">New worker</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add worker</DialogTitle>
        </DialogHeader>
        <div className="space-y-5">
          {cvFile ? (
            <div className="flex items-center gap-2 rounded-lg border border-hairline bg-surface-1 px-3 py-2 text-body-sm">
              <FileText className="size-4 flex-none text-ink-subtle" aria-hidden />
              <span className="min-w-0 flex-1 truncate">{cvFile.name}</span>
              {parse.isPending && <span className="text-ink-subtle">Parsing…</span>}
              <Button
                variant="ghost"
                size="icon"
                className="size-6"
                aria-label="Remove CV"
                onClick={() => {
                  setCvFile(null);
                  setSuggestions([]);
                }}
              >
                <X className="size-3.5" />
              </Button>
            </div>
          ) : (
            <Dropzone
              accept=".pdf,.docx"
              maxBytes={CV_MAX_BYTES}
              label="Upload CV to auto-fill"
              hint="PDF or DOCX, up to 10MB — parsed fields stay editable"
              pendingLabel="Parsing CV…"
              isPending={parse.isPending}
              onFile={onFile}
            />
          )}

          <Section title="Identity">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Full name *" className="col-span-2">
                <Input
                  value={form.full_name}
                  onChange={(e) => set('full_name')(e.target.value)}
                  aria-label="Full name"
                />
              </Field>
              <Field label="Date of birth">
                <Input
                  type="date"
                  value={form.dob}
                  onChange={(e) => set('dob')(e.target.value)}
                  aria-label="Date of birth"
                />
              </Field>
              <Field label="Gender">
                <Select value={form.gender || undefined} onValueChange={set('gender')}>
                  <SelectTrigger aria-label="Gender">
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    {GENDER_OPTIONS.map((g) => (
                      <SelectItem key={g.value} value={g.value}>
                        {g.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </Section>

          <Section title="Contact">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Personal email">
                <Input
                  type="email"
                  value={form.personal_email}
                  onChange={(e) => set('personal_email')(e.target.value)}
                  aria-label="Personal email"
                />
              </Field>
              <Field label="Phone">
                <Input
                  value={form.phone}
                  onChange={(e) => set('phone')(e.target.value)}
                  aria-label="Phone"
                />
              </Field>
              <Field label="Work email" className="col-span-2">
                <Input
                  type="email"
                  value={form.work_email}
                  onChange={(e) => set('work_email')(e.target.value)}
                  placeholder="Generated from the tenant domain when left empty"
                  aria-label="Work email"
                />
              </Field>
            </div>
          </Section>

          <Section title="Employment">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Job title">
                <Input
                  value={form.job_title}
                  onChange={(e) => set('job_title')(e.target.value)}
                  aria-label="Job title"
                />
              </Field>
              <Field label="Employment type">
                <Select
                  value={form.employment_type || undefined}
                  onValueChange={set('employment_type')}
                >
                  <SelectTrigger aria-label="Employment type">
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    {EMPLOYMENT_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t.replace('_', ' ')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Start date">
                <Input
                  type="date"
                  value={form.start_date}
                  onChange={(e) => set('start_date')(e.target.value)}
                  aria-label="Start date"
                />
              </Field>
              <Field label="Employee no">
                <Input
                  value={form.employee_no}
                  onChange={(e) => set('employee_no')(e.target.value)}
                  aria-label="Employee no"
                />
              </Field>
              <Field label="Department" className="col-span-2">
                <Combobox
                  value={form.org_unit_id || null}
                  onChange={(v) => set('org_unit_id')(v ?? '')}
                  options={orgOptions}
                  placeholder="No department"
                  searchPlaceholder="Search departments…"
                  aria-label="Department"
                  modal
                />
              </Field>
            </div>
          </Section>

          <Section title="Skills">
            <AsyncCombobox
              multiple
              search={searchSkills.search}
              resolveByIds={searchSkills.resolveByIds}
              value={skillIds}
              onChange={setSkillIds}
              placeholder="Add skills…"
              aria-label="Skills"
              modal
            />
            {suggestions.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="text-caption text-ink-subtle">From CV, not in catalog:</span>
                {suggestions.map((s) => (
                  <Badge key={s} variant="outline" className="border-dashed">
                    {s}
                  </Badge>
                ))}
              </div>
            )}
          </Section>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => save.mutate()}
              disabled={save.isPending || parse.isPending || !form.full_name.trim()}
            >
              {save.isPending ? 'Creating…' : 'Create'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
