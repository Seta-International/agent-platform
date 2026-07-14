import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Selector,
  toast,
} from '@seta/shared-ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { closeRequisition, createCloseReason, fetchCloseReasons } from '../api/hiring-client.ts';
import { hiringKeys } from '../state/query-keys.ts';
import { on409 } from './utils.ts';

export function CancelRequisitionDialog({
  requisitionId,
  version,
  open,
  onOpenChange,
  onDone,
}: {
  requisitionId: string;
  version: number;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const [reasonId, setReasonId] = useState('');
  const [newReasonLabel, setNewReasonLabel] = useState('');

  const { data: reasons, isLoading: reasonsLoading } = useQuery({
    queryKey: hiringKeys.closeReasons(),
    queryFn: fetchCloseReasons,
  });
  const active = (reasons ?? []).filter((r) => r.active);
  const effectiveReason = reasonId || active[0]?.id || '';

  // No close reason exists yet in this tenant — offer to create one inline rather than sending
  // the user away to Settings mid-cancel.
  const createReason = useMutation({
    mutationFn: () => createCloseReason({ label: newReasonLabel.trim() }),
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: hiringKeys.closeReasons() });
      setReasonId(created.id);
      setNewReasonLabel('');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const mutation = useMutation({
    mutationFn: () =>
      closeRequisition(requisitionId, {
        expected_version: version,
        status: 'cancelled',
        close_reason_id: effectiveReason,
      }),
    onSuccess: () => {
      toast.success('Requisition cancelled');
      onOpenChange(false);
      // Cancelling removes this row from the board query (see OPEN_BOARD_STATUSES) — invalidating
      // immediately can unmount the row (and this dialog with it) mid-close-animation, which can
      // leave Radix's body scroll/pointer-events lock stuck permanently on (page looks frozen
      // until a refresh). Defer past the dialog's 200ms exit animation (duration-200 in
      // dialog.tsx) so Radix finishes tearing itself down cleanly first.
      setTimeout(onDone, 250);
    },
    onError: (e: Error) => on409(e, queryClient, hiringKeys.requisitions()),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel requisition</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Reason</Label>
            {!reasonsLoading && active.length === 0 ? (
              <div className="space-y-2">
                <p className="text-body-sm text-ink-muted">
                  No close reasons yet — add one to continue.
                </p>
                <div className="flex gap-2">
                  <Input
                    label="Reason"
                    isLabelHidden
                    placeholder="e.g. Position no longer needed"
                    value={newReasonLabel}
                    onChange={(value) => setNewReasonLabel(value)}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    label={createReason.isPending ? 'Adding…' : 'Add reason'}
                    isDisabled={createReason.isPending || !newReasonLabel.trim()}
                    onClick={() => createReason.mutate()}
                  />
                </div>
              </div>
            ) : (
              <Selector
                label="Reason"
                isLabelHidden
                options={active.map((r) => ({ value: r.id, label: r.label }))}
                value={effectiveReason}
                onChange={(v) => setReasonId(v)}
                placeholder="Select a reason"
              />
            )}
          </div>
          <p className="text-body-sm text-ink-muted">
            This closes the requisition for good — it can&apos;t be reopened afterwards.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="secondary"
              label="Back"
              onClick={() => onOpenChange(false)}
              isDisabled={mutation.isPending}
            />
            <Button
              variant="destructive"
              label={mutation.isPending ? 'Cancelling…' : 'Cancel requisition'}
              onClick={() => mutation.mutate()}
              isDisabled={mutation.isPending || !effectiveReason}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
