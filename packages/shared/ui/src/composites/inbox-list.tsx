import type * as React from 'react';
import { cn } from '../lib/cn';

export interface InboxListItem {
  id: string;
  title: string;
  subtitle?: string;
  meta?: React.ReactNode;
}

export interface InboxListProps {
  items: InboxListItem[];
  selectedId?: string;
  onSelect: (id: string) => void;
  className?: string;
}

export function InboxList({ items, selectedId, onSelect, className }: InboxListProps) {
  return (
    <ul className={cn('flex flex-col', className)}>
      {items.map((item) => {
        const isSelected = item.id === selectedId;
        return (
          <li key={item.id}>
            <button
              type="button"
              aria-current={isSelected ? 'true' : 'false'}
              onClick={() => onSelect(item.id)}
              className={cn(
                'flex w-full flex-col items-start gap-1 border-b border-hairline px-md py-sm text-left transition-colors hover:bg-surface-2',
                isSelected && 'bg-surface-2',
              )}
            >
              <span className="text-body-sm text-ink">{item.title}</span>
              {item.subtitle && (
                <span className="text-caption text-ink-subtle">{item.subtitle}</span>
              )}
              {item.meta && <span className="text-caption text-ink-tertiary">{item.meta}</span>}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
