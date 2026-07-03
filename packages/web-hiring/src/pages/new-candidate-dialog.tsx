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
import { useState } from 'react';
import { addCandidate, fetchRequisitions } from '../api/hiring-client.ts';
import { hiringKeys } from '../state/query-keys.ts';
import { type PickedSkill, SkillPicker } from './skill-picker.tsx';

const NONE = '__none__';

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

  const { data: reqs } = useQuery({
    queryKey: hiringKeys.requisitions(),
    queryFn: fetchRequisitions,
  });
  const openReqs = (reqs ?? []).filter((r) => r.status === 'open' || r.status === 'on_hold');

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
  }

  const effectiveReq = reqId || openReqs[0]?.id || '';

  const mutation = useMutation({
    mutationFn: () => {
      if (!name.trim() || !effectiveReq) {
        throw new Error('A name and an open role are required.');
      }
      return addCandidate({
        requisition_id: effectiveReq,
        name,
        personal_email: email || undefined,
        phone: phone || undefined,
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
            </div>
            <div className="space-y-1">
              <Label htmlFor="cand-phone">Phone</Label>
              <Input id="cand-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
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
              <Input
                id="cand-seniority"
                value={seniority}
                onChange={(e) => setSeniority(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cand-source">Source</Label>
              <Input id="cand-source" value={source} onChange={(e) => setSource(e.target.value)} />
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
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending || !name.trim() || !effectiveReq}
            >
              {mutation.isPending ? 'Saving…' : 'Save candidate'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
