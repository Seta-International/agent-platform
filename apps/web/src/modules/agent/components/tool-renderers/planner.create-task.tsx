import { ChatHitlCard, ChatToolCall } from '@seta/shared-ui';
import { useQueryClient } from '@tanstack/react-query';
import { useSearch } from '@tanstack/react-router';
import { useState } from 'react';
import { resolveApproval, splitApprovalId } from '../../lib/resolve-approval';

interface ApprovalCardLike {
  id?: string;
  intent?: string;
  summary?: string;
  details?: Array<{
    kind: 'candidateList' | 'kvTable' | 'text' | 'diff' | 'confirmationChecklist';
    items?: Array<{ id: string; label: string; score?: number }>;
  }>;
  primary?: { label: string; argsPatch?: Record<string, unknown> };
  alternates?: Array<{ label: string; argsPatch: Record<string, unknown> }>;
  decline?: { label: string };
}

type DupAction =
  | { kind: 'create-new' }
  | { kind: 'link'; existingId: string; mode: 'related' | 'sub-task' }
  | { kind: 'cancel' };

interface PlannerCreateTaskOutput {
  kind?: 'created' | 'sub-task-added' | 'cancelled' | 'workflow-started';
  taskId?: string;
  runId?: string;
  linkedTo?: string;
  existingId?: string;
}

export interface PlannerCreateTaskRendererProps {
  name: string;
  args: Record<string, unknown>;
  state: 'input-streaming' | 'input-pending-approval' | 'output-available' | 'output-error';
  output?: unknown;
  callId: string;
  approval?: ApprovalCardLike | null;
}

function argsPatchToAction(patch: Record<string, unknown> | undefined): DupAction {
  if (!patch) return { kind: 'cancel' };
  const action = patch.action;
  if (action === 'create-new') return { kind: 'create-new' };
  if (action === 'cancel') return { kind: 'cancel' };
  if (
    action === 'link' &&
    typeof patch.existingId === 'string' &&
    (patch.mode === 'related' || patch.mode === 'sub-task')
  ) {
    return { kind: 'link', existingId: patch.existingId, mode: patch.mode };
  }
  return { kind: 'cancel' };
}

function outputSummary(out: PlannerCreateTaskOutput): string {
  if (out.kind === 'workflow-started') {
    return `Dedup check started (run ${out.runId?.slice(0, 8) ?? '?'})`;
  }
  if (out.kind === 'created') {
    return out.linkedTo ? `Created task linked to #${out.linkedTo.slice(0, 8)}` : 'Task created';
  }
  if (out.kind === 'sub-task-added') {
    return `Added as sub-task of #${out.existingId?.slice(0, 8) ?? '?'}`;
  }
  if (out.kind === 'cancelled') return 'Cancelled';
  return 'Done';
}

export function PlannerCreateTaskRenderer({
  name,
  args,
  state,
  output,
  callId,
  approval,
}: PlannerCreateTaskRendererProps) {
  const queryClient = useQueryClient();
  const search = useSearch({ strict: false }) as { thread?: string };
  const threadId = search.thread;
  const [pendingLabel, setPendingLabel] = useState<string | null>(null);

  if (state === 'input-pending-approval') {
    const card = approval ?? null;
    const items = card?.details?.find((d) => d.kind === 'candidateList')?.items ?? [];
    const primary = card?.primary ?? { label: 'Create new', argsPatch: { action: 'create-new' } };
    const alternates = card?.alternates ?? [];
    const decline = card?.decline ?? { label: 'Cancel' };
    const summary = card?.summary ?? 'A similar task may already exist.';
    const intent = card?.intent ?? `Create task: "${String(args.title ?? '')}"`;

    const dispatch = async (label: string, action: DupAction) => {
      const { runId, toolCallId } = splitApprovalId(card?.id);
      if (!runId) return;
      setPendingLabel(label);
      try {
        await resolveApproval({
          queryClient,
          runId,
          toolCallId: toolCallId ?? callId,
          approved: action.kind !== 'cancel',
          resumeData: action,
          ...(threadId ? { knownThreadId: threadId } : {}),
        });
      } finally {
        setPendingLabel(null);
      }
    };

    return (
      <ChatHitlCard
        title={name}
        toolName={name}
        permissionHint="Requires planner.task.create"
        onApprove={() => void dispatch(primary.label, argsPatchToAction(primary.argsPatch))}
        onReject={() => void dispatch(decline.label, { kind: 'cancel' })}
        pending={
          pendingLabel === primary.label
            ? 'approve'
            : pendingLabel === decline.label
              ? 'reject'
              : null
        }
      >
        <div className="space-y-3 text-body-sm">
          <div className="rounded-md border border-hairline bg-surface-1 p-3">
            <div className="text-caption text-ink-subtle">{summary}</div>
            <div className="mt-1 font-medium">{intent}</div>
          </div>
          {items.length > 0 && (
            <ul className="space-y-1 rounded-md border border-hairline bg-surface-1 p-3">
              {items.map((it) => (
                <li key={it.id} className="text-body-sm">
                  <span className="font-mono text-caption text-ink-subtle">
                    #{it.id.slice(0, 8)}
                  </span>{' '}
                  — {it.label}
                  {typeof it.score === 'number' && (
                    <span className="ml-2 text-caption text-ink-subtle">
                      score {it.score.toFixed(2)}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
          {alternates.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {alternates.map((a) => (
                <button
                  key={a.label}
                  type="button"
                  disabled={pendingLabel !== null}
                  onClick={() => void dispatch(a.label, argsPatchToAction(a.argsPatch))}
                  className="rounded border border-hairline bg-surface-1 px-2.5 py-1 text-caption hover:bg-surface-2 disabled:opacity-50"
                >
                  {pendingLabel === a.label ? 'Working…' : a.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </ChatHitlCard>
    );
  }

  if (state === 'output-available') {
    return (
      <ChatToolCall
        name={name}
        status="ok"
        summary={outputSummary((output ?? {}) as PlannerCreateTaskOutput)}
        payload={output ?? undefined}
      />
    );
  }
  if (state === 'output-error') return <ChatToolCall name={name} status="error" summary="failed" />;
  return <ChatToolCall name={name} status="running" />;
}
