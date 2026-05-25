import { ChatHitlCard, ChatToolCall } from '@seta/shared-ui';
import { useQueryClient } from '@tanstack/react-query';
import { useSearch } from '@tanstack/react-router';
import { useState } from 'react';
import { resolveApproval, splitApprovalId } from '../../lib/resolve-approval';

interface DelegateArgs {
  prompt?: unknown;
  instructions?: unknown;
}

interface DelegateOutput {
  text?: unknown;
}

interface Props {
  targetName: string;
  targetLabel: string;
  args: Record<string, unknown>;
  state: 'input-streaming' | 'input-pending-approval' | 'output-available' | 'output-error';
  output?: unknown;
  approval?: { id?: string } | null;
}

function previewPrompt(args: Record<string, unknown>): string | undefined {
  const a = args as DelegateArgs;
  if (typeof a.prompt !== 'string') return undefined;
  return a.prompt.length > 240 ? `${a.prompt.slice(0, 240)}…` : a.prompt;
}

function summary(args: Record<string, unknown>, output: unknown): string | undefined {
  const o = (output ?? {}) as DelegateOutput;
  const text = typeof o.text === 'string' ? o.text : undefined;
  if (text) return text.length > 120 ? `${text.slice(0, 120)}…` : text;
  return previewPrompt(args);
}

export function DelegateRenderer({
  targetName,
  targetLabel,
  args,
  state,
  output,
  approval,
}: Props) {
  const name = `→ ${targetLabel}`;
  const queryClient = useQueryClient();
  const search = useSearch({ strict: false }) as { thread?: string };
  const threadId = search.thread;
  const [pending, setPending] = useState<'approve' | 'reject' | null>(null);

  const onResolve = async (approved: boolean) => {
    const { runId, toolCallId } = splitApprovalId(approval?.id);
    if (!runId || !toolCallId) return;
    setPending(approved ? 'approve' : 'reject');
    try {
      await resolveApproval({
        queryClient,
        runId,
        toolCallId,
        approved,
        knownThreadId: threadId,
      });
    } finally {
      setPending(null);
    }
  };

  if (state === 'input-pending-approval') {
    return (
      <ChatHitlCard
        title={`Delegate to ${targetLabel}`}
        toolName={`agent-${targetName}`}
        permissionHint={`Will run the ${targetLabel} specialist on your behalf`}
        onApprove={() => void onResolve(true)}
        onReject={() => void onResolve(false)}
        pending={pending}
      >
        <div className="rounded-md border border-hairline bg-surface-1 p-3 text-body-sm">
          <div className="mb-1 font-mono text-caption text-ink-subtle">Prompt</div>
          <div className="whitespace-pre-wrap">{previewPrompt(args) ?? '(none)'}</div>
        </div>
      </ChatHitlCard>
    );
  }
  if (state === 'output-available') {
    return (
      <ChatToolCall
        name={name}
        status="ok"
        summary={summary(args, output)}
        payload={{ args, output }}
      />
    );
  }
  if (state === 'output-error') {
    return <ChatToolCall name={name} status="error" summary="delegation failed" />;
  }
  return <ChatToolCall name={name} status="running" summary={summary(args, undefined)} />;
}
