import { Dialog, Layout, LayoutContent } from '@seta/shared-ui';
import { useEffect, useState } from 'react';
import { AgentConversation } from './chat-experience/agent-conversation';
import { AgentHeader } from './chat-experience/agent-header';
import { useAgentRuntimeContext, useAgentSelection } from './chat-experience/agent-provider';
import { AgentThreadRail } from './chat-experience/agent-thread-rail';
import { useIsMobile } from './lib/use-is-mobile';

export interface ChatScreenProps {
  threadId?: string;
}

export function ChatScreen({ threadId }: ChatScreenProps) {
  const { selection, actions } = useAgentSelection();
  const { historyLoading } = useAgentRuntimeContext();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  // The old Radix sheet hid itself on desktop with `lg:hidden` on its content; Astryx
  // components take no Tailwind, so gate the mount instead.
  const isMobile = useIsMobile();

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

  return (
    <div className="flex h-full min-h-0 flex-1">
      <div className="hidden lg:flex">
        <AgentThreadRail activeThreadId={selection.threadId} />
      </div>
      {isMobile && (
        <Dialog
          isOpen={mobileNavOpen}
          onOpenChange={setMobileNavOpen}
          purpose="info"
          position={{ top: 0, left: 0, bottom: 0 }}
          width={280}
          maxHeight="100dvh"
          padding={0}
          aria-label="Chat navigation"
          // Native <dialog> top-layer: guarantee the sheet has a visible box even if the
          // Astryx `open` display-flip loses the cascade after the FUT-725 CSS-load change.
          style={{ display: mobileNavOpen ? 'flex' : undefined, margin: 0, height: '100dvh' }}
        >
          {/*
           * Headerless: the rail is the whole surface — light-dismiss and picking a thread
           * close it, mirroring the old sheet's `hideClose`.
           */}
          <Layout
            padding={0}
            content={
              <LayoutContent padding={0}>
                <AgentThreadRail
                  activeThreadId={selection.threadId}
                  onAfterNavigate={() => setMobileNavOpen(false)}
                  className="w-full border-r-0 lg:w-full"
                />
              </LayoutContent>
            }
          />
        </Dialog>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <AgentHeader onOpenMobileNav={() => setMobileNavOpen(true)} />
        <AgentConversation />
      </div>
    </div>
  );
}
