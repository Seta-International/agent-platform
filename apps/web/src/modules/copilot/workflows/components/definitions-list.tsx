interface Definition {
  id: string;
  name: string;
  module: string;
  description: string;
}

const DEFINITIONS: Definition[] = [
  {
    id: 'copilot.new-task-skill-tag',
    name: 'new-task-skill-tag',
    module: 'copilot',
    description: 'Suggests who to assign each new task to, based on skills',
  },
];

export interface DefinitionsListProps {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

export function DefinitionsList({ selectedId, onSelect }: DefinitionsListProps) {
  return (
    <aside className="hidden w-80 shrink-0 flex-col border-r border-[var(--color-hairline)] lg:flex">
      <header className="flex items-center justify-between border-b border-[var(--color-hairline)] px-4 py-2">
        <h2 className="text-sm font-medium">Workflows</h2>
        {selectedId ? (
          <button
            type="button"
            onClick={() => onSelect(null)}
            className="text-xs text-[var(--color-primary)] hover:underline"
          >
            Clear
          </button>
        ) : null}
      </header>
      <ul className="divide-y divide-[var(--color-hairline-tertiary)]">
        {DEFINITIONS.map((d) => {
          const active = d.id === selectedId;
          return (
            <li key={d.id}>
              <button
                type="button"
                onClick={() => onSelect(active ? null : d.id)}
                aria-pressed={active}
                className={`relative flex w-full flex-col gap-1 px-4 py-3 text-left hover:bg-[var(--color-surface-2)] ${
                  active ? 'bg-[var(--color-primary-tint)]' : ''
                }`}
              >
                {active ? (
                  <span className="absolute inset-y-0 left-0 w-0.5 bg-[var(--color-primary)]" />
                ) : null}
                <span className="font-mono text-xs">{d.id}</span>
                <span className="text-xs text-[var(--color-ink-subtle)]">{d.description}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
