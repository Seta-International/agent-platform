import {
  Avatar,
  Badge,
  Banner,
  Button,
  Card,
  CardTitle,
  Layout,
  LayoutContent,
  LayoutHeader,
} from '@seta/shared-ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { fetchTalentPool } from '../api/hiring-client.ts';
import { hiringKeys } from '../state/query-keys.ts';

export function TalentPoolCard({ onOpenCandidate }: { onOpenCandidate: (id: string) => void }) {
  const [show, setShow] = useState(false);
  const pool = useQuery({
    queryKey: hiringKeys.talentPool(),
    queryFn: fetchTalentPool,
    enabled: show,
  });

  return (
    <Card className="mt-6">
      <Layout
        header={
          <LayoutHeader hasDivider={show} className="flex flex-row items-center justify-between">
            <CardTitle>Talent pool</CardTitle>
            <Button
              size="sm"
              variant="ghost"
              label={show ? 'Hide' : 'Show'}
              onClick={() => setShow((v) => !v)}
            />
          </LayoutHeader>
        }
        content={
          show ? (
            <LayoutContent>
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
              ) : (pool.data?.length ?? 0) === 0 ? (
                <div className="text-secondary">No past candidates to re-match yet.</div>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {pool.data?.map((c) => (
                    <div key={c.candidate_id} className="rounded-lg border border-border p-3">
                      <button
                        type="button"
                        className="flex items-center gap-2 text-left"
                        onClick={() => onOpenCandidate(c.candidate_id)}
                      >
                        <Avatar name={c.name} size={32} />
                        <span>
                          <span className="block font-semibold text-primary">{c.name}</span>
                          <span className="block text-caption text-secondary">
                            {c.seniority ?? '—'}
                            {c.segment === 'alumni'
                              ? ' · alumni'
                              : c.last_status === 'transferred'
                                ? ' · transferred'
                                : c.last_status === 'rejected'
                                  ? ' · rejected'
                                  : ' · past candidate'}
                          </span>
                        </span>
                      </button>
                      {c.recommended.length > 0 ? (
                        <div className="mt-2">
                          <span className="text-caption text-secondary">Recommended for</span>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {c.recommended.map((r) => (
                              <Badge key={r.requisition_id} variant="neutral" label={r.title} />
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="mt-2 text-caption text-secondary">
                          No matching open role right now
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </LayoutContent>
          ) : undefined
        }
      />
    </Card>
  );
}
