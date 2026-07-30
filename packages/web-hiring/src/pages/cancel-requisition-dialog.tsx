import {
  Button,
  Dialog,
  DialogFooter,
  DialogHeader,
  Layout,
  LayoutContent,
  Textarea,
  useToast,
} from '@seta/shared-ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { closeRequisition, createCloseReason, fetchCloseReasons } from '../api/hiring-client.ts';
import { hiringKeys } from '../state/query-keys.ts';
import { on409 } from './utils.ts';

export function CancelRequisitionDialog({
  requisitionId,
  version,
  offerCount = 0,
  open,
  onOpenChange,
  onDone,
}: {
  requisitionId: string;
  version: number;
  /** Active candidates currently in the Offer stage — cancelling closes their offers (FUT-770). */
  offerCount?: number;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  // Single required free-text reason, same idiom as the reject-candidate dialog.
  const [reason, setReason] = useState('');
  const reasonMissing = reason.trim() === '';

  // Existing close reasons — used only to reuse a matching one instead of minting a duplicate.
  const { data: reasons } = useQuery({
    queryKey: hiringKeys.closeReasons(),
    queryFn: fetchCloseReasons,
  });

  const mutation = useMutation({
    mutationFn: async () => {
      // The backend keys a cancellation to a close_reason *entity*, not free text (see
      // requisition-lifecycle: close_reason_id is required + validated). So resolve the typed
      // text to a reason id: reuse a matching active reason, else create one on the fly.
      const trimmed = reason.trim();
      const match = (reasons ?? []).find(
        (r) => r.active && r.label.trim().toLowerCase() === trimmed.toLowerCase(),
      );
      const close_reason_id = match?.id ?? (await createCloseReason({ label: trimmed })).id;
      return closeRequisition(requisitionId, {
        expected_version: version,
        status: 'cancelled',
        close_reason_id,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: hiringKeys.closeReasons() });
      toast({ body: 'Requisition cancelled' });
      onOpenChange(false);
      // Cancelling removes this row from the board query — invalidating immediately can unmount
      // the row (and this dialog) mid-close-animation and leave Radix's scroll/pointer-events
      // lock stuck. Defer past the dialog's 200ms exit animation so Radix tears down cleanly.
      setTimeout(onDone, 250);
    },
    onError: (e: Error) => on409(toast, e, queryClient, hiringKeys.requisitions()),
  });

  return (
    <Dialog isOpen={open} onOpenChange={onOpenChange} purpose="required">
      <Layout
        header={<DialogHeader title="Cancel requisition" onOpenChange={onOpenChange} />}
        content={
          <LayoutContent>
            <div className="space-y-3">
              <Textarea
                label="Reason"
                isRequired
                value={reason}
                onChange={(value) => setReason(value)}
                placeholder="Why is this requisition being cancelled?"
                rows={3}
              />
              {offerCount > 0 ? (
                // Offer is a late, sensitive stage. When candidates are still in it, both
                // consequences of cancelling belong together in one calm note — tinted in the same
                // warning-muted amber the Offer stage badge uses, not a loud filled banner (FUT-770).
                <div className="flex gap-2.5 rounded-lg bg-warning-muted p-3">
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
                  <div className="space-y-0.5 text-sm">
                    <p className="font-medium text-primary">
                      {offerCount === 1
                        ? '1 candidate in Offer will be cancelled'
                        : `${offerCount} candidates in Offer will be cancelled`}
                    </p>
                    <p className="text-secondary">
                      This requisition closes for good and can&apos;t be reopened.
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-base text-secondary">
                  This closes the requisition for good — it can&apos;t be reopened afterwards.
                </p>
              )}
            </div>
          </LayoutContent>
        }
        footer={
          <DialogFooter>
            <Button
              variant="secondary"
              label="Back"
              onClick={() => onOpenChange(false)}
              isDisabled={mutation.isPending}
            />
            <Button
              variant="destructive"
              label={mutation.isPending ? 'Cancelling…' : 'Cancel'}
              onClick={() => mutation.mutate()}
              isDisabled={mutation.isPending || reasonMissing}
            />
          </DialogFooter>
        }
      />
    </Dialog>
  );
}
