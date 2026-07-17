import type { BlockProps } from './types';

interface Citation {
  kind: string;
  id: string;
  label?: string;
}

export function CitationsBlock({ block }: BlockProps) {
  const items = Array.isArray(block.items) ? (block.items as Citation[]) : [];
  if (items.length === 0) return null;
  return (
    <span className="text-caption text-secondary">
      Based on{' '}
      {items.map((c, i) => (
        <span key={`${c.kind}-${c.id}`}>
          {i > 0 ? ', ' : ''}
          <span className="text-secondary">{c.label ?? `${c.kind}#${c.id}`}</span>
        </span>
      ))}
    </span>
  );
}
