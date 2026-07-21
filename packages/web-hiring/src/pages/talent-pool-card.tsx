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
import { useState } from 'react';
import { fetchTalentPool } from '../api/hiring-client.ts';
import { hiringKeys } from '../state/query-keys.ts';

export function TalentPoolCard({
  onOpenCandidate,
  q = '',
  reqFilter = '',
  seniorityFilter = '',
}: {
  onOpenCandidate: (id: string) => void;
  /** Active board filters — the pool honours the ones it has data for (name search, seniority,
   * and requisition via its recommended roles). Source isn't stored on pool rows, so it's not
   * applied here. */
  q?: string;
  reqFilter?: string;
  seniorityFilter?: string;
}) {
  const [show, setShow] = useState(false);
  const pool = useQuery({
    queryKey: hiringKeys.talentPool(),
    queryFn: fetchTalentPool,
    enabled: show,
  });

  const needle = q.trim().toLowerCase();
  const filtered = (pool.data ?? []).filter((c) => {
    if (seniorityFilter && c.seniority !== seniorityFilter) return false;
    // A requisition filter narrows the pool to candidates the matcher recommends for that role.
    if (reqFilter && !c.recommended.some((r) => r.requisition_id === reqFilter)) return false;
    if (needle && !`${c.name} ${c.seniority ?? ''}`.toLowerCase().includes(needle)) return false;
    return true;
  });
  const hasFilters = Boolean(seniorityFilter || reqFilter || needle);

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
                        {c.segment === 'alumni'
                          ? ' · alumni'
                          : c.last_status === 'transferred'
                            ? ' · transferred'
                            : c.last_status === 'rejected'
                              ? ' · rejected'
                              : c.last_status === 'cancelled'
                                ? ' · cancelled'
                                : ' · past candidate'}
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
