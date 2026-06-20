import { Badge, Button, toast } from '@seta/shared-ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import {
  closeRequisition,
  editRequisition,
  holdRequisition,
  type ReqStage,
  type RequisitionListRow,
} from '../api/hiring-client.ts';
import { hiringKeys } from '../state/query-keys.ts';

export const STAGES: ReqStage[] = ['sourcing', 'screening', 'interview', 'offer'];
export const STAGE_LABEL: Record<ReqStage, string> = {
  sourcing: 'Sourcing',
  screening: 'Screening',
  interview: 'Interview',
  offer: 'Offer',
};

// The status <select> options: stages drive stage+open; on_hold/filled/cancelled set status.
const STATUS_OPTIONS = [...STAGES, 'on_hold', 'filled', 'cancelled'] as const;
const STATUS_OPTION_LABEL: Record<string, string> = {
  ...STAGE_LABEL,
  on_hold: 'On hold',
  filled: 'Filled',
  cancelled: 'Cancelled',
};

export function RequisitionCard({ r, canManage }: { r: RequisitionListRow; canManage: boolean }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const invalidate = () =>
    void queryClient.invalidateQueries({ queryKey: hiringKeys.requisitions() });

  function onError(e: Error) {
    if ((e as { status?: number }).status === 409) {
      toast.error('This requisition changed — refreshing.');
      invalidate();
    } else {
      toast.error(e.message);
    }
  }

  const change = useMutation({
    mutationFn: async (value: string) => {
      if ((STAGES as string[]).includes(value)) {
        return editRequisition(r.id, { patch: { stage: value as ReqStage } });
      }
      if (value === 'on_hold') return holdRequisition(r.id, {});
      if (value === 'filled' || value === 'cancelled')
        return closeRequisition(r.id, { status: value });
      throw new Error(`unknown status ${value}`);
    },
    onSuccess: () => {
      toast.success('Requisition updated');
      invalidate();
    },
    onError,
  });

  // The selected value: an open req shows its stage; otherwise its status.
  const selected = r.status === 'open' ? r.stage : r.status;
  const overdue = r.due_date && r.status === 'open' && new Date(r.due_date) < new Date();

  return (
    <div className="rounded-lg border border-hairline bg-surface-1 p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          className="text-left font-medium text-ink hover:underline"
          onClick={() =>
            void navigate({
              to: '/hiring/requisitions/$requisitionId',
              params: { requisitionId: r.id },
            })
          }
        >
          {r.title}
        </button>
        <Badge variant={r.kind === 'replacement' ? 'secondary' : 'default'}>{r.kind}</Badge>
      </div>
      <div className="text-caption text-ink-muted">
        {r.openings_open}/{r.openings_total} openings · {r.applicants_count} applicants
      </div>
      {/* Stage progress track */}
      <div className="flex gap-1">
        {STAGES.map((s, i) => {
          const curIdx = STAGES.indexOf(r.stage);
          const done = r.status === 'filled' || i < curIdx;
          const cur = r.status === 'open' && i === curIdx;
          return (
            <span
              key={s}
              className={`flex-1 rounded px-2 py-1 text-center text-caption ${
                done
                  ? 'bg-primary/15 text-primary'
                  : cur
                    ? 'bg-primary text-on-primary'
                    : 'bg-surface-2 text-ink-muted'
              }`}
            >
              {STAGE_LABEL[s]}
            </span>
          );
        })}
      </div>
      {/* Inline editor */}
      {canManage && r.status !== 'filled' && r.status !== 'cancelled' && (
        <div className="flex items-center gap-2">
          <select
            className="rounded border border-hairline bg-surface-1 px-2 py-1 text-caption"
            value={selected}
            disabled={change.isPending}
            onChange={(e) => change.mutate(e.target.value)}
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o} value={o}>
                {STATUS_OPTION_LABEL[o]}
              </option>
            ))}
          </select>
          {overdue && <Badge variant="destructive">Overdue</Badge>}
        </div>
      )}
      <div className="flex items-center justify-between text-caption text-ink-muted">
        <span className="font-mono">{r.id.slice(0, 8)}</span>
        <Button
          size="sm"
          variant="ghost"
          onClick={() =>
            void navigate({
              to: '/hiring/requisitions/$requisitionId',
              params: { requisitionId: r.id },
            })
          }
        >
          View JD
        </Button>
      </div>
    </div>
  );
}
