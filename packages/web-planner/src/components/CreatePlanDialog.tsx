import {
  Banner,
  Button,
  Dialog,
  DialogHeader,
  DisabledActionTooltip,
  Input,
  Layout,
  LayoutContent,
  LayoutFooter,
} from '@seta/shared-ui';
import { usePermission } from '@seta/web-identity';
import { useState } from 'react';
import { useCreatePlan } from '../hooks/mutations/create-plan';
import { PERMISSION_DENIED } from '../lib/permission-messages';

interface Props {
  groupId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (planName: string) => void;
}

export function CreatePlanDialog({ groupId, open, onOpenChange, onCreated }: Props) {
  const createPlan = useCreatePlan(groupId);
  const canCreatePlan = usePermission('planner.plan.create');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setName('');
    setError(null);
  }

  function submit() {
    if (createPlan.isPending) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Give your plan a name.');
      return;
    }
    createPlan.mutate(
      { name: trimmed },
      {
        onSuccess: () => {
          onCreated?.(trimmed);
          reset();
          onOpenChange(false);
        },
        onError: (e) => setError(e instanceof Error ? e.message : "Couldn't create the plan."),
      },
    );
  }

  function handleOpenChange(v: boolean) {
    if (!v) reset();
    onOpenChange(v);
  }

  return (
    <Dialog isOpen={open} onOpenChange={handleOpenChange} purpose="form">
      <Layout
        header={<DialogHeader title="New plan" onOpenChange={handleOpenChange} />}
        content={
          <LayoutContent>
            <div className="space-y-3">
              <p className="text-base text-secondary">
                One plan = one stream of work, with its own buckets and tasks.
              </p>
              <div className="space-y-1">
                <Input
                  label="Name"
                  value={name}
                  onChange={(value) => setName(value)}
                  onEnter={submit}
                  placeholder="e.g. Q3 Launch"
                />
              </div>
              {error && <Banner status="error" title={error} />}
            </div>
          </LayoutContent>
        }
        footer={
          <LayoutFooter hasDivider>
            <Button variant="secondary" label="Cancel" onClick={() => onOpenChange(false)} />
            <DisabledActionTooltip disabled={!canCreatePlan} reason={PERMISSION_DENIED.plan.create}>
              <Button
                label="Create plan"
                onClick={submit}
                isDisabled={!canCreatePlan || !name.trim() || createPlan.isPending}
              />
            </DisabledActionTooltip>
          </LayoutFooter>
        }
      />
    </Dialog>
  );
}
