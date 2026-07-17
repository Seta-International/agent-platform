import type { BlockProps } from './types';

interface KvRow {
  k: string;
  v: string;
}

export function KvTableBlock({ block }: BlockProps) {
  const rows = Array.isArray(block.rows) ? (block.rows as KvRow[]) : [];
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
      {rows.map((row) => (
        <div key={row.k} className="contents">
          <dt className="text-secondary">{row.k}</dt>
          <dd className="text-primary">{row.v}</dd>
        </div>
      ))}
    </dl>
  );
}
