import {
  Avatar,
  Badge,
  Banner,
  Button,
  Card,
  CardTitle,
  HStack,
  Text,
  VStack,
} from '@seta/shared-ui';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { fetchTalentPool, type TalentPoolRow } from '../api/hiring-client.ts';
import { hiringKeys } from '../state/query-keys.ts';

// Why the candidate leaves the active pipeline — appended after seniority in the meta line.
function statusSuffix(c: TalentPoolRow): string {
  if (c.segment === 'alumni') return ' · alumni';
  if (c.last_status === 'transferred') return ' · transferred';
  if (c.last_status === 'rejected') return ' · rejected';
  if (c.last_status === 'cancelled') return ' · cancelled';
  return ' · past candidate';
}

export function TalentPoolCard({
  onOpenCandidate,
  layout = 'board',
  q = '',
  reqFilter = '',
  seniorityFilter = '',
}: {
  onOpenCandidate: (id: string) => void;
  /** Match the surrounding candidates view: 'board' keeps the card grid, 'list' renders full-width
   * rows so the pool reads like the list table above it instead of staying card-shaped. */
  layout?: 'board' | 'list';
  /** Active board filters — the pool honours the ones it has data for (name search, seniority,
   * and requisition via its recommended roles). Source isn't stored on pool rows, so it's not
   * applied here. */
  q?: string;
  reqFilter?: string;
  seniorityFilter?: string;
}) {
  const [show, setShow] = useState(false);
  // FUT-833: search runs server-side (`q`) so contact PII never rides the full pool payload.
  const [debouncedQ, setDebouncedQ] = useState(q);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  const pool = useQuery({
    queryKey: hiringKeys.talentPool(debouncedQ),
    queryFn: () => fetchTalentPool(debouncedQ),
    enabled: show,
  });

  const filtered = (pool.data ?? []).filter((c) => {
    if (seniorityFilter && c.seniority !== seniorityFilter) return false;
    // A requisition filter narrows the pool to candidates the matcher recommends for that role.
    if (reqFilter && !c.recommended.some((r) => r.requisition_id === reqFilter)) return false;
    return true;
  });
  const hasFilters = Boolean(seniorityFilter || reqFilter || debouncedQ);

  return (
    <Card padding={4}>
      <HStack hAlign="between" vAlign="center" gap={2}>
        <VStack gap={0}>
          <CardTitle>Talent pool</CardTitle>
          <Text size="sm" color="secondary">
            Re-match past and alumni candidates to your open roles.
          </Text>
        </VStack>
        <Button
          size="sm"
          variant="secondary"
          label={show ? 'Hide' : 'Show'}
          onClick={() => setShow((v) => !v)}
        />
      </HStack>

      {show && (
        <div className="mt-4 border-border border-t pt-4">
          {pool.error ? (
            <Banner status="error" title={(pool.error as Error).message} />
          ) : pool.isLoading ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-24 animate-pulse rounded-lg border border-border bg-surface"
                />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <Text size="sm" color="secondary">
              {hasFilters
                ? 'No talent-pool candidates match your filters.'
                : 'No past candidates to re-match yet.'}
            </Text>
          ) : layout === 'list' ? (
            // List view: full-width rows (avatar + identity on the left, recommended roles on the
            // right) so the pool reads like the candidates list table above it, not a card grid.
            <div className="space-y-2">
              {filtered.map((c) => (
                <button
                  key={c.candidate_id}
                  type="button"
                  className="flex w-full items-center gap-3 rounded-lg border border-border p-3 text-left transition-colors hover:border-border-emphasized"
                  onClick={() => onOpenCandidate(c.candidate_id)}
                >
                  <Avatar name={c.name} size={32} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-primary">{c.name}</span>
                    <span className="block truncate text-sm text-secondary">
                      {c.seniority ?? '—'}
                      {statusSuffix(c)}
                    </span>
                  </span>
                  {c.recommended.length > 0 ? (
                    <span className="flex flex-[2] flex-wrap justify-end gap-1">
                      {c.recommended.map((r) => (
                        <Badge key={r.requisition_id} variant="neutral" label={r.title} />
                      ))}
                    </span>
                  ) : (
                    <span className="flex-none text-sm text-secondary">
                      No matching open role right now
                    </span>
                  )}
                </button>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {filtered.map((c) => (
                <button
                  key={c.candidate_id}
                  type="button"
                  className="flex flex-col gap-2 rounded-lg border border-border p-3 text-left transition-colors hover:border-border-emphasized"
                  onClick={() => onOpenCandidate(c.candidate_id)}
                >
                  <span className="flex items-center gap-2">
                    <Avatar name={c.name} size={32} />
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-primary">{c.name}</span>
                      <span className="block truncate text-sm text-secondary">
                        {c.seniority ?? '—'}
                        {statusSuffix(c)}
                      </span>
                    </span>
                  </span>
                  {c.recommended.length > 0 ? (
                    <span className="flex flex-wrap gap-1">
                      {c.recommended.map((r) => (
                        <Badge key={r.requisition_id} variant="neutral" label={r.title} />
                      ))}
                    </span>
                  ) : (
                    <span className="text-sm text-secondary">No matching open role right now</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
