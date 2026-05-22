import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { cn } from '../lib/cn';
import { FieldConflictRow } from './field-conflict-row';

export interface TaskConflictGroupProps {
  taskId: string;
  taskTitle: string;
  taskUrl: string;
  fields: Array<{ field: string; local: unknown; remote: unknown; snapshot?: unknown }>;
  decisions: Record<string, 'local' | 'remote'>;
  onChoose: (field: string, choice: 'local' | 'remote') => void;
  defaultOpen?: boolean;
}

export function TaskConflictGroup(p: TaskConflictGroupProps) {
  const [open, setOpen] = useState(p.defaultOpen ?? false);

  const total = p.fields.length;
  const chosen = p.fields.filter((f) => p.decisions[f.field] !== undefined).length;
  const conflictLabel = total === 1 ? '1 conflict' : `${total} conflicts`;

  function toggle() {
    setOpen((v) => !v);
  }

  return (
    <section className="border border-border rounded-md">
      <div className="flex items-center gap-2 px-3 py-2 rounded-t-md hover:bg-surface-hover">
        <button
          type="button"
          aria-expanded={open}
          aria-label={open ? 'Collapse task conflicts' : 'Expand task conflicts'}
          className="flex items-center shrink-0 cursor-pointer select-none"
          onClick={toggle}
        >
          <ChevronDown
            aria-hidden
            className={cn('h-4 w-4 transition-transform', !open && '-rotate-90')}
          />
        </button>
        <a
          href={p.taskUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-medium hover:underline flex-1 min-w-0 truncate"
        >
          {p.taskTitle}
        </a>
        <span className="text-xs text-ink-subtle shrink-0">
          {conflictLabel} · {chosen}/{total} chosen
        </span>
      </div>

      {open && (
        <div className="divide-y divide-border px-3 py-2 flex flex-col gap-3">
          {p.fields.map((f) => (
            <FieldConflictRow
              key={f.field}
              field={f.field}
              local={f.local}
              remote={f.remote}
              snapshot={f.snapshot}
              choice={p.decisions[f.field] ?? null}
              onChoose={(c) => p.onChoose(f.field, c)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
