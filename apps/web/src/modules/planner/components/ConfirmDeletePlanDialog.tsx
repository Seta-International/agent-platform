import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@seta/shared-ui';
import { useState } from 'react';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  externalSource: 'native' | 'm365';
  onConfirm: () => void;
  pending?: boolean;
}

export function ConfirmDeletePlanDialog({
  open,
  onOpenChange,
  externalSource,
  onConfirm,
  pending = false,
}: Props) {
  const [acknowledged, setAcknowledged] = useState(false);

  function handleOpenChange(v: boolean) {
    if (!v) setAcknowledged(false);
    onOpenChange(v);
  }

  const isLinked = externalSource === 'm365';
  const deleteDisabled = pending || (isLinked && !acknowledged);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Delete this plan?</DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-2 text-body-sm text-ink-subtle">
              <p>This will delete the plan permanently. All tasks in it will be moved to Trash.</p>
              {isLinked && (
                <p className="font-medium text-ink">
                  It will also be deleted in Microsoft 365 Planner.
                </p>
              )}
            </div>
          </DialogDescription>
        </DialogHeader>

        {isLinked && (
          <label
            htmlFor="confirm-delete-m365"
            className="flex items-center gap-2 text-body-sm text-ink cursor-pointer select-none"
          >
            <Checkbox
              id="confirm-delete-m365"
              checked={acknowledged}
              onCheckedChange={(v) => setAcknowledged(v === true)}
            />
            I understand this also deletes the M365 Planner plan.
          </label>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => handleOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={deleteDisabled}>
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
