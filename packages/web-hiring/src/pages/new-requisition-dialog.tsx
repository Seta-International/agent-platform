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
  SegmentedControl,
  Textarea,
  toast,
} from '@seta/shared-ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { type JdSectionKey, type JdVariant, openRequisition } from '../api/hiring-client.ts';
import { hiringKeys } from '../state/query-keys.ts';

const SECTIONS: { key: JdSectionKey; label: string }[] = [
  { key: 'about', label: 'About the role' },
  { key: 'responsibilities', label: 'Responsibilities' },
  { key: 'requirements', label: 'Requirements' },
  { key: 'nice_to_have', label: 'Nice to have' },
];

export function NewRequisitionDialog() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [grade, setGrade] = useState('L4');
  const [kind, setKind] = useState<'new' | 'replacement'>('new');
  const [mode, setMode] = useState<'online' | 'onsite' | 'either'>('online');
  const [due, setDue] = useState('');
  const [headcount, setHeadcount] = useState(1);
  const [stack, setStack] = useState('');
  const [variant, setVariant] = useState<JdVariant>('external');
  const [jd, setJd] = useState<Record<JdSectionKey, string>>({
    about: '',
    responsibilities: '',
    requirements: '',
    nice_to_have: '',
  });
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setTitle('');
    setGrade('L4');
    setKind('new');
    setMode('online');
    setDue('');
    setHeadcount(1);
    setStack('');
    setVariant('external');
    setJd({ about: '', responsibilities: '', requirements: '', nice_to_have: '' });
    setError(null);
  }

  const mutation = useMutation({
    mutationFn: () => {
      const skills = stack
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => {
          const [name = s] = s.split(/[·|]/).map((x) => x.trim());
          return { skill_name: name };
        });
      const jd_sections = SECTIONS.filter((s) => jd[s.key].trim()).map((s) => ({
        variant,
        section: s.key,
        body: jd[s.key],
      }));
      return openRequisition({
        title,
        kind,
        grade: grade || undefined,
        default_interview_mode: mode,
        due_date: due || undefined,
        headcount,
        jd_sections,
        skills,
      });
    },
    onSuccess: () => {
      toast.success('Requisition created');
      void queryClient.invalidateQueries({ queryKey: hiringKeys.requisitions() });
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
        <Button size="sm">New requisition</Button>
      </DialogTrigger>
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
              <Input value={grade} onChange={(e) => setGrade(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Type</Label>
              <select
                className="w-full rounded border border-hairline bg-surface-1 px-2 py-1"
                value={kind}
                onChange={(e) => setKind(e.target.value as 'new' | 'replacement')}
              >
                <option value="new">new</option>
                <option value="replacement">replacement</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Interview mode</Label>
              <select
                className="w-full rounded border border-hairline bg-surface-1 px-2 py-1"
                value={mode}
                onChange={(e) => setMode(e.target.value as 'online' | 'onsite' | 'either')}
              >
                <option value="online">Online (Teams)</option>
                <option value="onsite">Onsite</option>
                <option value="either">Either</option>
              </select>
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
          <div className="space-y-1">
            <Label>Due date</Label>
            <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Tech stack — comma-separated</Label>
            <Input
              value={stack}
              onChange={(e) => setStack(e.target.value)}
              placeholder="React, TypeScript, AWS"
            />
          </div>
          <div className="flex items-center justify-between pt-2">
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
            <div key={s.key} className="space-y-1">
              <Label>{s.label}</Label>
              <Textarea
                value={jd[s.key]}
                onChange={(e) => setJd((d) => ({ ...d, [s.key]: e.target.value }))}
              />
            </div>
          ))}
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
              disabled={mutation.isPending || !title.trim()}
            >
              {mutation.isPending ? 'Creating…' : 'Create requisition'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
