import {
  Badge,
  Banner,
  Button,
  createStaticSource,
  DateInput,
  Dialog,
  DialogFooter,
  DialogHeader,
  FileInput,
  Input,
  Layout,
  LayoutContent,
  type SearchableItem,
  Selector,
  Tokenizer,
  Typeahead,
  useSeededItems,
  useToast,
} from '@seta/shared-ui';
import { firstConcreteModelKey, ModelSelector, useModelCatalog } from '@seta/web-agent';
import { useMutation, useQuery } from '@tanstack/react-query';
import { FileText, Plus, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
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
  validateWorkerForm,
  type WorkerFormErrors,
  type WorkerFormValues,
} from '../lib/cv-intake.ts';

const CV_MAX_BYTES = 10 * 1024 * 1024;

const EMPLOYMENT_TYPES = ['full_time', 'part_time', 'contract', 'intern'] as const;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <span className="text-xs font-medium uppercase tracking-[0.04em] text-secondary">
        {title}
      </span>
      {children}
    </div>
  );
}

export function CreateWorkerDialog({ onCreated }: { onCreated: () => void }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<WorkerFormValues>(EMPTY_WORKER_FORM);
  const [skillIds, setSkillIds] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [cvModel, setCvModel] = useState('');
  const { data: modelCatalog } = useModelCatalog();
  useEffect(() => {
    if (cvModel) return;
    const next = firstConcreteModelKey(modelCatalog?.models);
    if (next) setCvModel(next);
  }, [cvModel, modelCatalog?.models]);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<WorkerFormErrors>({});

  const { data: org } = useQuery({
    queryKey: ['people', 'org-structure'],
    queryFn: fetchOrgStructure,
    enabled: open,
  });
  const orgItems = useMemo<SearchableItem[]>(
    () => (org?.units ?? []).map((u) => ({ id: u.id, label: u.name })),
    [org],
  );
  const orgSource = useMemo(() => createStaticSource(orgItems), [orgItems]);
  const orgValue = orgItems.find((i) => i.id === form.org_unit_id) ?? null;

  const [skillItems, setSkillItems] = useSeededItems(skillIds, searchSkills.seed);

  const set = (field: keyof WorkerFormValues) => (v: string) => {
    setForm((prev) => ({ ...prev, [field]: v }));
    setFieldErrors((prev) => (field in prev ? { ...prev, [field]: undefined } : prev));
  };

  const fieldStatus = (field: keyof WorkerFormErrors) =>
    fieldErrors[field] ? ({ type: 'error', message: fieldErrors[field] } as const) : undefined;

  function handleSubmit() {
    const errors = validateWorkerForm(form);
    if (Object.values(errors).some(Boolean)) {
      setFieldErrors(errors);
      return;
    }
    save.mutate();
  }

  const parse = useMutation({
    mutationFn: (file: File) => parseWorkerCvDraft(file, cvModel || undefined),
    onSuccess: (draft) => {
      setForm((prev) => applyDraftToForm(draft, prev));
      setSkillIds((prev) => [...new Set([...prev, ...draft.skills.map((s) => s.skill_id)])]);
      setSuggestions(draft.skill_suggestions);
      toast({ body: 'CV parsed — review the pre-filled fields before saving' });
    },
    onError: (e: Error) => toast({ body: e.message, type: 'error' }),
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
      toast({ body: 'Employee added' });
      for (const w of warnings) toast({ body: w, type: 'error' });
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
    setFieldErrors({});
    parse.reset();
  }

  function handleCvChange(file: File | File[] | null) {
    if (file instanceof File) {
      setCvFile(file);
      parse.mutate(file);
    }
  }

  function handleOpenChange(v: boolean) {
    setOpen(v);
    if (!v) reset();
  }

  return (
    <>
      <Button
        size="sm"
        variant="primary"
        icon={<Plus className="size-3.5" />}
        label="Add employee"
        onClick={() => setOpen(true)}
      />
      <Dialog
        isOpen={open}
        onOpenChange={handleOpenChange}
        width={720}
        maxHeight="85vh"
        purpose="form"
      >
        <Layout
          header={<DialogHeader title="Add employee" onOpenChange={handleOpenChange} />}
          content={
            <LayoutContent>
              <div className="space-y-5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-secondary">Parse model</span>
                  <ModelSelector
                    value={cvModel}
                    onChange={setCvModel}
                    includeAuto={false}
                    variant="bordered"
                  />
                </div>
                {cvFile ? (
                  <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-base">
                    <FileText className="size-4 flex-none text-secondary" aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{cvFile.name}</span>
                    {parse.isPending && <span className="text-secondary">Parsing…</span>}
                    <Button
                      variant="ghost"
                      size="sm"
                      isIconOnly
                      icon={<X className="size-3.5" />}
                      label="Remove CV"
                      className="size-6"
                      onClick={() => {
                        setCvFile(null);
                        setSuggestions([]);
                      }}
                    />
                  </div>
                ) : (
                  <FileInput
                    mode="dropzone"
                    label="Upload CV to auto-fill"
                    accept=".pdf,.docx"
                    maxSize={CV_MAX_BYTES}
                    value={null}
                    onChange={handleCvChange}
                    isLoading={parse.isPending}
                    isDisabled={parse.isPending}
                    placeholder="Drop a CV here, or click to choose one"
                    description="PDF or DOCX, up to 10MB — parsed fields stay editable"
                  />
                )}

                <Section title="Identity">
                  <div className="grid grid-cols-2 gap-3">
                    <Input
                      label="Full name"
                      isRequired
                      value={form.full_name}
                      onChange={(value) => set('full_name')(value)}
                      status={fieldStatus('full_name')}
                      className="col-span-2"
                    />
                    <DateInput
                      label="Date of birth"
                      value={form.dob || undefined}
                      onChange={(v) => set('dob')(v ?? '')}
                    />
                    <Selector
                      label="Gender"
                      options={GENDER_OPTIONS.map((g) => ({ value: g.value, label: g.label }))}
                      value={form.gender || undefined}
                      onChange={set('gender')}
                      placeholder="—"
                    />
                  </div>
                </Section>

                <Section title="Contact">
                  <div className="grid grid-cols-2 gap-3">
                    <Input
                      type="email"
                      label="Personal email"
                      value={form.personal_email}
                      onChange={(value) => set('personal_email')(value)}
                      status={fieldStatus('personal_email')}
                    />
                    <Input
                      label="Phone"
                      value={form.phone}
                      onChange={(value) => set('phone')(value)}
                    />
                    <Input
                      type="email"
                      label="Work email"
                      value={form.work_email}
                      onChange={(value) => set('work_email')(value)}
                      status={fieldStatus('work_email')}
                      placeholder="Generated from the tenant domain when left empty"
                      className="col-span-2"
                    />
                  </div>
                </Section>

                <Section title="Employment">
                  <div className="grid grid-cols-2 gap-3">
                    <Input
                      label="Job title"
                      value={form.job_title}
                      onChange={(value) => set('job_title')(value)}
                    />
                    <Selector
                      label="Employment type"
                      options={EMPLOYMENT_TYPES.map((t) => ({
                        value: t,
                        label: t.replace('_', ' '),
                      }))}
                      value={form.employment_type || undefined}
                      onChange={set('employment_type')}
                      placeholder="—"
                    />
                    <DateInput
                      label="Start date"
                      value={form.start_date || undefined}
                      onChange={(v) => set('start_date')(v ?? '')}
                    />
                    <Input
                      label="Employee no"
                      value={form.employee_no}
                      onChange={(value) => set('employee_no')(value)}
                    />
                    <div className="col-span-2">
                      <Typeahead
                        label="Department"
                        searchSource={orgSource}
                        debounceMs={0}
                        hasEntriesOnFocus
                        value={orgValue}
                        onChange={(item) => set('org_unit_id')(item?.id ?? '')}
                        placeholder="No department"
                      />
                    </div>
                  </div>
                </Section>

                <Section title="Skills">
                  <Tokenizer
                    label="Skills"
                    isLabelHidden
                    searchSource={searchSkills.source}
                    hasEntriesOnFocus
                    value={skillItems}
                    onChange={(items) => {
                      setSkillItems(items);
                      setSkillIds(items.map((i) => i.id));
                    }}
                    placeholder="Add skills…"
                  />
                  {suggestions.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      <span className="text-sm text-secondary">From CV, not in catalog:</span>
                      {suggestions.map((s) => (
                        <Badge key={s} variant="neutral" className="border-dashed" label={s} />
                      ))}
                    </div>
                  )}
                </Section>

                {error && <Banner status="error" title={error} />}
              </div>
            </LayoutContent>
          }
          footer={
            <DialogFooter>
              <Button variant="secondary" onClick={() => setOpen(false)} label="Cancel" />
              <Button
                variant="primary"
                onClick={handleSubmit}
                isDisabled={save.isPending || parse.isPending}
                icon={<Plus className="size-4" />}
                label={save.isPending ? 'Adding…' : 'Add employee'}
              />
            </DialogFooter>
          }
        />
      </Dialog>
    </>
  );
}
