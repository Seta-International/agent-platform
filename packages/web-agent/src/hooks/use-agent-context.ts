import { useEffect } from 'react';
import { type PageContext, usePageContext } from '../chat-experience/agent-provider';

export function useAgentContext(ctx: PageContext): void {
  const { setPageContext } = usePageContext();
  const { kind, id, label, summary } = ctx;
  useEffect(() => {
    setPageContext({ kind, id, label, summary });
    return () => {
      setPageContext(null);
    };
  }, [setPageContext, kind, id, label, summary]);
}
