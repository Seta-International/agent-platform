import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DisabledActionTooltip,
} from '@seta/shared-ui';
import { usePermission } from '@seta/web-identity';
import { useState } from 'react';
import { PERMISSION_DENIED } from '../lib/permission-messages';

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
  const canDeletePlan = usePermission('planner.plan.delete');

  function handleOpenChange(v: boolean) {
    if (!v) setAcknowledged(false);
    onOpenChange(v);
  }

  const isLinked = externalSource === 'm365';
  const deleteDisabled = pending || !canDeletePlan || (isLinked && !acknowledged);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Delete this plan?</DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-2 text-body-sm text-ink-subtle">
              <p>The plan is gone for good. Its tasks move to Trash.</p>
              {isLinked && (
                <p className="font-medium text-ink">
                  This also deletes the matching plan in Microsoft Planner.
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
            I understand this also deletes the matching Microsoft Planner plan.
          </label>
        )}

        <DialogFooter>
          <Button
            variant="ghost"
            label="Cancel"
            onClick={() => handleOpenChange(false)}
            isDisabled={pending}
          />
          <DisabledActionTooltip disabled={!canDeletePlan} reason={PERMISSION_DENIED.plan.delete}>
            <Button
              variant="destructive"
              label="Delete"
              onClick={onConfirm}
              isDisabled={deleteDisabled}
            />
          </DisabledActionTooltip>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
