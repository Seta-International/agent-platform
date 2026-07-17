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
  Badge,
  Button,
  Dialog,
  DialogContent,
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
  Textarea,
  toast,
} from '@seta/shared-ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, X } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
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
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const emailError = email.trim() && !EMAIL_RE.test(email.trim()) ? 'Enter a valid email.' : null;
  const phoneError =
    phone.trim() && !PHONE_RE.test(phone.trim()) ? 'Enter a valid phone number.' : null;

  // Anything worth keeping? Esc/overlay/Cancel ask before throwing it away.
  const dirty =
    name.trim() !== '' ||
    email.trim() !== '' ||
    phone.trim() !== '' ||
    dob !== '' ||
    gender !== '' ||
    seniority !== '' ||
    source !== '' ||
    reqId !== '' ||
    note.trim() !== '' ||
    skills.length > 0 ||
    cvFile !== null;

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
    setConfirmDiscard(false);
  }

  // Radix only fires onOpenChange for its own dismissals (Esc, overlay); closing
  // programmatically must reset explicitly or the next open shows stale data.
  function close() {
    setOpen(false);
    reset();
  }

  // Every dismissal path (Esc, overlay click, Cancel) funnels through here so a
  // half-typed candidate is never lost to one keystroke.
  function requestClose() {
    if (dirty) setConfirmDiscard(true);
    else close();
  }

  const effectiveReq = reqId || openReqs[0]?.id || '';
  const missingRequired = !name.trim() || !effectiveReq;
  // Same required-field feedback as NewRequisitionDialog: red border + scroll-to on
  // save, no warning text; the highlight clears live as the user fills the field.
  const nameInvalid = submitAttempted && !name.trim();
  const reqInvalid = submitAttempted && !effectiveReq;
  const nameRef = useRef<HTMLInputElement>(null);
  const reqRef = useRef<HTMLButtonElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);

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
    if (missingRequired) {
      const target = !name.trim() ? nameRef.current : reqRef.current;
      target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (!name.trim()) nameRef.current?.focus({ preventScroll: true });
      return;
    }
    if (emailError || phoneError) {
      const target = emailError ? emailRef.current : phoneRef.current;
      target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      target?.focus({ preventScroll: true });
      return;
    }
    setError(null);
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
      <DialogTrigger asChild>
        <Button size="sm">New candidate</Button>
      </DialogTrigger>
      <DialogContent
        unstyled
        onOpenAutoFocus={(e) => e.preventDefault()}
        className="w-full max-w-lg"
      >
        <DialogTitle className="sr-only">New candidate</DialogTitle>
        <div className="flex max-h-[85vh] flex-col overflow-hidden rounded-lg">
          <header className="border-b border-hairline bg-canvas px-6 py-4">
            <h1 className="text-card-title font-semibold leading-none tracking-tight text-ink">
              New candidate
            </h1>
          </header>
          <div className="min-h-0 flex-1 overflow-auto">
            <div className="space-y-3 px-6 py-4">
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
                <Label htmlFor="cand-name">Full name *</Label>
                <Input
                  id="cand-name"
                  ref={nameRef}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  aria-invalid={nameInvalid}
                  className={nameInvalid ? '!border-danger' : undefined}
                />
                {nameInvalid && (
                  <p className="text-caption text-danger-ink">Full name is required.</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="cand-email">Email</Label>
                  <Input
                    id="cand-email"
                    ref={emailRef}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    aria-invalid={!!emailError}
                    className={emailError ? '!border-danger' : undefined}
                  />
                  {emailError && <p className="text-caption text-danger-ink">{emailError}</p>}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="cand-phone">Phone</Label>
                  <Input
                    id="cand-phone"
                    ref={phoneRef}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    aria-invalid={!!phoneError}
                    className={phoneError ? '!border-danger' : undefined}
                  />
                  {phoneError && <p className="text-caption text-danger-ink">{phoneError}</p>}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="cand-dob">Date of birth</Label>
                  <Input
                    id="cand-dob"
                    type="date"
                    value={dob}
                    onChange={(e) => setDob(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="cand-gender">Gender</Label>
                  <Select
                    value={gender || NONE}
                    onValueChange={(v) => setGender(v === NONE ? '' : v)}
                  >
                    <SelectTrigger id="cand-gender" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>—</SelectItem>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                      <SelectItem value="prefer_not_to_say">Prefer not to say</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="cand-seniority">Seniority</Label>
                  <Select
                    value={seniority || NONE}
                    onValueChange={(v) => setSeniority(v === NONE ? '' : v)}
                  >
                    <SelectTrigger id="cand-seniority" className="w-full">
                      <SelectValue placeholder="Select seniority" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>—</SelectItem>
                      {seniorityOptions.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="cand-source">Source</Label>
                  <Select
                    value={source || NONE}
                    onValueChange={(v) => setSource(v === NONE ? '' : v)}
                  >
                    <SelectTrigger id="cand-source" className="w-full">
                      <SelectValue placeholder="Select source" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>—</SelectItem>
                      {sourceOptions.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="cand-req">Position applied *</Label>
                <Select value={effectiveReq} onValueChange={(v) => setReqId(v)}>
                  <SelectTrigger
                    id="cand-req"
                    ref={reqRef}
                    aria-invalid={reqInvalid}
                    className={`w-full ${reqInvalid ? '!border-danger' : ''}`}
                  >
                    <SelectValue placeholder="Select a position" />
                  </SelectTrigger>
                  <SelectContent>
                    {openReqs.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {reqInvalid && (
                  <p className="text-caption text-danger-ink">Position applied is required.</p>
                )}
              </div>
              <div className="space-y-1">
                <Label>Skills</Label>
                <SkillPicker value={skills} onChange={setSkills} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="cand-note">Notes</Label>
                <Textarea id="cand-note" value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
              {suggestions.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-caption text-ink-subtle">From CV, not in catalog:</span>
                  {suggestions.map((sg) => (
                    <Badge key={sg} variant="outline" className="border-dashed">
                      {sg}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
          <footer className="space-y-2 border-t border-hairline bg-canvas px-6 py-3">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="flex items-center justify-end gap-2">
              <Button variant="secondary" onClick={requestClose}>
                Cancel
              </Button>
              <Button onClick={submit} disabled={mutation.isPending || parse.isPending}>
                {mutation.isPending ? 'Saving…' : 'Save candidate'}
              </Button>
            </div>
          </footer>
        </div>
      </DialogContent>
      <AlertDialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard this candidate?</AlertDialogTitle>
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
