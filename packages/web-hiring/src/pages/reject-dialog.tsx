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
  const toast = useToast();
  const queryClient = useQueryClient();
  // FUT-559: the reject dialog is a single required free-text reason — the old
  // category + tags + note trio is gone; one sentence explaining the call is enough.
  const [reason, setReason] = useState('');
  const reasonMissing = reason.trim() === '';

  const mutation = useMutation({
    mutationFn: () =>
      rejectApplication(applicationId, {
        expected_version: version,
        reason: reason.trim(),
      }),
    onSuccess: () => {
      toast({ body: 'Candidate rejected' });
      void queryClient.invalidateQueries({ queryKey: hiringKeys.candidates() });
      setReason('');
      onOpenChange(false);
      onDone();
    },
    onError: (e: Error) => on409(toast, e, queryClient, hiringKeys.candidates()),
  });

  return (
    <Dialog isOpen={open} onOpenChange={onOpenChange} purpose="required">
      <Layout
        header={<DialogHeader title="Reject candidate" onOpenChange={onOpenChange} />}
        content={
          <LayoutContent>
            <Textarea
              label="Reason"
              isRequired
              value={reason}
              onChange={(value) => setReason(value)}
              placeholder="Why is this candidate being rejected?"
              rows={3}
            />
          </LayoutContent>
        }
        footer={
          <DialogFooter>
            <Button variant="secondary" label="Cancel" onClick={() => onOpenChange(false)} />
            <Button
              variant="destructive"
              label={mutation.isPending ? 'Rejecting…' : 'Reject'}
              onClick={() => mutation.mutate()}
              isDisabled={mutation.isPending || reasonMissing}
            />
          </DialogFooter>
        }
      />
    </Dialog>
  );
}
