import { AssistantChatTransport, useChatRuntime } from '@assistant-ui/react-ai-sdk';
import type { UIMessage } from 'ai';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { buildPageContextPart } from '../lib/page-context-part';
import type { PageContext } from '../lib/page-context-types';

interface UseCopilotRuntimeOpts {
  agentName: string;
  threadId?: string;
  modelKey?: string;
  initialMessages?: UIMessage[];
  /**
   * When provided, the runtime attaches a `data-page-context` part to outgoing
   * user messages whose context id is not equal to `suppressedFor`. The ref is
   * read at send time so updates from `<CopilotProvider>` are picked up without
   * re-creating the runtime.
   */
  pageContextRef?: { current: { ctx: PageContext | null; suppressedFor: string | null } };
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

  const pageContextRef = opts.pageContextRef;
  const toCreateMessage = useCallback(
    (message: { role: string; content: ReadonlyArray<unknown> }) => {
      const parts: Array<{ type: string; [k: string]: unknown }> = [];
      for (const part of message.content) {
        if (!part || typeof part !== 'object') continue;
        const p = part as { type?: unknown };
        if (p.type === 'text') {
          parts.push({ type: 'text', text: (part as { text: string }).text });
        } else if (p.type === 'image') {
          const img = part as { image: string; filename?: string };
          parts.push({
            type: 'file',
            url: img.image,
            mediaType: 'image/png',
            ...(img.filename ? { filename: img.filename } : {}),
          });
        } else if (p.type === 'file') {
          const f = part as { data: string; mimeType: string; filename?: string };
          parts.push({
            type: 'file',
            url: f.data,
            mediaType: f.mimeType,
            ...(f.filename ? { filename: f.filename } : {}),
          });
        }
      }

      const snap = pageContextRef?.current;
      if (message.role === 'user' && snap?.ctx && snap.suppressedFor !== snap.ctx.id) {
        parts.push(
          buildPageContextPart(snap.ctx) as unknown as { type: string; [k: string]: unknown },
        );
      }

      return { role: message.role as 'user', parts } as never;
    },
    [pageContextRef],
  );

  return useChatRuntime({
    transport,
    ...(opts.initialMessages ? { messages: opts.initialMessages } : {}),
    toCreateMessage,
  });
}
