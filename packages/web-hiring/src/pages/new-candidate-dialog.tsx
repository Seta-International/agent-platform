import {
  Badge,
  Banner,
  Button,
  DateInput,
  Dialog,
  DialogHeader,
  Dropzone,
  Field,
  Input,
  Layout,
  LayoutContent,
  LayoutFooter,
  Selector,
  Textarea,
  toast,
} from '@seta/shared-ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, X } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import {
  addCandidate,
  editCandidate,
  fetchCandidates,
  fetchRequisitions,
  parseCandidateCvDraft,
  putCvToS3,
  requestCandidateCvUpload,
} from '../api/hiring-client.ts';
import { hiringKeys } from '../state/query-keys.ts';
import { type PickedSkill, SkillPicker } from './skill-picker.tsx';

const NONE = '__none__';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[0-9()\-.\s]{7,20}$/;

export function NewCandidateDialog() {
  const queryClient = useQueryClient();
  const skillsId = useId();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [dob, setDob] = useState('');
  const [gender, setGender] = useState('');
  const [seniority, setSeniority] = useState('');
  const [source, setSource] = useState('');
  const [reqId, setReqId] = useState('');
  const [note, setNote] = useState('');
  const [skills, setSkills] = useState<PickedSkill[]>([]);
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const emailError = email.trim() && !EMAIL_RE.test(email.trim()) ? 'Enter a valid email.' : null;
  const phoneError =
    phone.trim() && !PHONE_RE.test(phone.trim()) ? 'Enter a valid phone number.' : null;

  const { data: reqs } = useQuery({
    queryKey: hiringKeys.requisitionOptions(),
    queryFn: fetchRequisitions,
  });
  const openReqs = (reqs ?? []).filter((r) => r.status === 'open');

  // Suggest values already in use (same distinct-value approach as the Candidates board filters).
  const { data: existingCandidates } = useQuery({
    queryKey: hiringKeys.candidates(),
    queryFn: fetchCandidates,
    enabled: open,
  });
  const seniorityOptions = useMemo(
    () =>
      [
        ...new Set(
          (existingCandidates ?? []).map((c) => c.seniority).filter((v): v is string => !!v),
        ),
      ].sort(),
    [existingCandidates],
  );
  const sourceOptions = useMemo(
    () =>
      [
        ...new Set((existingCandidates ?? []).map((c) => c.source).filter((v): v is string => !!v)),
      ].sort(),
    [existingCandidates],
  );

  function reset() {
    setName('');
    setEmail('');
    setPhone('');
    setDob('');
    setGender('');
    setSeniority('');
    setSource('');
    setReqId('');
    setNote('');
    setSkills([]);
    setCvFile(null);
    setSuggestions([]);
    setError(null);
    setSubmitAttempted(false);
  }

  // Radix only fires onOpenChange for its own dismissals (Esc, overlay); closing
  // programmatically must reset explicitly or the next open shows stale data.
  function close() {
    setOpen(false);
    reset();
  }

  function handleOpenChange(v: boolean) {
    setOpen(v);
    if (!v) reset();
  }

  const effectiveReq = reqId || openReqs[0]?.id || '';
  const missingRequired = !name.trim() || !effectiveReq;
  const requiredError =
    submitAttempted && missingRequired
      ? !name.trim() && !effectiveReq
        ? 'Full name and position applied are required.'
        : !name.trim()
          ? 'Full name is required.'
          : 'Position applied is required.'
      : null;

  // Fill-only-empty: a parse never overwrites what the recruiter already typed.
  const parse = useMutation({
    mutationFn: parseCandidateCvDraft,
    onSuccess: (draft) => {
      if (!name.trim() && draft.name) setName(draft.name);
      if (!email.trim() && draft.personal_email) setEmail(draft.personal_email);
      if (!phone.trim() && draft.phone) setPhone(draft.phone);
      if (!dob && draft.dob) setDob(draft.dob);
      if (!gender && draft.gender) setGender(draft.gender);
      if (!seniority && draft.seniority) setSeniority(draft.seniority);
      if (!note.trim() && draft.note) setNote(draft.note);
      setSkills((prev) => {
        const have = new Set(prev.map((s) => s.skill_id));
        return [...prev, ...draft.skills.filter((s) => !have.has(s.skill_id))];
      });
      setSuggestions(draft.skill_suggestions);
      toast.success('CV parsed — review the pre-filled fields before saving');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await addCandidate({
        requisition_id: effectiveReq,
        name,
        personal_email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        dob: dob || undefined,
        gender: gender || undefined,
        seniority: seniority || undefined,
        source: source || undefined,
        note: note || undefined,
        skills: skills.map((s) => ({
          skill_id: s.skill_id,
          skill_name: s.skill_name,
          level: s.level,
        })),
      });
      // Candidate first, CV second: an upload failure must never lose the record.
      let cvWarning: string | null = null;
      if (cvFile) {
        try {
          const { upload_url, s3_key } = await requestCandidateCvUpload(
            res.candidate_id,
            cvFile.name,
            cvFile.type || 'application/octet-stream',
          );
          await putCvToS3(upload_url, cvFile);
          await editCandidate(res.candidate_id, { patch: { cv_storage_key: s3_key } });
        } catch (e) {
          cvWarning = `CV was not attached: ${(e as Error).message}`;
        }
      }
      return { cvWarning };
    },
    onSuccess: ({ cvWarning }) => {
      toast.success('Candidate added');
      if (cvWarning) toast.error(cvWarning);
      void queryClient.invalidateQueries({ queryKey: hiringKeys.candidates() });
      close();
    },
    onError: (e: Error) => setError(e.message),
  });

  function submit() {
    setSubmitAttempted(true);
    if (missingRequired || emailError || phoneError) return;
    setError(null);
    mutation.mutate();
  }

  return (
    <>
      <Button size="sm" label="New candidate" onClick={() => setOpen(true)} />
      <Dialog
        isOpen={open}
        onOpenChange={handleOpenChange}
        width={560}
        maxHeight="85vh"
        purpose="form"
      >
        <Layout
          header={<DialogHeader title="New candidate" onOpenChange={handleOpenChange} hasDivider />}
          content={
            <LayoutContent>
              <div className="space-y-3">
                {cvFile ? (
                  <div className="flex items-center gap-2 rounded-lg border border-hairline bg-surface-1 px-3 py-2 text-body-sm">
                    <FileText className="size-4 flex-none text-ink-subtle" aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{cvFile.name}</span>
                    {parse.isPending && <span className="text-ink-subtle">Parsing…</span>}
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
                  <Dropzone
                    accept=".pdf,.docx"
                    maxBytes={10 * 1024 * 1024}
                    label="Upload CV to auto-fill"
                    hint="PDF or DOCX, up to 10MB — parsed fields stay editable"
                    pendingLabel="Parsing CV…"
                    isPending={parse.isPending}
                    onFile={(f) => {
                      setCvFile(f);
                      parse.mutate(f);
                    }}
                  />
                )}
                <div className="space-y-1">
                  <Input
                    label="Full name"
                    isRequired
                    value={name}
                    onChange={(value) => setName(value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Input
                      type="email"
                      label="Email"
                      value={email}
                      onChange={(value) => setEmail(value)}
                    />
                    {emailError && <p className="text-caption text-danger-ink">{emailError}</p>}
                  </div>
                  <div className="space-y-1">
                    <Input label="Phone" value={phone} onChange={(value) => setPhone(value)} />
                    {phoneError && <p className="text-caption text-danger-ink">{phoneError}</p>}
                  </div>
                  <div className="space-y-1">
                    <DateInput
                      label="Date of birth"
                      value={dob || undefined}
                      onChange={(v) => setDob(v ?? '')}
                    />
                  </div>
                  <div className="space-y-1">
                    <Selector
                      label="Gender"
                      options={[
                        { value: NONE, label: '—' },
                        { value: 'male', label: 'Male' },
                        { value: 'female', label: 'Female' },
                        { value: 'prefer_not_to_say', label: 'Prefer not to say' },
                      ]}
                      value={gender || NONE}
                      onChange={(v) => setGender(v === NONE ? '' : v)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Selector
                      label="Seniority"
                      options={[
                        { value: NONE, label: '—' },
                        ...seniorityOptions.map((s) => ({ value: s, label: s })),
                      ]}
                      value={seniority || NONE}
                      onChange={(v) => setSeniority(v === NONE ? '' : v)}
                      placeholder="Select seniority"
                    />
                  </div>
                  <div className="space-y-1">
                    <Selector
                      label="Source"
                      options={[
                        { value: NONE, label: '—' },
                        ...sourceOptions.map((s) => ({ value: s, label: s })),
                      ]}
                      value={source || NONE}
                      onChange={(v) => setSource(v === NONE ? '' : v)}
                      placeholder="Select source"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Selector
                    label="Position applied"
                    isRequired
                    options={openReqs.map((r) => ({ value: r.id, label: r.title }))}
                    value={effectiveReq}
                    onChange={(v) => setReqId(v)}
                    placeholder="Select a position"
                  />
                </div>
                <Field label="Skills" inputID={skillsId} labelID={skillsId} isGroupLabel>
                  <SkillPicker value={skills} onChange={setSkills} />
                </Field>
                <Textarea label="Notes" value={note} onChange={(value) => setNote(value)} />
                {suggestions.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-caption text-ink-subtle">From CV, not in catalog:</span>
                    {suggestions.map((sg) => (
                      <Badge key={sg} variant="neutral" className="border-dashed" label={sg} />
                    ))}
                  </div>
                )}
              </div>
            </LayoutContent>
          }
          footer={
            <LayoutFooter hasDivider>
              <div className="space-y-2">
                {error && <Banner status="error" title={error} />}
                <div className="flex items-center justify-between gap-2">
                  <p className="text-body-sm text-danger-ink">{requiredError}</p>
                  <div className="flex shrink-0 gap-2">
                    <Button variant="secondary" label="Cancel" onClick={close} />
                    <Button
                      label={mutation.isPending ? 'Saving…' : 'Save candidate'}
                      onClick={submit}
                      isDisabled={mutation.isPending || parse.isPending}
                    />
                  </div>
                </div>
              </div>
            </LayoutFooter>
          }
        />
      </Dialog>
    </>
  );
}
