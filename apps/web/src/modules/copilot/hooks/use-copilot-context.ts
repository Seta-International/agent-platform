import { useEffect } from 'react';
import { type PageContext, usePageContext } from '../chat-experience/copilot-provider';

export function useCopilotContext(ctx: PageContext): void {
  const { setPageContext } = usePageContext();
  const { kind, id, label, summary } = ctx;
  useEffect(() => {
    setPageContext({ kind, id, label, summary });
    return () => {
      setPageContext(null);
    };
  }, [setPageContext, kind, id, label, summary]);
}
