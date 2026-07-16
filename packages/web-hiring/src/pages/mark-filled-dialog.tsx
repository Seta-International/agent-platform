import { AlertDialog, toast } from '@seta/shared-ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { closeRequisition } from '../api/hiring-client.ts';
import { hiringKeys } from '../state/query-keys.ts';
import { on409 } from './utils.ts';

export function MarkFilledDialog({
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

  const mutation = useMutation({
    mutationFn: () =>
      closeRequisition(requisitionId, { expected_version: version, status: 'filled' }),
    onSuccess: () => {
      toast.success('Requisition marked as filled');
      onOpenChange(false);
      onDone();
    },
    onError: (e: Error) => on409(e, queryClient, hiringKeys.requisitions()),
  });

  return (
    <AlertDialog
      isOpen={open}
      onOpenChange={onOpenChange}
      title="Mark requisition as filled?"
      description="This closes the requisition for good — it can't be reopened or moved back to a stage afterwards."
      cancelLabel="Back"
      actionLabel={mutation.isPending ? 'Marking…' : 'Mark filled'}
      // Filling a requisition is a positive terminal outcome, not a destructive one — Astryx
      // defaults actionVariant to 'destructive', so primary intent has to be explicit here.
      actionVariant="primary"
      isActionLoading={mutation.isPending}
      onAction={() => mutation.mutate()}
    />
  );
}
