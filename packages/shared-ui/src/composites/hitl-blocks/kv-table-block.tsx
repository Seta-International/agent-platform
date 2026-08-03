import type { BlockProps } from './types';

interface KvRow {
  k: string;
  v: string;
}

export function KvTableBlock({ block }: BlockProps) {
  const rows = Array.isArray(block.rows) ? (block.rows as KvRow[]) : [];
  return (
    // A description list, not a Table: the primitive models a header plus rows of
    // homogeneous columns, and this is a label/value pair inside chat-card chrome.
    // `minmax(0,1fr)` + break-words is what stops a 400-char description (or an
    // unbroken URL) from widening the card past the thread.
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
      {rows.map((row) => (
        <div key={row.k} className="contents">
          <dt className="text-secondary">{row.k}</dt>
          <dd className="min-w-0 break-words text-primary">{row.v}</dd>
        </div>
      ))}
    </dl>
  );
}
