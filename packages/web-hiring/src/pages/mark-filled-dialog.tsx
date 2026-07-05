import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  buttonVariants,
  toast,
} from '@seta/shared-ui';
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
      // Filling removes this row from the board query (see OPEN_BOARD_STATUSES) — invalidating
      // immediately can unmount the row (and this dialog with it) mid-close-animation, which can
      // leave Radix's body scroll/pointer-events lock stuck permanently on (page looks frozen
      // until a refresh). Defer past the dialog's 200ms exit animation (duration-200 in
      // alert-dialog.tsx) so Radix finishes tearing itself down cleanly first.
      setTimeout(onDone, 250);
    },
    onError: (e: Error) => on409(e, queryClient, hiringKeys.requisitions()),
  });

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Mark requisition as filled?</AlertDialogTitle>
          <AlertDialogDescription>
            This closes the requisition for good — it can&apos;t be reopened or moved back to a
            stage afterwards.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={mutation.isPending}>Back</AlertDialogCancel>
          <AlertDialogAction
            className={buttonVariants({ variant: 'default' })}
            disabled={mutation.isPending}
            onClick={(e) => {
              e.preventDefault();
              mutation.mutate();
            }}
          >
            {mutation.isPending ? 'Marking…' : 'Mark filled'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
