import { Check } from 'lucide-react';
import { type ReactNode, useId } from 'react';
import type { BlockProps, EntityRef } from './types';

function ConfidenceBar({ score }: { score: number }) {
  const pct = Math.max(0, Math.min(1, score)) * 100;
  return (
    <span
      aria-hidden
      className="relative inline-block h-1 w-12 overflow-hidden rounded-full bg-hairline align-middle"
    >
      <span
        className="absolute inset-y-0 left-0 rounded-full bg-primary"
        style={{ width: `${pct}%` }}
      />
    </span>
  );
}

function RowBody({
  item,
  renderEntity,
}: {
  item: EntityRef;
  renderEntity?: (entity: EntityRef) => ReactNode;
}) {
  return (
    <>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
          {renderEntity?.(item)}
          {item.primary ? (
            <span className="shrink-0 rounded-sm bg-primary/12 px-1 text-[10px] font-medium uppercase tracking-wide text-primary-ink">
              top match
            </span>
          ) : null}
        </div>
      </div>
      {typeof item.score === 'number' ? (
        <div className="mt-1 flex shrink-0 items-center gap-1.5">
          <ConfidenceBar score={item.score} />
          <span className="w-10 text-right font-mono text-caption tabular-nums text-ink-subtle">
            {Math.round(item.score * 100)}%
          </span>
        </div>
      ) : null}
    </>
  );
}

export function EntityListBlock({ block, selectedIds, onToggle, renderEntity }: BlockProps) {
  const items = Array.isArray(block.items) ? (block.items as EntityRef[]) : [];
  const select = block.select === 'single' || block.select === 'none' ? block.select : 'multi';
  // Single-select radios need a shared name so the browser enforces mutual exclusion.
  const radioGroup = useId();

  return (
    <ul className="space-y-0.5">
      {items.map((item) => {
        const isSelected = selectedIds?.includes(item.id) ?? false;

        if (select === 'none') {
          return (
            <li key={item.id}>
              <div className="relative flex items-start gap-2.5 rounded-md border border-transparent px-2 py-2">
                <span className="mt-px size-4 shrink-0" />
                <RowBody item={item} renderEntity={renderEntity} />
              </div>
            </li>
          );
        }

        return (
          <li key={item.id}>
            <label
              className={`relative flex cursor-pointer items-start gap-2.5 rounded-md border px-2 py-2 transition ${
                isSelected
                  ? 'border-primary-border bg-primary-tint/60'
                  : 'border-transparent hover:bg-surface-2'
              }`}
            >
              <input
                type={select === 'single' ? 'radio' : 'checkbox'}
                name={select === 'single' ? radioGroup : undefined}
                className="sr-only"
                checked={isSelected}
                onChange={() => onToggle?.(item.id)}
                aria-label={item.label}
              />
              <span
                aria-hidden
                className={`mt-px grid size-4 shrink-0 place-items-center rounded border transition ${
                  isSelected
                    ? 'border-primary bg-primary text-on-primary'
                    : 'border-hairline-strong bg-canvas'
                }`}
              >
                {isSelected ? <Check className="size-3" strokeWidth={3} /> : null}
              </span>
              <RowBody item={item} renderEntity={renderEntity} />
            </label>
          </li>
        );
      })}
    </ul>
  );
}
