import { Sheet, SheetContent } from '@seta/shared-ui';
import { useRouterState } from '@tanstack/react-router';
import { Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { usePanelUI } from './copilot-provider';
import { CopilotSidePanel } from './copilot-side-panel';

// Tailwind `lg` breakpoint — keep in sync with shared-ui's responsive utilities.
const MOBILE_QUERY = '(max-width: 1023.98px)';

function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(MOBILE_QUERY).matches;
  });
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY);
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return isMobile;
}

export function CopilotMobileSheet() {
  const { panelOpen, setPanelOpen } = usePanelUI();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isMobile = useIsMobile();
  // Hide on the dedicated /copilot/* surface — the full-screen chat already lives there.
  if (pathname.startsWith('/copilot/')) return null;
  // On desktop, the AppShell renders the docked side panel; mounting the Sheet here
  // would dim the screen via its overlay even with `lg:hidden` on the content.
  if (!isMobile) return null;

  return (
    <>
      <button
        type="button"
        aria-label="Open copilot"
        onClick={() => setPanelOpen(true)}
        className="fixed bottom-4 right-4 z-40 inline-flex size-12 items-center justify-center rounded-full bg-primary text-on-primary shadow-lg"
      >
        <Sparkles className="size-5" aria-hidden />
      </button>
      <Sheet open={panelOpen} onOpenChange={setPanelOpen}>
        <SheetContent side="bottom" className="h-[85vh] border-t border-hairline bg-surface-1 p-0">
          <CopilotSidePanel />
        </SheetContent>
      </Sheet>
    </>
  );
}
