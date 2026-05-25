// biome-ignore-all lint/a11y/useSemanticElements: <button role="radio"> is the standard pattern for a styled segmented radiogroup; <input type="radio"> can't carry the segmented-button visual without wrapper hacks.
import type { TaskWithAssigneesRow } from '@seta/planner';
import { cn, Switch } from '@seta/shared-ui';
import { type KeyboardEvent, useId, useRef } from 'react';
import {
  type PercentComplete,
  useUpdateTaskProgress,
} from '../hooks/mutations/update-task-progress';

interface Props {
  task: TaskWithAssigneesRow;
  planId: string;
}

interface ProgressOption {
  value: PercentComplete;
  label: string;
}

// Planner parity: exactly three states, mirroring Microsoft Planner.
const PROGRESS_OPTIONS: ReadonlyArray<ProgressOption> = [
  { value: 0, label: 'Not started' },
  { value: 50, label: 'In progress' },
  { value: 100, label: 'Completed' },
];

function normalize(percent: number): PercentComplete {
  if (percent >= 100) return 100;
  if (percent > 0) return 50;
  return 0;
}

export function TaskDetailProgressCard({ task, planId }: Props) {
  const update = useUpdateTaskProgress(planId);
  const groupId = useId();
  const buttonsRef = useRef<Array<HTMLButtonElement | null>>([]);
  const current = normalize(task.percent_complete);
  const disabled = task.is_deferred;

  function commit(next: PercentComplete) {
    if (next === current) return;
    update.mutate({
      task_id: task.id,
      expected_version: task.version,
      percent_complete: next,
    });
  }

  function focusIndex(idx: number) {
    const wrapped = (idx + PROGRESS_OPTIONS.length) % PROGRESS_OPTIONS.length;
    const target = buttonsRef.current[wrapped];
    if (target) {
      target.focus();
      const opt = PROGRESS_OPTIONS[wrapped];
      if (opt) commit(opt.value);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, idx: number) {
    if (disabled) return;
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        event.preventDefault();
        focusIndex(idx + 1);
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        event.preventDefault();
        focusIndex(idx - 1);
        break;
      case 'Home':
        event.preventDefault();
        focusIndex(0);
        break;
      case 'End':
        event.preventDefault();
        focusIndex(PROGRESS_OPTIONS.length - 1);
        break;
      default:
        break;
    }
  }

  return (
    <section className="card" aria-label="Progress">
      <header className="mb-1.5">
        <span className="t-sm subtle">Progress</span>
      </header>
      <div
        role="radiogroup"
        aria-label="Progress"
        aria-disabled={disabled || undefined}
        className="inline-flex w-full items-center gap-0.5 rounded-md border border-hairline bg-surface-1 p-0.5"
      >
        {PROGRESS_OPTIONS.map((opt, idx) => {
          const selected = opt.value === current;
          const isCompleted = opt.value === 100;
          const isInProgress = opt.value === 50;
          return (
            <button
              key={opt.value}
              ref={(el) => {
                buttonsRef.current[idx] = el;
              }}
              type="button"
              role="radio"
              aria-checked={selected}
              // Roving tabindex: only the selected radio is in the tab sequence.
              tabIndex={selected ? 0 : -1}
              disabled={disabled}
              data-state={selected ? 'checked' : 'unchecked'}
              data-value={opt.value}
              id={`${groupId}-${opt.value}`}
              onClick={() => commit(opt.value)}
              onKeyDown={(event) => onKeyDown(event, idx)}
              className={cn(
                'flex-1 rounded px-2 py-1.5 text-xs font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-focus',
                'disabled:cursor-not-allowed disabled:opacity-60',
                selected && isCompleted && 'bg-semantic-success text-white shadow-sm',
                selected && isInProgress && 'bg-primary text-white shadow-sm',
                selected && !isCompleted && !isInProgress && 'bg-surface-3 text-ink shadow-sm',
                !selected && 'text-ink-subtle hover:text-ink hover:bg-surface-2',
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
      <div className="mt-2.5 flex items-start gap-2">
        <Switch
          id={`hold-${task.id}`}
          aria-label="Put task on hold"
          checked={task.is_deferred}
          onCheckedChange={(is_deferred) =>
            update.mutate({
              task_id: task.id,
              expected_version: task.version,
              is_deferred,
            })
          }
        />
        <label htmlFor={`hold-${task.id}`} className="flex flex-col">
          <span className="t-sm text-ink">On hold</span>
          <span className="t-xs subtle">Pause this task and hide it from active views.</span>
        </label>
      </div>
    </section>
  );
}
