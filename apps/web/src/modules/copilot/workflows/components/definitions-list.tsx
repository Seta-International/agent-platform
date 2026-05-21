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
    description: 'Proposes the best skill-matched assignee when a task is created',
  },
];

export function DefinitionsList() {
  return (
    <aside className="hidden w-80 shrink-0 flex-col border-r border-[var(--color-hairline)] lg:flex">
      <header className="border-b border-[var(--color-hairline)] px-4 py-2">
        <h2 className="text-sm font-medium">Definitions</h2>
      </header>
      <ul className="divide-y divide-[var(--color-hairline-tertiary)]">
        {DEFINITIONS.map((d) => (
          <li key={d.id} className="flex flex-col gap-1 px-4 py-3">
            <span className="font-mono text-xs">{d.id}</span>
            <span className="text-xs text-[var(--color-ink-subtle)]">{d.description}</span>
          </li>
        ))}
      </ul>
    </aside>
  );
}
