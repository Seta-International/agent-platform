import {
  Avatar,
  AvatarFallback,
  Badge,
  Button,
  DisabledActionTooltip,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@seta/shared-ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import {
  closeRequisition,
  editRequisition,
  holdRequisition,
  type ReqStage,
  type RequisitionListRow,
} from '../api/hiring-client.ts';
import { PERMISSION_DENIED } from '../lib/permission-messages.ts';
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

// Skill proficiency: requisition_skill.min_level is 1–5; render a word like the design.
const LEVEL_LABEL: Record<number, string> = {
  1: 'Basic',
  2: 'Intermediate',
  3: 'Advanced',
  4: 'Expert',
  5: 'Master',
};

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

function daysOpen(createdAt: string): number {
  const created = new Date(createdAt).getTime();
  if (Number.isNaN(created)) return 0;
  return Math.max(0, Math.floor((Date.now() - created) / 86_400_000));
}

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
        return editRequisition(r.id, {
          expected_version: r.version,
          patch: { stage: value as ReqStage },
        });
      }
      if (value === 'on_hold') return holdRequisition(r.id, { expected_version: r.version });
      if (value === 'filled' || value === 'cancelled')
        return closeRequisition(r.id, { expected_version: r.version, status: value });
      throw new Error(`unknown status ${value}`);
    },
    onSuccess: () => {
      toast.success('Requisition updated');
      invalidate();
    },
    onError,
  });

  const setDate = useMutation({
    mutationFn: (patch: { start_date?: string; due_date?: string }) =>
      editRequisition(r.id, { expected_version: r.version, patch }),
    onSuccess: () => invalidate(),
    onError,
  });

  // The selected value: an open req shows its stage; otherwise its status.
  const selected = r.status === 'open' ? r.stage : r.status;
  // Account/project names come from local pm projections (null until pm emits / the
  // requisition links a project); grade is always local. Falls back gracefully.
  const subtitle = [r.account_name, r.project_name, r.grade ? `Grade ${r.grade}` : null]
    .filter(Boolean)
    .join(' · ');
  const go = () =>
    void navigate({
      to: '/hiring/requisitions/$requisitionId',
      params: { requisitionId: r.id },
    });

  return (
    <div className="flex h-full flex-col rounded-xl border border-hairline bg-surface-1 p-5">
      <div className="flex-1 space-y-4">
        {/* Title + kind */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <button
              type="button"
              className="text-left text-card-title font-semibold text-ink hover:underline"
              onClick={go}
            >
              {r.title}
            </button>
            {subtitle && <div className="mt-0.5 text-body-sm text-ink-muted">{subtitle}</div>}
          </div>
          <Badge
            className={
              r.kind === 'replacement'
                ? 'shrink-0 border-transparent bg-danger-tint px-2.5 py-1 capitalize text-danger-ink'
                : 'shrink-0 border-transparent bg-success-tint px-2.5 py-1 capitalize text-success-ink'
            }
          >
            {r.kind}
          </Badge>
        </div>

        {/* Skill chips */}
        {r.skills.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {r.skills.map((s) => (
              <span
                key={s.skill_name}
                className="rounded-md border border-hairline bg-surface-2 px-3 py-1.5 text-body-sm text-ink-muted"
              >
                {s.skill_name}
                {s.min_level != null ? ` · ${LEVEL_LABEL[s.min_level] ?? s.min_level}` : ''}
              </span>
            ))}
          </div>
        )}

        {/* Openings + View JD */}
        <div className="flex items-center gap-3">
          <span className="min-w-0 flex-1 truncate text-body-sm text-ink-muted">
            {r.openings_open}/{r.openings_total} openings
          </span>
          <Button size="sm" variant="secondary" onClick={go}>
            View JD
          </Button>
        </div>

        {/* Stage progress track */}
        <div className="flex gap-1.5">
          {STAGES.map((s, i) => {
            const curIdx = STAGES.indexOf(r.stage);
            const done = r.status === 'filled' || i < curIdx;
            const cur = r.status === 'open' && i === curIdx;
            return (
              <span
                key={s}
                className={`flex-1 rounded-md px-2 py-2 text-center text-body-sm font-medium ${
                  cur
                    ? 'bg-primary text-on-primary'
                    : done
                      ? 'bg-primary/12 text-primary'
                      : 'bg-surface-2 text-ink-subtle'
                }`}
              >
                {STAGE_LABEL[s]}
              </span>
            );
          })}
        </div>

        {/* Status + dates */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Status">
            <DisabledActionTooltip
              disabled={!canManage}
              reason={PERMISSION_DENIED.requisition.edit}
              className="w-full"
            >
              <Select
                value={selected}
                disabled={!canManage || change.isPending || r.status === 'filled'}
                onValueChange={(v) => change.mutate(v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((o) => (
                    <SelectItem key={o} value={o}>
                      {STATUS_OPTION_LABEL[o]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </DisabledActionTooltip>
          </Field>
          <Field label="Start date">
            <DisabledActionTooltip
              disabled={!canManage}
              reason={PERMISSION_DENIED.requisition.edit}
              className="w-full"
            >
              <DateInput
                value={r.start_date}
                disabled={!canManage || setDate.isPending}
                onChange={(start_date) => setDate.mutate({ start_date })}
              />
            </DisabledActionTooltip>
          </Field>
          <Field label="Due date">
            <DisabledActionTooltip
              disabled={!canManage}
              reason={PERMISSION_DENIED.requisition.edit}
              className="w-full"
            >
              <DateInput
                value={r.due_date}
                disabled={!canManage || setDate.isPending}
                onChange={(due_date) => setDate.mutate({ due_date })}
              />
            </DisabledActionTooltip>
          </Field>
          <div className="flex items-end justify-end gap-2 text-body-sm">
            {r.status === 'open' && (
              <span className="text-ink-muted">Open {daysOpen(r.created_at)}d</span>
            )}
          </div>
        </div>

        {/* Applicants */}
        <div className="border-t border-hairline pt-3">
          <div className="flex items-center justify-between">
            <span className="text-eyebrow font-semibold uppercase tracking-wide text-ink">
              Applicants · {r.applicants_count}
            </span>
            {r.applicants_count > 0 && (
              <button
                type="button"
                className="text-body-sm text-ink-subtle hover:underline"
                onClick={go}
              >
                tap to review
              </button>
            )}
          </div>
          <div className="mt-2 max-h-44 space-y-2 overflow-y-auto pr-1">
            {r.applicants.length === 0 && (
              <p className="text-body-sm text-ink-subtle">No internal applicants yet.</p>
            )}
            {r.applicants.map((a) => (
              <div key={`${a.name}-${a.applied_date}`} className="flex items-center gap-3">
                <Avatar className="size-9">
                  <AvatarFallback className="bg-primary/15 text-caption font-semibold text-primary">
                    {initialsOf(a.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-ink">{a.name}</div>
                  <div className="truncate text-body-sm text-ink-muted">
                    {[a.role, `applied ${a.applied_date.slice(0, 10)}`].filter(Boolean).join(' · ')}
                  </div>
                </div>
                <Badge className="shrink-0 border-transparent bg-warning-tint capitalize text-warning-ink">
                  {a.stage}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      </div>
      {/* Footer — always pinned to the bottom even when content above is short */}
      <div className="mt-4 flex items-center justify-between border-t border-hairline pt-3 text-body-sm text-ink-subtle">
        <span className="font-mono">{r.id.slice(0, 8)}</span>
        {r.due_date && <span>Due {r.due_date}</span>}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="block">
      <span className="mb-1 block text-eyebrow font-semibold uppercase tracking-wide text-ink-subtle">
        {label}
      </span>
      {children}
    </div>
  );
}

function DateInput({
  value,
  disabled,
  onChange,
}: {
  value: string | null;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <input
      type="date"
      value={value ?? ''}
      disabled={disabled}
      onChange={(e) => e.target.value && onChange(e.target.value)}
      className="h-8 w-full rounded-md border border-hairline-strong bg-canvas px-2.5 text-body text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-focus disabled:opacity-60"
    />
  );
}
