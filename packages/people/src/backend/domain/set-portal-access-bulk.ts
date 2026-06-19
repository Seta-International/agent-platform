import type { SessionScope } from '@seta/core';
import { setPortalAccess } from './set-portal-access.ts';

export interface SetPortalAccessBulkInput {
  worker_ids: string[];
  enabled: boolean;
  session: SessionScope;
}

export async function setPortalAccessBulk(input: SetPortalAccessBulkInput): Promise<{
  results: Array<{ worker_id: string; status: 'changed' | 'skipped' | 'error'; error?: string }>;
}> {
  const results: Array<{
    worker_id: string;
    status: 'changed' | 'skipped' | 'error';
    error?: string;
  }> = [];
  for (const worker_id of input.worker_ids) {
    try {
      const r = await setPortalAccess({
        worker_id,
        enabled: input.enabled,
        session: input.session,
      });
      results.push({ worker_id, status: r.changed ? 'changed' : 'skipped' });
    } catch (err) {
      results.push({
        worker_id,
        status: 'error',
        error: err instanceof Error ? err.message : 'error',
      });
    }
  }
  return { results };
}
