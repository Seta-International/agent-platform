import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Label,
  Textarea,
  toast,
} from '@seta/shared-ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { rejectApplication } from '../api/hiring-client.ts';
import { hiringKeys } from '../state/query-keys.ts';
import { on409 } from './utils.ts';

export function RejectDialog({
  applicationId,
  version,
  open,
  onOpenChange,
  onDone,
}: {
  applicationId: string;
  version: number;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const reasonMissing = reason.trim() === '';
  const reasonInvalid = submitAttempted && reasonMissing;

  const mutation = useMutation({
    mutationFn: () =>
      rejectApplication(applicationId, {
        expected_version: version,
        reason: reason.trim(),
      }),
    onSuccess: () => {
      toast.success('Candidate rejected');
      void queryClient.invalidateQueries({ queryKey: hiringKeys.candidates() });
      setReason('');
      setSubmitAttempted(false);
      onOpenChange(false);
      onDone();
    },
    onError: (e: Error) => on409(e, queryClient, hiringKeys.candidates()),
  });

  function submit() {
    setSubmitAttempted(true);
    if (reasonMissing) return;
    mutation.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reject candidate</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="reject-reason">Reason *</Label>
            <Textarea
              id="reject-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why is this candidate being rejected?"
              rows={3}
              aria-invalid={reasonInvalid}
              className={reasonInvalid ? '!border-danger' : undefined}
            />
            {reasonInvalid && <p className="text-caption text-danger-ink">Reason is required.</p>}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={submit} disabled={mutation.isPending}>
              {mutation.isPending ? 'Rejecting…' : 'Reject'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
