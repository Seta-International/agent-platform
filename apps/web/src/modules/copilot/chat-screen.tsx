import { AssistantRuntimeProvider, MessagePrimitive, ThreadPrimitive } from '@assistant-ui/react';
import { ChatMessage, ChatTranscript } from '@seta/shared-ui';
import { ChatComposerContainer } from './components/chat-composer-container';
import { ChatThreadRailContainer } from './components/chat-thread-rail-container';
import { ToolUIRegistry } from './components/tool-renderers';
import { useCopilotRuntime } from './hooks/use-copilot-runtime';

export interface ChatScreenProps {
  threadId?: string;
}

// TextMessagePartComponent receives MessagePartState & TextMessagePart: { type, text, status, ... }
function TextPart({ text }: { text: string }) {
  return <>{text}</>;
}

function UserMessage() {
  return (
    <ChatMessage variant="user">
      <MessagePrimitive.Parts components={{ Text: TextPart }} />
    </ChatMessage>
  );
}

function AssistantMessage() {
  return (
    <ChatMessage variant="agent" author="Supervisor">
      <MessagePrimitive.Parts components={{ Text: TextPart }} />
    </ChatMessage>
  );
}

export function ChatScreen({ threadId }: ChatScreenProps) {
  const runtime = useCopilotRuntime({ agentName: 'router', threadId });
  return (
    <div className="flex h-full min-h-0 flex-1">
      <ChatThreadRailContainer activeThreadId={threadId} />
      <AssistantRuntimeProvider runtime={runtime}>
        <div className="flex min-w-0 flex-1 flex-col">
          <ChatTranscript>
            <ThreadPrimitive.Messages components={{ UserMessage, AssistantMessage }} />
          </ChatTranscript>
          <ToolUIRegistry />
          <ChatComposerContainer />
        </div>
      </AssistantRuntimeProvider>
    </div>
  );
}
