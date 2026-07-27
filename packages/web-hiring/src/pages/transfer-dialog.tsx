import {
  Button,
  Dialog,
  DialogFooter,
  DialogHeader,
  Layout,
  LayoutContent,
  Selector,
  useToast,
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
  const toast = useToast();
  const queryClient = useQueryClient();
  const [targetId, setTargetId] = useState('');

  const { data: reqs } = useQuery({
    queryKey: hiringKeys.requisitionOptions(),
    queryFn: fetchRequisitions,
  });
  // FUT-559: only actively-hiring roles receive transfers — on-hold (and closed) requisitions
  // are excluded here, and the backend rejects them too.
  // FUT-765: also exclude roles whose headcount is filled (no open openings left) — they keep
  // status 'open' but can't accept a hire, so they must not appear as a transfer target.
  const targets = (reqs ?? []).filter(
    (r) => r.status === 'open' && r.openings_open > 0 && r.id !== currentRequisitionId,
  );
  const effectiveTarget = targetId || targets[0]?.id || '';

  const mutation = useMutation({
    mutationFn: () =>
      transferApplication(applicationId, {
        expected_version: version,
        target_requisition_id: effectiveTarget,
      }),
    onSuccess: () => {
      toast({ body: 'Candidate moved' });
      void queryClient.invalidateQueries({ queryKey: hiringKeys.candidates() });
      // Both roles' cards and detail views changed (counts, applicant lists) — without
      // this, a mounted Requisitions board keeps showing the candidate on the old role.
      void queryClient.invalidateQueries({ queryKey: hiringKeys.requisitions() });
      void queryClient.invalidateQueries({
        queryKey: hiringKeys.requisition(currentRequisitionId),
      });
      void queryClient.invalidateQueries({ queryKey: hiringKeys.requisition(effectiveTarget) });
      onOpenChange(false);
      onDone();
    },
    onError: (e: Error) => on409(toast, e, queryClient, hiringKeys.candidates()),
  });

  return (
    <Dialog isOpen={open} onOpenChange={onOpenChange} purpose="form">
      <Layout
        header={<DialogHeader title="Move to another role" onOpenChange={onOpenChange} />}
        content={
          <LayoutContent>
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
              <p className="text-sm text-secondary">
                A fresh application is opened on the target role; this one is closed as transferred.
              </p>
            </div>
          </LayoutContent>
        }
        footer={
          <DialogFooter>
            <Button variant="secondary" label="Cancel" onClick={() => onOpenChange(false)} />
            <Button
              variant="primary"
              label={mutation.isPending ? 'Moving…' : 'Move candidate'}
              onClick={() => mutation.mutate()}
              isDisabled={mutation.isPending || !effectiveTarget}
            />
          </DialogFooter>
        }
      />
    </Dialog>
  );
}
