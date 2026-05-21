import {
  Alert,
  AlertDescription,
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from '@seta/shared-ui';
import { useState } from 'react';
import { useCreatePlan } from '../hooks/mutations/create-plan';

interface Props {
  groupId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (planName: string) => void;
}

export function CreatePlanDialog({ groupId, open, onOpenChange, onCreated }: Props) {
  const createPlan = useCreatePlan(groupId);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setName('');
    setError(null);
  }

  function submit() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Name is required.');
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
        onError: (e) => setError(e instanceof Error ? e.message : 'Failed to create plan.'),
      },
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a plan</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-body-sm text-ink-subtle">
            A plan groups buckets and tasks for one stream of work.
          </p>
          <div className="space-y-1">
            <Label htmlFor="create-plan-name">Name</Label>
            <Input
              id="create-plan-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit();
              }}
              placeholder="e.g. Q3 Launch"
            />
          </div>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={!name.trim()}>
              Create plan
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
