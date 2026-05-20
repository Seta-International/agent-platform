import { Badge, Button, Card, formatRelative } from '@seta/shared-ui';
import { useEffect, useState } from 'react';
import { type ActivityRow, listUserActivityApi } from '../../api/client.ts';

const PAGE = 25;

export function ActivityTab({ userId, onCount }: { userId: string; onCount: (n: number) => void }) {
  const [role, setRole] = useState<'all' | 'actor' | 'subject'>('all');
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading-while-fetching pattern
    setLoading(true);
    (async () => {
      try {
        const res = await listUserActivityApi(userId, role, PAGE, offset);
        if (cancelled) return;
        setRows(res.rows);
        setTotal(res.total);
        onCount(res.total);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, role, offset, onCount]);

  return (
    <Card className="p-5 space-y-3">
      <div className="flex gap-2">
        {(['all', 'actor', 'subject'] as const).map((r) => (
          <Button
            key={r}
            variant={role === r ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => {
              setRole(r);
              setOffset(0);
            }}
          >
            {r === 'all' ? 'All' : r === 'actor' ? 'As actor' : 'As subject'}
          </Button>
        ))}
      </div>
      {loading ? (
        <p className="text-sm text-ink-muted">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-ink-muted">No activity yet</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {rows.map((r) => (
            <a
              key={r.event_id}
              href={`/admin/audit?event=${r.event_id}`}
              className="grid grid-cols-[80px_1fr_auto] items-center gap-3 rounded border border-hairline px-3 py-2 hover:bg-surface-2"
            >
              <span className="text-xs text-ink-muted">{formatRelative(r.occurred_at)}</span>
              <div className="min-w-0">
                <Badge variant="outline" className="text-[10px] h-4 px-1.5 mr-2">
                  {r.event_type}
                </Badge>
                <span className="text-sm">{r.summary}</span>
              </div>
              <span className="text-xs text-ink-muted">›</span>
            </a>
          ))}
        </div>
      )}
      {total > PAGE && (
        <div className="flex items-center justify-between text-xs text-ink-muted pt-2">
          <span>
            {offset + 1}–{Math.min(offset + PAGE, total)} of {total}
          </span>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="ghost"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - PAGE))}
            >
              ‹
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={offset + PAGE >= total}
              onClick={() => setOffset(offset + PAGE)}
            >
              ›
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
