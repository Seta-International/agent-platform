import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: '/planner' }),
}));

import {
  CopilotProvider,
  usePageContext,
} from '@/modules/copilot/chat-experience/copilot-provider';
import { useCopilotContext } from '@/modules/copilot/hooks/use-copilot-context';

type Snap = ReturnType<typeof usePageContext>['pageContext'];

function Probe({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <CopilotProvider>{children}</CopilotProvider>
    </QueryClientProvider>
  );
}

function ContextEmitter({ kind, id, label }: { kind: string; id: string; label: string }) {
  useCopilotContext({ kind, id, label });
  return null;
}

function ContextProbe({ onSnapshot }: { onSnapshot: (ctx: Snap) => void }) {
  const { pageContext } = usePageContext();
  onSnapshot(pageContext);
  return null;
}

describe('useCopilotContext', () => {
  it('writes pageContext on mount and clears on unmount', () => {
    let snap: Snap = null;
    const { unmount } = render(
      <Probe>
        <ContextEmitter kind="planner.task" id="t1" label="X" />
        <ContextProbe
          onSnapshot={(v) => {
            snap = v;
          }}
        />
      </Probe>,
    );
    expect(snap?.id).toBe('t1');
    unmount();
    // remount probe alone — fresh provider, no emitter ⇒ null
    render(
      <Probe>
        <ContextProbe
          onSnapshot={(v) => {
            snap = v;
          }}
        />
      </Probe>,
    );
    expect(snap).toBeNull();
  });

  it('last writer wins when two emitters mount', () => {
    let snap: Snap = null;
    render(
      <Probe>
        <ContextEmitter kind="planner.group" id="g1" label="G" />
        <ContextEmitter kind="planner.task" id="t1" label="T" />
        <ContextProbe
          onSnapshot={(v) => {
            snap = v;
          }}
        />
      </Probe>,
    );
    expect(snap?.kind).toBe('planner.task');
  });
});
