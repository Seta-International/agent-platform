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
      {/* Not an IconButton: a circular FAB. IconButton is Button with
          isIconOnly and exposes no shape prop, so the round shape would mean
          overriding its radius at equal specificity. */}
      <button
        type="button"
        aria-label="Open agent"
        onClick={() => setPanelOpen(true)}
        className="fixed bottom-4 right-4 z-40 inline-flex size-12 items-center justify-center rounded-full bg-accent-bg text-on-accent shadow-lg"
      >
        <Sparkles className="size-5" aria-hidden />
      </button>
      <Dialog
        isOpen={panelOpen}
        onOpenChange={setPanelOpen}
        purpose="info"
        position={{ start: 0, end: 0, bottom: 0 }}
        width="100%"
        maxHeight="85dvh"
        padding={0}
        aria-label="Agent panel"
        // Only the bottom edge is anchored, so height would collapse to content. Astryx has no
        // `height` prop; this restores the old sheet's fixed `h-[85vh]`, which AgentSidePanel's
        // `h-full` needs to resolve against so its transcript scrolls instead of the whole panel.
        style={{ height: '85dvh' }}
      >
        {/*
         * Headerless: AgentSidePanel renders its own header with a close control, so a
         * `DialogHeader` here would stack two header bars. The accessible name comes from
         * the Dialog's `aria-label` above. The panel owns its scrolling, so LayoutContent
         * must not add a second scroll container.
         */}
        <Layout
          padding={0}
          content={
            <LayoutContent padding={0} isScrollable={false}>
              <AgentSidePanel onClose={() => setPanelOpen(false)} showThreadSwitcher={false} />
            </LayoutContent>
          }
        />
      </Dialog>
    </>
  );
}
