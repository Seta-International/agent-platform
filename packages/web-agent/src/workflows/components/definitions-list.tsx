import { useWorkflowDefinitions } from '../hooks/use-workflow-definitions.ts';

export interface DefinitionsListProps {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

export function DefinitionsList({ selectedId, onSelect }: DefinitionsListProps) {
  const { data, isLoading, error } = useWorkflowDefinitions();
  const definitions = data?.rows ?? [];

  return (
    <aside className="hidden w-80 shrink-0 flex-col border-r border-hairline lg:flex">
      <header className="flex h-11 flex-none items-center justify-between border-b border-hairline px-4 text-[11px] font-medium uppercase tracking-wider text-ink-subtle">
        <span>Definitions</span>
        {selectedId ? (
          <button
            type="button"
            onClick={() => onSelect(null)}
            className="text-xs font-normal normal-case tracking-normal text-primary hover:underline"
          >
            Clear
          </button>
        ) : null}
      </header>
      {isLoading ? (
        <div className="p-4 text-xs text-ink-subtle">Loading…</div>
      ) : error ? (
        <div className="p-4 text-xs text-danger">Failed to load definitions.</div>
      ) : definitions.length === 0 ? (
        <div className="p-4 text-xs text-ink-subtle">No workflows registered.</div>
      ) : (
        <ul className="divide-y divide-hairline-tertiary">
          {definitions.map((d) => {
            const active = d.id === selectedId;
            return (
              <li key={d.id}>
                <button
                  type="button"
                  onClick={() => onSelect(active ? null : d.id)}
                  aria-pressed={active}
                  className={`relative flex w-full flex-col gap-1 px-4 py-3 text-left hover:bg-surface-2 ${
                    active ? 'bg-primary-tint' : ''
                  }`}
                >
                  {active ? <span className="absolute inset-y-0 left-0 w-0.5 bg-primary" /> : null}
                  <span className="font-mono text-xs text-ink">{d.id}</span>
                  <span className="text-[10px] uppercase tracking-wider text-ink-subtle">
                    {d.domain}
                  </span>
                  <span className="text-xs text-ink-subtle">{d.description}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
