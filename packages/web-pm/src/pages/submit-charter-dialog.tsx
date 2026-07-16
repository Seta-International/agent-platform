import {
  Banner,
  Button,
  DateInput,
  Dialog,
  DialogHeader,
  Input,
  Label,
  Layout,
  LayoutContent,
  LayoutFooter,
  NumberInput,
  type SearchableItem,
  Selector,
  Textarea,
  Typeahead,
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
import { useWorkerSource } from '../api/worker-search';

const NONE = '__none__';

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
  const [pmWorker, setPmWorker] = useState<SearchableItem | null>(null);

  const workerSource = useWorkerSource();

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
      setPmWorker(null);
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

  function handleOpenChange(v: boolean) {
    setOpen(v);
    if (!v) {
      setForm(EMPTY);
      setPmWorker(null);
      setError(null);
    }
  }

  return (
    <>
      <Button size="sm" label="New request" onClick={() => setOpen(true)} />
      <Dialog isOpen={open} onOpenChange={handleOpenChange} width={560} purpose="form">
        <Layout
          header={<DialogHeader title="Submit project charter" onOpenChange={handleOpenChange} />}
          content={
            <LayoutContent>
              <div className="space-y-3">
                <div className="space-y-1">
                  <Selector
                    label="Account *"
                    options={(accounts ?? []).map((a) => ({
                      value: a.account_id,
                      label: a.name,
                    }))}
                    value={form.account_id || undefined}
                    onChange={(v) => set({ account_id: v })}
                    placeholder="Select account"
                  />
                </div>

                <div className="space-y-1">
                  <Input
                    label="Project name *"
                    value={form.name}
                    onChange={(value) => set({ name: value })}
                  />
                </div>

                <div className="space-y-1">
                  <Label>PM *</Label>
                  <Typeahead
                    label="PM"
                    isLabelHidden
                    searchSource={workerSource.source}
                    value={pmWorker}
                    onChange={(item) => {
                      setPmWorker(item);
                      set({ pm_worker_id: item?.id ?? '' });
                    }}
                    placeholder="Search workers…"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Selector
                      label="Methodology"
                      options={[
                        { value: NONE, label: '—' },
                        { value: 'scrum', label: 'Scrum' },
                        { value: 'kanban', label: 'Kanban' },
                      ]}
                      value={form.methodology || NONE}
                      onChange={(v) =>
                        set({
                          methodology: (v === NONE ? '' : v) as
                            | SubmitCharterBody['methodology']
                            | '',
                        })
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Selector
                      label="Pricing"
                      options={[
                        { value: NONE, label: '—' },
                        { value: 'fixed_price', label: 'Fixed-price' },
                        { value: 'time_materials', label: 'Time & materials' },
                      ]}
                      value={form.pricing_model || NONE}
                      onChange={(v) =>
                        set({
                          pricing_model: (v === NONE ? '' : v) as
                            | SubmitCharterBody['pricing_model']
                            | '',
                        })
                      }
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <NumberInput
                    label="Team size"
                    min={0}
                    isIntegerOnly
                    value={form.team_size === '' ? null : Number(form.team_size)}
                    onChange={(v) => set({ team_size: String(v) })}
                  />
                  <NumberInput
                    label="Budget (BMM)"
                    min={0}
                    step={0.25}
                    value={form.budget_bmm === '' ? null : Number(form.budget_bmm)}
                    onChange={(v) => set({ budget_bmm: String(v) })}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <DateInput
                      label="Date from"
                      value={form.date_from || undefined}
                      onChange={(v) => set({ date_from: v ?? '' })}
                    />
                  </div>
                  <div className="space-y-1">
                    <DateInput
                      label="Date to"
                      value={form.date_to || undefined}
                      onChange={(v) => set({ date_to: v ?? '' })}
                    />
                  </div>
                </div>

                <Textarea
                  label="Objective"
                  value={form.objective}
                  onChange={(value) => set({ objective: value })}
                />

                <div className="grid grid-cols-2 gap-3">
                  <Textarea
                    label="Scope (in)"
                    value={form.scope_in}
                    onChange={(value) => set({ scope_in: value })}
                  />
                  <Textarea
                    label="Scope (out)"
                    value={form.scope_out}
                    onChange={(value) => set({ scope_out: value })}
                  />
                </div>

                {error && <Banner status="error" title={error} />}
              </div>
            </LayoutContent>
          }
          footer={
            <LayoutFooter hasDivider>
              <Button variant="secondary" label="Cancel" onClick={() => setOpen(false)} />
              <Button
                label={mutation.isPending ? 'Submitting…' : 'Submit'}
                onClick={() => mutation.mutate()}
                isDisabled={!canSubmit}
              />
            </LayoutFooter>
          }
        />
      </Dialog>
    </>
  );
}
