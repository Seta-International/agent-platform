import { useEffect } from 'react';
import { AgentConversation } from './chat-experience/agent-conversation';
import { AgentHeader } from './chat-experience/agent-header';
import { useAgentSelection } from './chat-experience/agent-provider';

export interface ChatScreenProps {
  threadId?: string;
}

export function ChatScreen({ threadId }: ChatScreenProps) {
  const { selection, actions } = useAgentSelection();

  // Sync route param → provider selection. Provider is the source of truth;
  // /agent/chat keeps a search param for shareable links. The route's
  // `beforeLoad` guarantees the param, but guard anyway: syncing `undefined`
  // would re-mint a fresh id (provider invariant), re-trigger this effect, and
  // loop.
  useEffect(() => {
    if (threadId && threadId !== selection.threadId) actions.setThreadId(threadId);
  }, [threadId, selection.threadId, actions]);

  // Thread history now lives in the global shell SideNav (see the manifest's
  // useNavExtensions), so the page is a single column: header + conversation.
  // The loading state (while a thread's history is fetched before the runtime
  // mounts) is a chat-shaped skeleton rendered by AgentRuntimeHost.
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <AgentHeader />
      <AgentConversation />
    </div>
  );
}
