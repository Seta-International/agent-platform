import { X } from 'lucide-react';
import { usePageContext } from './copilot-provider';

function iconFor(kind: string): string {
  if (kind === 'planner.task') return '📋';
  if (kind === 'planner.group') return '👥';
  if (kind === 'planner.plan') return '🗂️';
  return '📎';
}

export function CopilotContextChip() {
  const { pageContext, suppressedFor, suppressFor } = usePageContext();

  if (!pageContext) return null;
  if (suppressedFor === pageContext.id) return null;

  return (
    <div className="flex items-center gap-1.5 border-t border-hairline bg-surface-1 px-3 py-1.5">
      <span aria-hidden className="text-body-sm">
        {iconFor(pageContext.kind)}
      </span>
      <span className="truncate text-caption text-ink-muted">
        <span className="font-medium text-ink">{pageContext.kind}</span>
        <span className="mx-1 text-ink-tertiary">—</span>
        <span className="truncate">{pageContext.label}</span>
      </span>
      <button
        type="button"
        aria-label="Detach context"
        onClick={() => suppressFor(pageContext.id)}
        className="ml-auto inline-flex size-5 items-center justify-center rounded text-ink-tertiary hover:bg-surface-2 hover:text-ink"
      >
        <X className="size-3" aria-hidden />
      </button>
    </div>
  );
}
