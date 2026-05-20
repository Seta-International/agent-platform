import { AssistantChatTransport, useChatRuntime } from '@assistant-ui/react-ai-sdk';
import type { UIMessage } from 'ai';
import { useCallback, useEffect, useMemo, useRef } from 'react';

interface UseCopilotRuntimeOpts {
  agentName: string;
  threadId?: string;
  modelKey?: string;
  initialMessages?: UIMessage[];
}

export function useCopilotRuntime(opts: UseCopilotRuntimeOpts) {
  const modelRef = useRef(opts.modelKey);
  useEffect(() => {
    modelRef.current = opts.modelKey;
  }, [opts.modelKey]);

  const readBody = useCallback(() => {
    const m = modelRef.current;
    return m ? { model: m } : {};
  }, []);

  const transport = useMemo(() => {
    // eslint-disable-next-line react-hooks/refs -- readBody captures modelRef and is only invoked when the transport sends; safe.
    return new AssistantChatTransport({
      api: `/api/copilot/v1/chat/${opts.agentName}`,
      credentials: 'include',
      body: readBody,
    });
  }, [opts.agentName, readBody]);

  return useChatRuntime({
    transport,
    ...(opts.initialMessages ? { messages: opts.initialMessages } : {}),
  });
}
