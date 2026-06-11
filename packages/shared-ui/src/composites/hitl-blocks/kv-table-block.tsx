import type { BlockProps } from './types';

interface KvRow {
  k: string;
  v: string;
}

export function KvTableBlock({ block }: BlockProps) {
  const rows = Array.isArray(block.rows) ? (block.rows as KvRow[]) : [];
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-caption">
      {rows.map((row) => (
        <div key={row.k} className="contents">
          <dt className="text-ink-subtle">{row.k}</dt>
          <dd className="text-ink">{row.v}</dd>
        </div>
      ))}
    </dl>
  );
}
