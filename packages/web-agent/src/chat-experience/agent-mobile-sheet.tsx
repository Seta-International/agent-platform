import { Dialog, Layout, LayoutContent } from '@seta/shared-ui';
import { useRouterState } from '@tanstack/react-router';
import { Sparkles } from 'lucide-react';
import { useIsMobile } from '../lib/use-is-mobile';
import { usePanelUI } from './agent-provider';
import { AgentSidePanel } from './agent-side-panel';

export function AgentMobileSheet() {
  const { panelOpen, setPanelOpen } = usePanelUI();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isMobile = useIsMobile();
  // Hide on the dedicated /agent/* surface — the full-screen chat already lives there.
  if (pathname.startsWith('/agent/')) return null;
  // On desktop, the AppShell renders the docked side panel; mounting the Dialog here
  // would dim the screen via its backdrop.
  if (!isMobile) return null;

  return (
    <>
      <button
        type="button"
        aria-label="Open agent"
        onClick={() => setPanelOpen(true)}
        className="fixed bottom-4 right-4 z-40 inline-flex size-12 items-center justify-center rounded-full bg-primary text-on-primary shadow-lg"
      >
        <Sparkles className="size-5" aria-hidden />
      </button>
      <Dialog
        isOpen={panelOpen}
        onOpenChange={setPanelOpen}
        purpose="info"
        position={{ left: 0, right: 0, bottom: 0 }}
        width="100%"
        maxHeight="85dvh"
        padding={0}
        aria-label="Agent panel"
      >
        {/*
         * Headerless: AgentSidePanel renders its own header with a close control, so a
         * `DialogHeader` here would stack two header bars. The accessible name comes from
         * the Dialog's `aria-label` above.
         */}
        <Layout
          padding={0}
          content={
            <LayoutContent padding={0}>
              <AgentSidePanel onClose={() => setPanelOpen(false)} showThreadSwitcher={false} />
            </LayoutContent>
          }
        />
      </Dialog>
    </>
  );
}
