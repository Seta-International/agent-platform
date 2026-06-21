import {
  Badge,
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@seta/shared-ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  addOpening,
  closeOpening,
  fetchCloseReasons,
  type RequisitionDetail,
} from '../api/hiring-client.ts';
import { hiringKeys } from '../state/query-keys.ts';
import { on409 } from './utils.ts';

const NONE = '__none__';

export function OpeningsTab({
  detail,
  canManage,
}: {
  detail: RequisitionDetail;
  canManage: boolean;
}) {
  const queryClient = useQueryClient();
  const id = detail.requisition.id;
  const reasons = useQuery({ queryKey: hiringKeys.closeReasons(), queryFn: fetchCloseReasons });
  const [reasonByOpening, setReasonByOpening] = useState<Record<string, string>>({});
  const invalidate = () =>
    void queryClient.invalidateQueries({ queryKey: hiringKeys.requisition(id) });

  const add = useMutation({
    mutationFn: () => addOpening(id, {}),
    onSuccess: () => {
      toast.success('Opening added');
      invalidate();
    },
    onError: (e: Error) => on409(e, queryClient, hiringKeys.requisition(id)),
  });
  const close = useMutation({
    mutationFn: (vars: { openingId: string; version: number; status: 'closed' | 'cancelled' }) =>
      closeOpening(vars.openingId, {
        expected_version: vars.version,
        status: vars.status,
        close_reason_id: reasonByOpening[vars.openingId] || undefined,
      }),
    onSuccess: () => {
      toast.success('Opening updated');
      invalidate();
    },
    onError: (e: Error) => on409(e, queryClient, hiringKeys.requisition(id)),
  });

  return (
    <div className="space-y-3">
      <div className="flex justify-between">
        <div className="text-caption text-ink-muted">
          {detail.openings.filter((o) => o.status === 'open').length} open ·{' '}
          {detail.openings.length} total
        </div>
        {canManage && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => add.mutate()}
            disabled={add.isPending}
          >
            Add opening
          </Button>
        )}
      </div>
      <div className="divide-y divide-hairline">
        {detail.openings.map((o) => (
          <div key={o.id} className="flex items-center justify-between gap-2 py-2">
            <span className="font-mono text-caption text-ink">
              {detail.requisition.id.slice(0, 8)}-{o.seq}
            </span>
            <div className="flex items-center gap-2">
              <Badge variant={o.status === 'open' ? 'default' : 'secondary'}>{o.status}</Badge>
              {canManage && o.status === 'open' && (
                <>
                  <Select
                    value={reasonByOpening[o.id] || NONE}
                    onValueChange={(v) =>
                      setReasonByOpening((m) => ({ ...m, [o.id]: v === NONE ? '' : v }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Reason…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>—</SelectItem>
                      {reasons.data
                        ?.filter((r) => r.active)
                        .map((r) => (
                          <SelectItem key={r.id} value={r.id}>
                            {r.label}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      close.mutate({ openingId: o.id, version: o.version, status: 'closed' })
                    }
                  >
                    Close
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() =>
                      close.mutate({ openingId: o.id, version: o.version, status: 'cancelled' })
                    }
                  >
                    Cancel
                  </Button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
