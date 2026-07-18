import { useEffect } from 'react';
import { AgentConversation } from './chat-experience/agent-conversation';
import { AgentHeader } from './chat-experience/agent-header';
import { useAgentRuntimeContext, useAgentSelection } from './chat-experience/agent-provider';

export interface ChatScreenProps {
  threadId?: string;
}

export function ChatScreen({ threadId }: ChatScreenProps) {
  const { selection, actions } = useAgentSelection();
  const { historyLoading } = useAgentRuntimeContext();

  // Sync route param → provider selection. Provider is the source of truth;
  // /agent/chat keeps a search param for shareable links. The route's
  // `beforeLoad` guarantees the param, but guard anyway: syncing `undefined`
  // would re-mint a fresh id (provider invariant), re-trigger this effect, and
  // loop.
  useEffect(() => {
    if (threadId && threadId !== selection.threadId) actions.setThreadId(threadId);
  }, [threadId, selection.threadId, actions]);

  if (historyLoading) {
    return (
      <div className="flex h-full min-h-0 flex-1 items-center justify-center text-sm text-secondary">
        Loading chat…
      </div>
    );
  }

  // Thread history now lives in the global shell SideNav (see the manifest's
  // useNavExtensions), so the page is a single column: header + conversation.
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <AgentHeader />
      <AgentConversation />
    </div>
  );
}
