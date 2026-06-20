import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
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
            <Label htmlFor="reject-reason">Reason</Label>
            <select
              id="reject-reason"
              className="w-full rounded border border-hairline bg-surface-1 px-2 py-1"
              value={effectiveReason}
              onChange={(e) => setReasonId(e.target.value)}
            >
              {active.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="reject-tags">Tags — comma-separated</Label>
            <Input
              id="reject-tags"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="e.g. frontend, junior"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="reject-note">Note</Label>
            <Textarea id="reject-note" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending || !effectiveReason}
            >
              {mutation.isPending ? 'Rejecting…' : 'Reject'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
