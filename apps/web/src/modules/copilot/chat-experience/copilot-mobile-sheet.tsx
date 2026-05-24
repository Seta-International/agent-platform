import { Sheet, SheetContent } from '@seta/shared-ui';
import { useRouterState } from '@tanstack/react-router';
import { Sparkles } from 'lucide-react';
import { usePanelUI } from './copilot-provider';
import { CopilotSidePanel } from './copilot-side-panel';

export function CopilotMobileSheet() {
  const { panelOpen, setPanelOpen } = usePanelUI();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // Hide on the dedicated /copilot/* surface — the full-screen chat already lives there.
  if (pathname.startsWith('/copilot/')) return null;

  return (
    <>
      <button
        type="button"
        aria-label="Open copilot"
        onClick={() => setPanelOpen(true)}
        className="fixed bottom-4 right-4 z-40 inline-flex size-12 items-center justify-center rounded-full bg-primary text-on-primary shadow-lg lg:hidden"
      >
        <Sparkles className="size-5" aria-hidden />
      </button>
      <Sheet open={panelOpen} onOpenChange={setPanelOpen}>
        <SheetContent
          side="bottom"
          className="h-[85vh] border-t border-hairline bg-surface-1 p-0 lg:hidden"
        >
          <CopilotSidePanel />
        </SheetContent>
      </Sheet>
    </>
  );
}
