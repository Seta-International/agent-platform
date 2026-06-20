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
  Textarea,
  toast,
} from '@seta/shared-ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import {
  type AccountListRow,
  fetchAccounts,
  type SubmitCharterBody,
  submitCharter,
} from '../api/pm-client.ts';

type FormState = {
  account_id: string;
  name: string;
  pm_worker_id: string;
  methodology: SubmitCharterBody['methodology'] | '';
  pricing_model: SubmitCharterBody['pricing_model'] | '';
  team_size: string;
  budget_bmm: string;
  date_from: string;
  date_to: string;
  objective: string;
  scope_in: string;
  scope_out: string;
};

const EMPTY: FormState = {
  account_id: '',
  name: '',
  pm_worker_id: '',
  methodology: '',
  pricing_model: '',
  team_size: '',
  budget_bmm: '',
  date_from: '',
  date_to: '',
  objective: '',
  scope_in: '',
  scope_out: '',
};

export function SubmitCharterDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [error, setError] = useState<string | null>(null);

  const { data: accounts } = useQuery<AccountListRow[]>({
    queryKey: ['pm', 'accounts'],
    queryFn: fetchAccounts,
    enabled: open,
  });

  const mutation = useMutation({
    mutationFn: () => {
      const body: SubmitCharterBody = {
        account_id: form.account_id,
        name: form.name,
        pm_worker_id: form.pm_worker_id,
        ...(form.methodology ? { methodology: form.methodology } : {}),
        ...(form.pricing_model ? { pricing_model: form.pricing_model } : {}),
        ...(form.team_size ? { team_size: Number(form.team_size) } : {}),
        ...(form.budget_bmm ? { budget_bmm: Number(form.budget_bmm) } : {}),
        ...(form.date_from ? { date_from: form.date_from } : {}),
        ...(form.date_to ? { date_to: form.date_to } : {}),
        ...(form.objective ? { objective: form.objective } : {}),
        ...(form.scope_in || form.scope_out
          ? { scope: { in: form.scope_in, out: form.scope_out } }
          : {}),
      };
      return submitCharter(body);
    },
    onSuccess: () => {
      toast.success('Charter submitted');
      onCreated();
      setOpen(false);
      setForm(EMPTY);
      setError(null);
    },
    onError: (e: Error) => setError(e.message),
  });

  function set(patch: Partial<FormState>) {
    setForm((f) => ({ ...f, ...patch }));
  }

  const canSubmit =
    !mutation.isPending &&
    form.name.trim() !== '' &&
    form.account_id !== '' &&
    form.pm_worker_id.trim() !== '';

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) {
          setForm(EMPTY);
          setError(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">New request</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Submit project charter</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Account *</Label>
            <select
              className="flex h-9 w-full rounded-md border border-stroke bg-surface px-3 py-1 text-sm text-ink shadow-xs transition-colors focus:outline-none focus:ring-1 focus:ring-brand disabled:cursor-not-allowed disabled:opacity-50"
              value={form.account_id}
              onChange={(e) => set({ account_id: e.target.value })}
            >
              <option value="">Select account</option>
              {(accounts ?? []).map((a) => (
                <option key={a.account_id} value={a.account_id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <Label>Project name *</Label>
            <Input value={form.name} onChange={(e) => set({ name: e.target.value })} />
          </div>

          <div className="space-y-1">
            <Label>PM (worker id) *</Label>
            <Input
              value={form.pm_worker_id}
              onChange={(e) => set({ pm_worker_id: e.target.value })}
              placeholder="uuid"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Methodology</Label>
              <select
                className="flex h-9 w-full rounded-md border border-stroke bg-surface px-3 py-1 text-sm text-ink shadow-xs transition-colors focus:outline-none focus:ring-1 focus:ring-brand disabled:cursor-not-allowed disabled:opacity-50"
                value={form.methodology}
                onChange={(e) =>
                  set({ methodology: e.target.value as SubmitCharterBody['methodology'] | '' })
                }
              >
                <option value="">—</option>
                <option value="scrum">Scrum</option>
                <option value="kanban">Kanban</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label>Pricing</Label>
              <select
                className="flex h-9 w-full rounded-md border border-stroke bg-surface px-3 py-1 text-sm text-ink shadow-xs transition-colors focus:outline-none focus:ring-1 focus:ring-brand disabled:cursor-not-allowed disabled:opacity-50"
                value={form.pricing_model}
                onChange={(e) =>
                  set({
                    pricing_model: e.target.value as SubmitCharterBody['pricing_model'] | '',
                  })
                }
              >
                <option value="">—</option>
                <option value="fixed_price">Fixed-price</option>
                <option value="time_materials">Time &amp; materials</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Team size</Label>
              <Input
                type="number"
                min={0}
                value={form.team_size}
                onChange={(e) => set({ team_size: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Budget (BMM)</Label>
              <Input
                type="number"
                min={0}
                step="0.25"
                value={form.budget_bmm}
                onChange={(e) => set({ budget_bmm: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Date from</Label>
              <Input
                type="date"
                value={form.date_from}
                onChange={(e) => set({ date_from: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Date to</Label>
              <Input
                type="date"
                value={form.date_to}
                onChange={(e) => set({ date_to: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label>Objective</Label>
            <Textarea value={form.objective} onChange={(e) => set({ objective: e.target.value })} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Scope (in)</Label>
              <Textarea value={form.scope_in} onChange={(e) => set({ scope_in: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Scope (out)</Label>
              <Textarea
                value={form.scope_out}
                onChange={(e) => set({ scope_out: e.target.value })}
              />
            </div>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => mutation.mutate()} disabled={!canSubmit}>
              {mutation.isPending ? 'Submitting…' : 'Submit'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
