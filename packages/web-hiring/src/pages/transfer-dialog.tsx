import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Selector,
  toast,
} from '@seta/shared-ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { fetchRequisitions, transferApplication } from '../api/hiring-client.ts';
import { hiringKeys } from '../state/query-keys.ts';
import { on409 } from './utils.ts';

export function TransferDialog({
  applicationId,
  version,
  currentRequisitionId,
  open,
  onOpenChange,
  onDone,
}: {
  applicationId: string;
  version: number;
  currentRequisitionId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const [targetId, setTargetId] = useState('');

  const { data: reqs } = useQuery({
    queryKey: hiringKeys.requisitionOptions(),
    queryFn: fetchRequisitions,
  });
  const targets = (reqs ?? []).filter(
    (r) => (r.status === 'open' || r.status === 'on_hold') && r.id !== currentRequisitionId,
  );
  const effectiveTarget = targetId || targets[0]?.id || '';

  const mutation = useMutation({
    mutationFn: () =>
      transferApplication(applicationId, {
        expected_version: version,
        target_requisition_id: effectiveTarget,
      }),
    onSuccess: () => {
      toast.success('Candidate moved');
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
          <DialogTitle>Move to another role</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Selector
              label="Target role"
              options={targets.map((r) => ({ value: r.id, label: r.title }))}
              value={effectiveTarget}
              onChange={(v) => setTargetId(v)}
              placeholder="Select a role"
            />
          </div>
          <p className="text-caption text-ink-muted">
            A fresh application is opened on the target role; this one is closed as transferred.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" label="Cancel" onClick={() => onOpenChange(false)} />
            <Button
              label={mutation.isPending ? 'Moving…' : 'Move candidate'}
              onClick={() => mutation.mutate()}
              isDisabled={mutation.isPending || !effectiveTarget}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
