import {
  Alert,
  AlertDescription,
  Avatar,
  AvatarFallback,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@seta/shared-ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { fetchTalentPool } from '../api/hiring-client.ts';
import { hiringKeys } from '../state/query-keys.ts';

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('') || '?'
  );
}

export function TalentPoolCard({
  onOpenCandidate,
  search = '',
}: {
  onOpenCandidate: (id: string) => void;
  /** The page's search box also narrows the pool (name, seniority, recommended role). */
  search?: string;
}) {
  const [show, setShow] = useState(false);
  const pool = useQuery({
    queryKey: hiringKeys.talentPool(),
    queryFn: fetchTalentPool,
    enabled: show,
  });

  const needle = search.trim().toLowerCase();
  const rows = needle
    ? (pool.data ?? []).filter((c) =>
        [c.name, c.seniority ?? '', ...c.recommended.map((r) => r.title)]
          .join(' ')
          .toLowerCase()
          .includes(needle),
      )
    : (pool.data ?? []);

  return (
    <Card className="mt-6">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Talent pool</CardTitle>
        <Button size="sm" variant="ghost" onClick={() => setShow((v) => !v)}>
          {show ? 'Hide' : 'Show'}
        </Button>
      </CardHeader>
      {show && (
        <CardContent>
          {pool.error ? (
            <Alert variant="destructive">
              <AlertDescription>{(pool.error as Error).message}</AlertDescription>
            </Alert>
          ) : pool.isLoading ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-24 animate-pulse rounded-lg border border-hairline bg-surface-2"
                />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="text-ink-muted">
              {(pool.data?.length ?? 0) === 0
                ? 'No past candidates to re-match yet.'
                : 'No talent pool candidates match your search.'}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {rows.map((c) => (
                <div key={c.candidate_id} className="rounded-lg border border-hairline p-3">
                  <button
                    type="button"
                    className="flex items-center gap-2 text-left"
                    onClick={() => onOpenCandidate(c.candidate_id)}
                  >
                    <Avatar className="size-8">
                      <AvatarFallback>{initials(c.name)}</AvatarFallback>
                    </Avatar>
                    <span>
                      <span className="block font-semibold text-ink">{c.name}</span>
                      <span className="block text-caption text-ink-muted">
                        {c.seniority ?? '—'}
                        {c.segment === 'alumni'
                          ? ' · alumni'
                          : c.last_status === 'transferred'
                            ? ' · transferred'
                            : c.last_status === 'rejected'
                              ? ' · rejected'
                              : c.last_status === 'cancelled'
                                ? ' · role cancelled'
                                : ' · past candidate'}
                      </span>
                    </span>
                  </button>
                  {c.recommended.length > 0 ? (
                    <div className="mt-2">
                      <span className="text-caption text-ink-muted">Recommended for</span>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {c.recommended.map((r) => (
                          <Badge
                            key={r.requisition_id}
                            variant={r.fit.strong ? 'default' : 'secondary'}
                          >
                            {r.title}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="mt-2 text-caption text-ink-muted">
                      No matching open role right now
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
