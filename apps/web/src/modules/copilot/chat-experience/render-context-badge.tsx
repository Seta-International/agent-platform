import type { PageContext } from './copilot-provider';

export function RenderContextBadge({ data }: { data: PageContext }) {
  return (
    <div className="mb-1.5 inline-flex items-center gap-1 rounded bg-surface-2 px-2 py-0.5 text-caption text-ink-subtle">
      <span aria-hidden>📎</span>
      <span>sent with context:</span>
      <span className="font-medium text-ink">{data.kind}</span>
      <span>—</span>
      <span className="truncate">{data.label}</span>
    </div>
  );
}
