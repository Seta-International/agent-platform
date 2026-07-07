import {
  Alert,
  AlertDescription,
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { useMemo, useState } from 'react';
import { addCandidate, fetchCandidates, fetchRequisitions } from '../api/hiring-client.ts';
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
    setError(null);
    setSubmitAttempted(false);
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

  const mutation = useMutation({
    mutationFn: () => {
      return addCandidate({
        requisition_id: effectiveReq,
        name,
        email: email.trim() || undefined,
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
    },
    onSuccess: () => {
      toast.success('Candidate added');
      void queryClient.invalidateQueries({ queryKey: hiringKeys.candidates() });
      setOpen(false);
      reset();
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
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">New candidate</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New candidate</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 max-h-[70vh] overflow-y-auto">
          <div className="space-y-1">
            <Label htmlFor="cand-name">Full name *</Label>
            <Input id="cand-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="cand-email">Email</Label>
              <Input id="cand-email" value={email} onChange={(e) => setEmail(e.target.value)} />
              {emailError && <p className="text-caption text-danger-ink">{emailError}</p>}
            </div>
            <div className="space-y-1">
              <Label htmlFor="cand-phone">Phone</Label>
              <Input id="cand-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
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
              <Select value={gender || NONE} onValueChange={(v) => setGender(v === NONE ? '' : v)}>
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
              <Select value={source || NONE} onValueChange={(v) => setSource(v === NONE ? '' : v)}>
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
              <SelectTrigger id="cand-req" className="w-full">
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
          </div>
          <div className="space-y-1">
            <Label>Skills</Label>
            <SkillPicker value={skills} onChange={setSkills} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="cand-note">Notes</Label>
            <Textarea id="cand-note" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <div className="rounded border border-hairline bg-surface-2 px-3 py-2 text-caption text-ink-muted">
            CV auto-fill coming soon — enter details manually for now.
          </div>
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
            <Button onClick={submit} disabled={mutation.isPending}>
              {mutation.isPending ? 'Saving…' : 'Save candidate'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
