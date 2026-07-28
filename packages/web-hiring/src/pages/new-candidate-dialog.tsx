import {
  AlertDialog,
  Badge,
  Banner,
  Button,
  Dialog,
  DialogHeader,
  Field,
  FileInput,
  HStack,
  Input,
  Layout,
  LayoutContent,
  LayoutFooter,
  Selector,
  Textarea,
  useToast,
} from '@seta/shared-ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, Plus, X } from 'lucide-react';
import { useId, useMemo, useRef, useState } from 'react';
import {
  addCandidate,
  type CandidateDuplicate,
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
const PHONE_RE = /^\+?[0-9()\-.\s]{7,25}$/;
const NAME_ERROR_MESSAGE = 'Full name must be a valid person name.';
const NAME_RE = /^[\p{L}\p{M}]+(?:[ '’-][\p{L}\p{M}]+)*$/u;

function isValidPhone(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return true;
  if (!PHONE_RE.test(trimmed)) return false;
  const digits = trimmed.replace(/\D/g, '');
  return digits.length >= 7 && digits.length <= 15;
}

function normalizeName(value: string) {
  return value.normalize('NFC').replace(/\s+/g, ' ').replace(/‐/g, '-').trim();
}

export function NewCandidateDialog() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const skillsId = useId();
  const parseGen = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  // FUT-633: when a second CV is uploaded before the dialog closes, replace ALL parseable
  // fields instead of the default fill-only-empty guard, so no stale data from CV A survives.
  const replacingCvRef = useRef(false);
  const dobFieldRef = useRef<HTMLDivElement>(null);
  const dobInputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [dob, setDob] = useState('');
  const [dobBadInput, setDobBadInput] = useState(false);
  const [gender, setGender] = useState('');
  const [seniority, setSeniority] = useState('');
  const [source, setSource] = useState('');
  const [reqId, setReqId] = useState('');
  const [note, setNote] = useState('');
  const [skills, setSkills] = useState<PickedSkill[]>([]);
  const [cvFile, setCvFile] = useState<File | null>(null);
  // FUT-559: the parsed CV carries a content hash + any candidates it may duplicate; warn the
  // recruiter before they create a second record, and pass the hash through on save so the
  // stored CV is dedup-aware.
  const [cvSha256, setCvSha256] = useState<string | null>(null);
  const [duplicates, setDuplicates] = useState<CandidateDuplicate[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  // FUT-755: surface CV-parse failures inline in the dialog. A toast is promoted to the browser
  // top layer at app mount, so it paints behind the modal (also top-layer, promoted later) and
  // gets hidden. An inline Banner sits next to the upload field and can never be occluded.
  const [cvError, setCvError] = useState<string | null>(null);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const emailError = email.trim() && !EMAIL_RE.test(email.trim()) ? 'Enter a valid email.' : null;
  const phoneError = phone.trim() && !isValidPhone(phone) ? 'Enter a valid phone number.' : null;
  const nameError = name.trim() && !NAME_RE.test(normalizeName(name)) ? NAME_ERROR_MESSAGE : null;
  const dobError = (() => {
    // Browser rejected the date entirely (e.g. Feb 31, Feb 29 non-leap)
    if (dobBadInput || dobInputRef.current?.validity?.badInput) return 'Invalid calendar date.';
    if (!dob) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) return 'Invalid date format.';
    const parts = dob.split('-').map(Number) as [number, number, number];
    const [y, m, d] = parts;
    const date = new Date(y, m - 1, d);
    if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d)
      return 'Invalid calendar date.';
    // Compare local dates to prevent timezone-shift false negatives.
    const todayLocal = new Date(
      new Date().getFullYear(),
      new Date().getMonth(),
      new Date().getDate(),
    );
    if (date >= todayLocal) return 'Date of birth cannot be in the future.';
    const age = Math.floor((Date.now() - date.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
    if (age < 18) return 'Candidate must be at least 18 years old.';
    if (age >= 100) return 'Candidate must be under 100 years old.';
    return null;
  })();

  const { data: reqs } = useQuery({
    queryKey: hiringKeys.requisitionOptions(),
    queryFn: fetchRequisitions,
  });
  // FUT-765: only requisitions still open for recruitment are assignable. A requisition keeps
  // status 'open' after its headcount is hired out (openings fill without closing it), so also
  // require a remaining opening — a candidate added to a filled role could never be hired.
  const openReqs = (reqs ?? []).filter((r) => r.status === 'open' && r.openings_open > 0);

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
    abortRef.current?.abort();
    parseGen.current += 1;
    parse.reset();
    replacingCvRef.current = false;
    setName('');
    setEmail('');
    setPhone('');
    setDob('');
    setDobBadInput(false);
    setGender('');
    setSeniority('');
    setSource('');
    setReqId('');
    setNote('');
    setSkills([]);
    setCvFile(null);
    setCvSha256(null);
    setDuplicates([]);
    setSuggestions([]);
    setError(null);
    setCvError(null);
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
    if (!v && dirty) {
      setConfirmDiscard(true);
      return;
    }
    setOpen(v);
    if (!v) reset();
  }

  const effectiveReq = reqId || openReqs[0]?.id || '';
  const missingRequired = !name.trim() || !effectiveReq;
  // FUT-559 unsaved-input guard: confirm before dismissing a form the recruiter has started.
  const dirty = !!(
    name.trim() ||
    email.trim() ||
    phone.trim() ||
    dob ||
    gender ||
    seniority ||
    source ||
    note.trim() ||
    skills.length ||
    cvFile
  );
  // FUT-559 error focus: red per-field message + scroll to the first empty required field.
  const nameFieldRef = useRef<HTMLDivElement>(null);
  const reqFieldRef = useRef<HTMLDivElement>(null);
  const nameInvalid = submitAttempted && !name.trim();
  const reqInvalid = submitAttempted && !effectiveReq;

  // Fill-only-empty: a parse never overwrites what the recruiter already typed.
  const parse = useMutation({
    mutationFn: (file: File) => parseCandidateCvDraft(file, abortRef.current?.signal ?? undefined),
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
          await editCandidate(res.candidate_id, {
            patch: { cv_storage_key: s3_key, cv_sha256: cvSha256 ?? undefined },
          });
        } catch (e) {
          cvWarning = `CV was not attached: ${(e as Error).message}`;
        }
      }
      return { cvWarning };
    },
    onSuccess: ({ cvWarning }) => {
      toast({ body: 'Candidate added' });
      if (cvWarning) toast({ body: cvWarning, type: 'error' });
      void queryClient.invalidateQueries({ queryKey: hiringKeys.candidates() });
      void queryClient.invalidateQueries({ queryKey: hiringKeys.candidateStageCounts() });
      close();
    },
    onError: (e: Error) => setError(e.message),
  });

  function submit() {
    setSubmitAttempted(true);
    const isBadInput = dobBadInput || dobInputRef.current?.validity?.badInput;
    if (isBadInput) {
      setDobBadInput(true);
    }
    if (missingRequired || emailError || phoneError || nameError || dobError || isBadInput) {
      const target =
        !name.trim() || nameError
          ? nameFieldRef.current
          : !effectiveReq
            ? reqFieldRef.current
            : dobError || isBadInput
              ? dobFieldRef.current
              : null;
      target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setError(null);
    mutation.mutate();
  }

  return (
    <>
      <Button
        size="sm"
        variant="primary"
        icon={<Plus className="size-3.5" />}
        label="New candidate"
        onClick={() => setOpen(true)}
      />
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
                        abortRef.current?.abort();
                        parseGen.current += 1;
                        // FUT-633: mark replace mode so the next upload overwrites
                        // unconditionally instead of hitting the fill-only-empty guard.
                        replacingCvRef.current = true;
                        setName('');
                        setEmail('');
                        setPhone('');
                        setDob('');
                        setDobBadInput(false);
                        setGender('');
                        setSeniority('');
                        setNote('');
                        setSkills([]);
                        setCvFile(null);
                        setSuggestions([]);
                        setCvSha256(null);
                        setDuplicates([]);
                        setCvError(null);
                      }}
                    />
                  </div>
                ) : (
                  <FileInput
                    mode="dropzone"
                    label="Upload CV to auto-fill"
                    accept=".pdf,.docx"
                    maxSize={10 * 1024 * 1024}
                    value={null}
                    onChange={(file) => {
                      if (file instanceof File) {
                        abortRef.current?.abort();
                        abortRef.current = new AbortController();
                        // FUT-633: when replacing a CV (user removed the previous one),
                        // clear every parseable field before the new parse so no stale
                        // data survives.  The replacingCvRef flag also makes onSuccess
                        // overwrite unconditionally instead of fill-only-empty.
                        if (replacingCvRef.current) {
                          setName('');
                          setEmail('');
                          setPhone('');
                          setDob('');
                          setDobBadInput(false);
                          setGender('');
                          setSeniority('');
                          setNote('');
                          setSkills([]);
                          setSuggestions([]);
                          setCvSha256(null);
                          setDuplicates([]);
                        }
                        setCvFile(file);
                        setCvError(null);
                        parseGen.current += 1;
                        const gen = parseGen.current;
                        parse.mutate(file, {
                          onSuccess: (draft) => {
                            if (parseGen.current !== gen) return;
                            if (replacingCvRef.current) {
                              // Replace mode: unconditionally overwrite with new CV data.
                              if (draft.name) setName(draft.name);
                              if (draft.personal_email) setEmail(draft.personal_email);
                              if (draft.phone) setPhone(draft.phone);
                              if (draft.dob) {
                                setDob(draft.dob);
                                setDobBadInput(false);
                              }
                              if (draft.gender) setGender(draft.gender);
                              if (draft.seniority) setSeniority(draft.seniority);
                              if (draft.note) setNote(draft.note);
                              setSkills(draft.skills);
                            } else {
                              // Fill-only-empty: never overwrite what the recruiter typed.
                              if (!name.trim() && draft.name) setName(draft.name);
                              if (!email.trim() && draft.personal_email)
                                setEmail(draft.personal_email);
                              if (!phone.trim() && draft.phone) setPhone(draft.phone);
                              if (!dob && draft.dob) {
                                setDob(draft.dob);
                                setDobBadInput(false);
                              }
                              if (!gender && draft.gender) setGender(draft.gender);
                              if (!seniority && draft.seniority) setSeniority(draft.seniority);
                              if (!note.trim() && draft.note) setNote(draft.note);
                              setSkills((prev) => {
                                const have = new Set(prev.map((s) => s.skill_id));
                                return [
                                  ...prev,
                                  ...draft.skills.filter((s) => !have.has(s.skill_id)),
                                ];
                              });
                            }
                            setSuggestions(draft.skill_suggestions);
                            setCvSha256(draft.cv_sha256);
                            setDuplicates(draft.possible_duplicates);
                            toast({
                              body: 'CV parsed — review the pre-filled fields before saving',
                            });
                          },
                          onError: (e: Error) => {
                            if (parseGen.current !== gen) return;
                            setCvError(e.message);
                          },
                        });
                      }
                    }}
                    isLoading={parse.isPending}
                    isDisabled={parse.isPending}
                    placeholder="Drop a CV here, or click to choose one"
                    description="PDF or DOCX, up to 10MB — parsed fields stay editable"
                  />
                )}
                {cvError && <Banner status="error" title={cvError} />}
                {duplicates.length > 0 && (
                  <Banner
                    status="warning"
                    title={`This CV may already be in the system: ${duplicates
                      .map(
                        (d) =>
                          `${d.name} (${d.match === 'file' ? 'same file' : d.match === 'email' ? 'same email' : 'same phone'})`,
                      )
                      .join(', ')}`}
                  />
                )}
                <div className="space-y-1" ref={nameFieldRef}>
                  {/* status drives the red border + message together, so an empty-on-submit or
                      malformed name is flagged on the field itself, not just as text below it. */}
                  <Input
                    label="Full name"
                    isRequired
                    value={name}
                    onChange={(value) => setName(value)}
                    status={
                      nameInvalid
                        ? { type: 'error', message: 'Full name is required.' }
                        : nameError
                          ? { type: 'error', message: nameError }
                          : undefined
                    }
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
                    {emailError && <p className="text-sm text-error">{emailError}</p>}
                  </div>
                  <div className="space-y-1">
                    <Input label="Phone" value={phone} onChange={(value) => setPhone(value)} />
                    {phoneError && <p className="text-sm text-error">{phoneError}</p>}
                  </div>
                  <div className="space-y-1" ref={dobFieldRef}>
                    <Input
                      ref={dobInputRef}
                      id="cand-dob"
                      type={'date' as unknown as undefined}
                      label="Date of birth"
                      value={dob}
                      onChange={(value, e) => {
                        setDob(value);
                        setDobBadInput(
                          (e as unknown as React.ChangeEvent<HTMLInputElement>)?.target?.validity
                            ?.badInput ?? false,
                        );
                      }}
                      onBlur={(e) => {
                        setDobBadInput(
                          (e as unknown as React.FocusEvent<HTMLInputElement>)?.target?.validity
                            ?.badInput ?? false,
                        );
                      }}
                    />
                    {dobError && <p className="text-sm text-error">{dobError}</p>}
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
                <div className="space-y-1" ref={reqFieldRef}>
                  <Selector
                    label="Position applied"
                    isRequired
                    options={openReqs.map((r) => ({ value: r.id, label: r.title }))}
                    value={effectiveReq}
                    onChange={(v) => setReqId(v)}
                    placeholder="Select a position"
                    status={
                      reqInvalid
                        ? { type: 'error', message: 'Position applied is required.' }
                        : undefined
                    }
                  />
                </div>
                <Field label="Skills" inputID={skillsId} labelID={skillsId} isGroupLabel>
                  <fieldset aria-labelledby={skillsId}>
                    <SkillPicker value={skills} onChange={setSkills} />
                  </fieldset>
                </Field>
                <Textarea label="Notes" value={note} onChange={(value) => setNote(value)} />
                {suggestions.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm text-secondary">From CV, not in catalog:</span>
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
                <div className="flex items-center justify-end gap-2">
                  <HStack gap={2} hAlign="end">
                    {/* Route Cancel through the same dirty-guard as the close (X) button so
                        unsaved input prompts a discard confirmation instead of vanishing. */}
                    <Button
                      variant="secondary"
                      label="Cancel"
                      onClick={() => handleOpenChange(false)}
                    />
                    <Button
                      variant="primary"
                      icon={<Plus className="size-4" />}
                      label={mutation.isPending ? 'Creating…' : 'Create'}
                      onClick={submit}
                      isDisabled={mutation.isPending || parse.isPending}
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
        title="Discard this candidate?"
        description="Your inputs haven't been saved."
        cancelLabel="Keep editing"
        actionLabel="Discard"
        actionVariant="destructive"
        onAction={close}
      />
    </>
  );
}
