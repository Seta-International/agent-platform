import { Sheet, SheetContent } from '@seta/shared-ui';
import { useEffect, useState } from 'react';
import { CopilotComposer } from './chat-experience/copilot-composer';
import { CopilotHeader } from './chat-experience/copilot-header';
import { useCopilotRuntimeContext, useCopilotSelection } from './chat-experience/copilot-provider';
import { CopilotThreadRail } from './chat-experience/copilot-thread-rail';
import { CopilotTranscript } from './chat-experience/copilot-transcript';

export interface ChatScreenProps {
  threadId?: string;
}

export function ChatScreen({ threadId }: ChatScreenProps) {
  const { selection, actions } = useCopilotSelection();
  const { historyLoading } = useCopilotRuntimeContext();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Sync route param → provider selection. Provider is the source of truth;
  // /copilot/chat keeps a search param for shareable links.
  useEffect(() => {
    if (threadId !== selection.threadId) actions.setThreadId(threadId);
  }, [threadId, selection.threadId, actions]);

  if (historyLoading) {
    return (
      <div className="flex h-full min-h-0 flex-1 items-center justify-center text-caption text-ink-subtle">
        Loading chat…
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-1">
      <div className="hidden lg:flex">
        <CopilotThreadRail activeThreadId={selection.threadId} />
      </div>
      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent
          side="left"
          hideClose
          className="w-[280px] border-r border-hairline bg-surface-1 p-0 sm:max-w-none lg:hidden"
        >
          <CopilotThreadRail
            activeThreadId={selection.threadId}
            onAfterNavigate={() => setMobileNavOpen(false)}
            className="w-full border-r-0 lg:w-full"
          />
        </SheetContent>
      </Sheet>
      <div className="flex min-w-0 flex-1 flex-col">
        <CopilotHeader onOpenMobileNav={() => setMobileNavOpen(true)} />
        <CopilotTranscript />
        <CopilotComposer />
      </div>
    </div>
  );
}
