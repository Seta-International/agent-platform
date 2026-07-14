import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Selector,
  Textarea,
  toast,
} from '@seta/shared-ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { fetchRejectionReasons, rejectApplication } from '../api/hiring-client.ts';
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
  const [reasonId, setReasonId] = useState('');
  const [tags, setTags] = useState('');
  const [note, setNote] = useState('');

  const { data: reasons } = useQuery({
    queryKey: hiringKeys.rejectionReasons(),
    queryFn: fetchRejectionReasons,
  });
  const active = (reasons ?? []).filter((r) => r.active);
  const effectiveReason = reasonId || active[0]?.id || '';

  const mutation = useMutation({
    mutationFn: () =>
      rejectApplication(applicationId, {
        expected_version: version,
        reason_id: effectiveReason,
        tags: tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        note: note.trim() || undefined,
      }),
    onSuccess: () => {
      toast.success('Candidate rejected');
      void queryClient.invalidateQueries({ queryKey: hiringKeys.candidates() });
      onOpenChange(false);
      onDone();
    },
    onError: (e: Error) => on409(e, queryClient, hiringKeys.candidates()),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reject candidate</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Reason</Label>
            <Selector
              label="Reason"
              isLabelHidden
              options={active.map((r) => ({ value: r.id, label: r.label }))}
              value={effectiveReason}
              onChange={(v) => setReasonId(v)}
            />
          </div>
          <div className="space-y-1">
            <Input
              label="Tags — comma-separated"
              value={tags}
              onChange={(value) => setTags(value)}
              placeholder="e.g. frontend, junior"
            />
          </div>
          <Textarea label="Note" value={note} onChange={(value) => setNote(value)} />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" label="Cancel" onClick={() => onOpenChange(false)} />
            <Button
              variant="destructive"
              label={mutation.isPending ? 'Rejecting…' : 'Reject'}
              onClick={() => mutation.mutate()}
              isDisabled={mutation.isPending || !effectiveReason}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
