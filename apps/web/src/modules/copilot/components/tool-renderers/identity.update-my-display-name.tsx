import { ChatHitlCard, ChatToolCall } from '@seta/shared-ui';
import { useHitlApproval } from '../../hooks/use-hitl-approval';

export interface UpdateMyDisplayNameProps {
  args: { displayName: string; expiresAt?: string };
  state: 'input-streaming' | 'input-pending-approval' | 'output-available' | 'output-error';
  callId: string;
}

export function UpdateMyDisplayNameRenderer({ args, state, callId }: UpdateMyDisplayNameProps) {
  const { approve, reject } = useHitlApproval();
  if (state === 'input-pending-approval') {
    return (
      <ChatHitlCard
        title="Change display name"
        toolName="identity.updateMyDisplayName"
        expiresAt={args.expiresAt ? new Date(args.expiresAt) : new Date(0)}
        permissionHint="Requires identity.user.write.self"
        onApprove={() => approve.mutate(callId)}
        onReject={(note) => reject.mutate({ callId, note })}
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
    return (
      <ChatToolCall
        name="identity.updateMyDisplayName"
        status="ok"
        summary="Display name updated"
      />
    );
  if (state === 'output-error')
    return <ChatToolCall name="identity.updateMyDisplayName" status="error" summary="failed" />;
  return <ChatToolCall name="identity.updateMyDisplayName" status="running" />;
}
