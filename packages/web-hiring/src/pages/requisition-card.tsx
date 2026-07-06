import {
  Button,
  DisabledActionTooltip,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  toast,
} from '@seta/shared-ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Calendar, Check, ExternalLink, MoreHorizontal, Users } from 'lucide-react';
import { useState } from 'react';
import {
  editRequisition,
  holdRequisition,
  type ReqStage,
  type RequisitionListRow,
  resumeRequisition,
} from '../api/hiring-client.ts';
import { PERMISSION_DENIED } from '../lib/permission-messages.ts';
import { hiringKeys } from '../state/query-keys.ts';
import { CancelRequisitionDialog } from './cancel-requisition-dialog.tsx';
import { MarkFilledDialog } from './mark-filled-dialog.tsx';
import {
  daysLeft,
  formatDate,
  funnelCounts,
  STAGE_LABEL,
  STAGES,
  STATUS_BADGE_CLASS,
  STATUS_LABEL,
} from './requisition-format.ts';
import { on409 } from './utils.ts';

// Skill proficiency: requisition_skill.min_level is 1–5; render a word like the design.
const LEVEL_LABEL: Record<number, string> = {
  1: 'Basic',
  2: 'Intermediate',
  3: 'Advanced',
  4: 'Expert',
  5: 'Master',
};

