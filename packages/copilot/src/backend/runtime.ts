import { Mastra } from '@mastra/core';
import { PostgresStore } from '@mastra/pg';
import type { Pool } from 'pg';
import { adaptMastraEvent, onLifecycleEvent } from './workflows/lifecycle-hook.ts';

export type CopilotRuntimeDeps = {
  pool: Pool;
  databaseUrl: string;
};

export function buildMastra(deps: CopilotRuntimeDeps): Mastra {
  const storage = new PostgresStore({
    id: 'copilot-store',
    schemaName: 'copilot',
    pool: deps.pool,
  });
  const mastra = new Mastra({
    storage,
    logger: false,
  });
  wireLifecycleHook(mastra, deps.pool);
  return mastra;
}

function wireLifecycleHook(mastra: Mastra, pool: Pool): void {
  const handle = async (raw: unknown): Promise<void> => {
    if (!raw || typeof raw !== 'object') return;
    const adapted = adaptMastraEvent(
      raw as { type: string; runId: string; data?: Record<string, unknown> },
    );
    if (!adapted) return;
    try {
      await onLifecycleEvent(pool, adapted);
    } catch (err) {
      // Surface to logs; never re-throw to Mastra — its publish path is fire-and-forget and a throw would
      // crash the EventEmitterPubSub listener chain for unrelated subscribers.
      console.error('[copilot.workflow.lifecycle-hook]', err);
    }
  };
  // EventEmitterPubSub.subscribe resolves synchronously in microseconds; void intentional.
  void mastra.pubsub.subscribe('workflows', handle);
  void mastra.pubsub.subscribe('workflows-finish', handle);
}
