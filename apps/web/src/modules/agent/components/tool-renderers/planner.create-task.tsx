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

type DupAction = { kind: 'link'; existingIds: string[] } | { kind: 'delete' } | { kind: 'leave' };

interface PlannerCreateTaskOutput {
  kind?: 'kept' | 'linked' | 'deleted' | 'workflow-started';
  taskId?: string;
  runId?: string;
  linkedTo?: string;
}

export interface PlannerCreateTaskRendererProps {
  name: string;
  args: Record<string, unknown>;
  state: 'input-streaming' | 'input-pending-approval' | 'output-available' | 'output-error';
  output?: unknown;
  callId: string;
  approval?: ApprovalCardLike | null;
}

function outputSummary(out: PlannerCreateTaskOutput): string {
  if (out.kind === 'workflow-started') {
    return `Dedup check started (run ${out.runId?.slice(0, 8) ?? '?'})`;
  }
  if (out.kind === 'kept') return 'Task kept';
  if (out.kind === 'linked') {
    return `Task linked to #${out.linkedTo?.slice(0, 8) ?? '?'}`;
  }
  if (out.kind === 'deleted') return 'Task deleted (duplicate)';
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
  const [selectedLinks, setSelectedLinks] = useState<Set<number>>(new Set());

  if (state === 'input-pending-approval') {
    const card = approval ?? null;
    const items = card?.details?.find((d) => d.kind === 'candidateList')?.items ?? [];
    const alternates = card?.alternates ?? [];
    const decline = card?.decline ?? { label: 'Delete this ticket' };
    const summary = card?.summary ?? 'A similar task may already exist.';
    const intent = card?.intent ?? `Duplicate check: "${String(args.title ?? '')}"`;

    function toggleLink(idx: number) {
      setSelectedLinks((prev) => {
        const next = new Set(prev);
        if (next.has(idx)) next.delete(idx);
        else next.add(idx);
        return next;
      });
    }

    const dispatch = async (label: string, action: DupAction) => {
      const { runId, toolCallId } = splitApprovalId(card?.id);
      if (!runId) return;
      setPendingLabel(label);
      try {
        await resolveApproval({
          queryClient,
          runId,
          toolCallId: toolCallId ?? callId,
          approved: action.kind !== 'delete',
          resumeData: action,
          ...(threadId ? { knownThreadId: threadId } : {}),
        });
      } finally {
        setPendingLabel(null);
      }
    };

    const handleLink = () => {
      if (selectedLinks.size === 0) return;
      const ids = [...selectedLinks]
        .map((idx) => {
          const alt = alternates[idx];
          return (alt?.argsPatch as { existingId?: string })?.existingId ?? '';
        })
        .filter(Boolean);
      if (ids.length > 0) {
        void dispatch('Link ticket', { kind: 'link', existingIds: ids });
      }
    };

    return (
      <ChatHitlCard
        title={name}
        toolName={name}
        permissionHint="Requires planner.task.create"
        onApprove={() => void dispatch('Leave it', { kind: 'leave' })}
        onReject={() => void dispatch(decline.label, { kind: 'delete' })}
        pending={
          pendingLabel === 'Leave it' ? 'approve' : pendingLabel === decline.label ? 'reject' : null
        }
      >
        <div className="space-y-3 text-body-sm">
          <div className="rounded-md border border-hairline bg-surface-1 p-3">
            <div className="text-caption text-ink-subtle">{summary}</div>
            <div className="mt-1 font-medium">{intent}</div>
          </div>
          {items.length > 0 && (
            <fieldset className="space-y-0.5">
              <legend className="mb-1.5 text-eyebrow uppercase text-ink-subtle">
                Possible duplicates — select to link
              </legend>
              <ul className="space-y-0.5">
                {items.map((it, idx) => {
                  const isSelected = selectedLinks.has(idx);
                  return (
                    <li key={it.id}>
                      <label
                        className={`flex cursor-pointer items-center gap-2.5 rounded-md border px-2.5 py-1.5 transition ${
                          isSelected
                            ? 'border-primary-border bg-primary-tint/60'
                            : 'border-transparent hover:bg-surface-2'
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="sr-only"
                          checked={isSelected}
                          onChange={() => toggleLink(idx)}
                          disabled={pendingLabel !== null}
                        />
                        <span
                          aria-hidden
                          className={`grid size-4 shrink-0 place-items-center rounded border transition ${
                            isSelected
                              ? 'border-primary bg-primary text-on-primary'
                              : 'border-hairline-strong bg-canvas'
                          }`}
                        >
                          {isSelected ? (
                            <svg
                              className="size-3"
                              viewBox="0 0 12 12"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              aria-hidden="true"
                            >
                              <path d="M2 6l3 3 5-5" />
                            </svg>
                          ) : null}
                        </span>
                        <span className="min-w-0 flex-1 truncate">
                          <span className="font-mono text-caption text-ink-subtle">
                            #{it.id.slice(0, 8)}
                          </span>{' '}
                          — {it.label}
                        </span>
                        {typeof it.score === 'number' && (
                          <span className="shrink-0 font-mono text-caption tabular-nums text-ink-subtle">
                            {it.score.toFixed(2)}
                          </span>
                        )}
                      </label>
                    </li>
                  );
                })}
              </ul>
            </fieldset>
          )}
          {/* 3 buttons: Link left, Delete + Leave right */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={selectedLinks.size === 0 || pendingLabel !== null}
              onClick={handleLink}
              className="rounded border border-hairline bg-surface-1 px-2.5 py-1 text-caption font-medium hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pendingLabel === 'Link ticket'
                ? 'Linking…'
                : `Link ticket${selectedLinks.size > 1 ? `s (${selectedLinks.size})` : ''}`}
            </button>
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                disabled={pendingLabel !== null}
                onClick={() => void dispatch(decline.label, { kind: 'delete' })}
                className="rounded border border-hairline bg-surface-1 px-2.5 py-1 text-caption font-medium text-danger-ink hover:bg-danger-tint disabled:cursor-not-allowed disabled:opacity-50"
              >
                {pendingLabel === decline.label ? 'Deleting…' : 'Delete this ticket'}
              </button>
              <button
                type="button"
                disabled={pendingLabel !== null}
                onClick={() => void dispatch('Leave it', { kind: 'leave' })}
                className="rounded border border-hairline bg-surface-1 px-2.5 py-1 text-caption font-medium hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {pendingLabel === 'Leave it' ? 'Working…' : 'Leave it'}
              </button>
            </div>
          </div>
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