export function RequisitionCard({
  r,
  canManage,
  canClose,
}: {
  r: RequisitionListRow;
  canManage: boolean;
  canClose: boolean;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showFillConfirm, setShowFillConfirm] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const invalidate = () =>
    void queryClient.invalidateQueries({ queryKey: hiringKeys.requisitions() });

  function onError(e: Error) {
    on409(e, queryClient, hiringKeys.requisitions());
  }

  const setStage = useMutation({
    mutationFn: (stage: ReqStage) =>
      editRequisition(r.id, { expected_version: r.version, patch: { stage } }),
    onSuccess: () => invalidate(),
    onError,
  });
  const pause = useMutation({
    mutationFn: () => holdRequisition(r.id, { expected_version: r.version }),
    onSuccess: () => {
      toast.success('Requisition paused');
      invalidate();
    },
    onError,
  });
  const resume = useMutation({
    mutationFn: () => resumeRequisition(r.id, { expected_version: r.version }),
    onSuccess: () => {
      toast.success('Requisition resumed');
      invalidate();
    },
    onError,
  });

  // On hold means everything about the requisition is frozen — stage stays locked until an
  // explicit Resume from the status menu, no implicit resume-on-click. Terminal
  // (filled/cancelled) statuses lock the same way, for good.
  const stageClickable = canManage && r.status === 'open' && !setStage.isPending;
  const isTerminal = r.status === 'filled' || r.status === 'cancelled';
  const curIdx = STAGES.indexOf(r.stage);
  const counts = funnelCounts(r.applicants_count, r.applicants);

  // Account/project names come from local pm projections (null until pm emits / the
  // requisition links a project); grade is always local. Falls back gracefully.
  const subtitle = [r.account_name, r.project_name, r.grade ? `Grade ${r.grade}` : null]
    .filter(Boolean)
    .join(' • ');
  const go = () =>
    void navigate({
      to: '/hiring/requisitions',
      search: (prev: Record<string, unknown>) => ({
        ...prev,
        selectedRequisitionId: r.id,
      }),
    });

  return (
    <div
      data-testid="requisition-card"
      className="flex h-full flex-col rounded-xl border border-hairline bg-surface-1 p-5"
    >
      {/* Title + status */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <button
            type="button"
            className="line-clamp-2 w-full break-words text-left text-card-title font-semibold text-ink hover:underline"
            onClick={go}
          >
            {r.title}
          </button>
          {subtitle && (
            <div className="mt-0.5 truncate text-body-sm text-ink-muted">{subtitle}</div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span
            className={`rounded-full px-2.5 py-1 text-caption font-medium ${STATUS_BADGE_CLASS[r.status]}`}
          >
            {STATUS_LABEL[r.status]}
          </span>
          {!isTerminal && (
            <DisabledActionTooltip
              disabled={!canManage && !canClose}
              reason={PERMISSION_DENIED.requisition.edit}
            >
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={!canManage && !canClose}
                    aria-label="Requisition actions"
                  >
                    <MoreHorizontal className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {r.status === 'open' && (
                    <DropdownMenuItem disabled={!canManage} onSelect={() => pause.mutate()}>
                      Pause
                    </DropdownMenuItem>
                  )}
                  {r.status === 'on_hold' && (
                    <DropdownMenuItem disabled={!canManage} onSelect={() => resume.mutate()}>
                      Resume
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    disabled={!canClose}
                    // Defer past the menu's own close/focus-return — opening a Dialog
                    // synchronously from onSelect races two Radix focus-traps and can leave
                    // body pointer-events stuck off (page looks frozen until a refresh).
                    onSelect={(e) => {
                      e.preventDefault();
                      setTimeout(() => setShowFillConfirm(true), 0);
                    }}
                  >
                    Mark filled
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={!canClose}
                    className="text-danger-ink"
                    onSelect={(e) => {
                      e.preventDefault();
                      setTimeout(() => setShowCancelDialog(true), 0);
                    }}
                  >
                    Cancel
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </DisabledActionTooltip>
          )}
        </div>
      </div>

      {/* Skill chips — tightly grouped with the header/subtitle above it (still "about this
          role"); the stage module below gets a bigger gap since it's a distinct section. */}
      {r.skills.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {r.skills.map((s) => (
            <span
              key={s.skill_name}
              className="rounded-full bg-surface-2 px-2.5 py-1 text-caption text-ink-muted"
            >
              {s.skill_name}
              {s.min_level != null ? ` · ${LEVEL_LABEL[s.min_level] ?? s.min_level}` : ''}
            </span>
          ))}
        </div>
      )}

      {/* Stage funnel + timing — click a step to jump straight to that stage. Only
          meaningful while open; locked on_hold (Resume first) or filled/cancelled (for good). */}
      <div className="mt-5 flex items-start gap-4">
        <div className="relative flex-[3] pt-2.5">
          <div className="absolute inset-x-[12.5%] top-[19px] h-px bg-hairline-strong" />
          <div
            className="absolute inset-y-0 left-[12.5%] top-[19px] h-px bg-primary transition-[width]"
            style={{
              width: curIdx <= 0 ? 0 : `${(curIdx / (STAGES.length - 1)) * 75}%`,
            }}
          />
          <div className="relative flex justify-between">
            {STAGES.map((s, i) => {
              const reached = i <= curIdx;
              return (
                <DisabledActionTooltip
                  key={s}
                  disabled={!canManage}
                  reason={PERMISSION_DENIED.requisition.edit}
                >
                  <button
                    type="button"
                    disabled={!stageClickable}
                    onClick={() => setStage.mutate(s)}
                    className={`flex flex-col items-center gap-1.5 ${stageClickable ? 'cursor-pointer' : 'cursor-default'}`}
                  >
                    <span
                      className={`flex size-5 items-center justify-center rounded-full text-on-primary ${
                        reached
                          ? r.status === 'on_hold'
                            ? 'bg-warning'
                            : 'bg-primary'
                          : 'border-2 border-hairline-strong bg-canvas'
                      }`}
                    >
                      {reached && <Check className="size-3" aria-hidden />}
                    </span>
                    <span
                      className={`text-caption font-medium ${i === curIdx ? 'text-ink' : 'text-ink-subtle'}`}
                    >
                      {STAGE_LABEL[s]}
                    </span>
                    <span className="text-caption tabular-nums text-ink-subtle">{counts[i]}</span>
                  </button>
                </DisabledActionTooltip>
              );
            })}
          </div>
        </div>
        <div className="flex flex-1 items-start justify-end gap-1.5 pt-0.5 text-right text-body-sm">
          <Calendar className="mt-0.5 size-4 shrink-0 text-ink-subtle" aria-hidden />
          {r.status === 'on_hold' ? (
            <div>
              <div className="font-medium text-warning-ink">Paused</div>
              <div className="text-caption text-ink-muted">Since {formatDate(r.updated_at)}</div>
            </div>
          ) : r.due_date ? (
            <div>
              <div className="font-medium text-ink">
                {daysLeft(r.due_date) >= 0
                  ? `${daysLeft(r.due_date)} days left`
                  : `${-daysLeft(r.due_date)}d overdue`}
              </div>
              <div className="text-caption text-ink-muted">Due {formatDate(r.due_date)}</div>
            </div>
          ) : (
            <div className="text-caption text-ink-muted">No due date</div>
          )}
        </div>
      </div>

      {/* Applicants + View JD — mt-auto pins the footer to the bottom so cards of different
          content height still align their footers within the same grid row. */}
      <div className="mt-auto flex items-center justify-between border-t border-hairline pt-4">
        <span className="flex items-center gap-1.5 text-body-sm text-ink-muted">
          <Users className="size-4" aria-hidden />
          {r.applicants_count} Applicants
        </span>
        <Button size="sm" variant="secondary" onClick={go}>
          View Detail
          <ExternalLink className="ml-1 size-3.5" aria-hidden />
        </Button>
      </div>
      <MarkFilledDialog
        requisitionId={r.id}
        version={r.version}
        open={showFillConfirm}
        onOpenChange={setShowFillConfirm}
        onDone={invalidate}
      />
      <CancelRequisitionDialog
        requisitionId={r.id}
        version={r.version}
        open={showCancelDialog}
        onOpenChange={setShowCancelDialog}
        onDone={invalidate}
      />
    </div>
  );
}
