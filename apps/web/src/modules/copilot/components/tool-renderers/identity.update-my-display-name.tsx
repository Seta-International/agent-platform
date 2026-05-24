import { ChatHitlCard, ChatToolCall } from '@seta/shared-ui';
import { useQueryClient } from '@tanstack/react-query';
import { useSearch } from '@tanstack/react-router';
import { useState } from 'react';
import { resolveApproval, splitApprovalId } from '../../lib/resolve-approval';

export interface UpdateMyDisplayNameProps {
  name: string;
  args: { displayName: string; expiresAt?: string };
  state: 'input-streaming' | 'input-pending-approval' | 'output-available' | 'output-error';
  callId: string;
  approval?: { id?: string } | null;
}

export function UpdateMyDisplayNameRenderer({
  name,
  args,
  state,
  callId,
  approval,
}: UpdateMyDisplayNameProps) {
  const queryClient = useQueryClient();
  const search = useSearch({ strict: false }) as { thread?: string };
  const threadId = search.thread;
  const [pending, setPending] = useState<'approve' | 'reject' | null>(null);

  const onResolve = async (approved: boolean) => {
    const { runId, toolCallId } = splitApprovalId(approval?.id);
    if (!runId) return;
    setPending(approved ? 'approve' : 'reject');
    try {
      await resolveApproval({
        queryClient,
        parentAgentName: 'self',
        runId,
        toolCallId: toolCallId ?? callId,
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
        title={name}
        toolName={name}
        {...(args.expiresAt ? { expiresAt: new Date(args.expiresAt) } : {})}
        permissionHint="Requires identity.user.write.self"
        onApprove={() => void onResolve(true)}
        onReject={() => void onResolve(false)}
        pending={pending}
      >
        <div className="rounded-md border border-hairline bg-surface-1 p-3 text-body-sm">
          <div className="flex items-center gap-2">
            <span className="font-mono text-caption text-ink-subtle">New display name:</span>
            <span className="font-medium">{args.displayName}</span>
          </div>
        </div>
      </ChatHitlCard>
    );
  }
  if (state === 'output-available')
    return <ChatToolCall name={name} status="ok" summary="Display name updated" />;
  if (state === 'output-error') return <ChatToolCall name={name} status="error" summary="failed" />;
  return <ChatToolCall name={name} status="running" />;
}
