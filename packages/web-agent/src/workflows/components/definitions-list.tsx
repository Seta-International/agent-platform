import { Button } from '@seta/shared-ui';
import { useWorkflowDefinitions } from '../hooks/use-workflow-definitions.ts';

export interface DefinitionsListProps {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

export function DefinitionsList({ selectedId, onSelect }: DefinitionsListProps) {
  const { data, isLoading, error } = useWorkflowDefinitions();
  const definitions = data?.rows ?? [];

  return (
    <aside className="hidden w-80 shrink-0 flex-col border-r border-border lg:flex">
      <header className="flex h-11 flex-none items-center justify-between border-b border-border px-4 text-[11px] font-medium uppercase tracking-wider text-secondary">
        <span>Definitions</span>
        {selectedId ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            label="Clear"
            onClick={() => onSelect(null)}
            className="normal-case tracking-normal"
          />
        ) : null}
      </header>
      {isLoading ? (
        <div className="p-4 text-xs text-secondary">Loading…</div>
      ) : error ? (
        <div className="p-4 text-xs text-error">Failed to load definitions.</div>
      ) : definitions.length === 0 ? (
        <div className="p-4 text-xs text-secondary">No workflows registered.</div>
      ) : (
        <ul className="divide-y divide-border">
          {definitions.map((d) => {
            const active = d.id === selectedId;
            return (
              <li key={d.id}>
                <button
                  type="button"
                  onClick={() => onSelect(active ? null : d.id)}
                  aria-pressed={active}
                  className={`relative flex w-full flex-col gap-1 px-4 py-3 text-left hover:bg-surface ${
                    active ? 'bg-accent-muted' : ''
                  }`}
                >
                  {active ? (
                    <span className="absolute inset-y-0 left-0 w-0.5 bg-accent-bg" />
                  ) : null}
                  <span className="font-mono text-xs text-primary">{d.id}</span>
                  <span className="text-[10px] uppercase tracking-wider text-secondary">
                    {d.domain}
                  </span>
                  <span className="text-xs text-secondary">{d.description}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
