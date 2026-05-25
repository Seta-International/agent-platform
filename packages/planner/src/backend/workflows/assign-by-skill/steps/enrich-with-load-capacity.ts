import { CopilotRegistry, type CrossModuleReadToolSpec } from '@seta/copilot-sdk';
import type { PoolCandidate } from './candidate-pool.ts';

export interface EnrichedCandidate extends PoolCandidate {
  openTaskCount: number | null;
  hoursAvailableThisWeek: number | null;
  timezone: string | null;
}

type ReadTool<I, O> = CrossModuleReadToolSpec<I, O>;

function findReadTool<I = unknown, O = unknown>(id: string): ReadTool<I, O> | undefined {
  return CopilotRegistry.listCrossModuleReadTools().find((t) => t.id === id) as
    | ReadTool<I, O>
    | undefined;
}

/**
 * Adds load (open-task count), capacity (hours-available — degrades silently
 * if timesheet module not registered), and timezone to each candidate.
 *
 * Per-candidate calls run in parallel; signals fan out across modules so the
 * per-user wait is `max(latency)` rather than `sum(latency)`. Caller is
 * expected to pre-rank by cheap signals (exact + vector + history) and only
 * enrich the top ~10 — full-pool enrichment is wasteful when only top-5 are
 * surfaced.
 */
export async function enrichWithLoadAndCapacity(input: {
  tenantId: string;
  callerUserId: string;
  candidates: PoolCandidate[];
}): Promise<EnrichedCandidate[]> {
  const loadTool = findReadTool<{ userId: string }, { openCount: number }>(
    'planner_getOpenTaskCountForUser',
  );
  const tzTool = findReadTool<{ userId: string }, { timezone: string }>(
    'identity_getTimezoneForUser',
  );
  const capTool = findReadTool<{ userId: string }, { hoursAvailable: number }>(
    'timesheet_getCapacityThisWeek',
  );

  const session = { tenant_id: input.tenantId, user_id: input.callerUserId };

  return Promise.all(
    input.candidates.map(async (c) => {
      const [load, tz, cap] = await Promise.all([
        loadTool ? safeRead(loadTool, session, { userId: c.userId }) : Promise.resolve(null),
        tzTool ? safeRead(tzTool, session, { userId: c.userId }) : Promise.resolve(null),
        capTool ? safeRead(capTool, session, { userId: c.userId }) : Promise.resolve(null),
      ]);
      return {
        ...c,
        openTaskCount: load?.openCount ?? null,
        hoursAvailableThisWeek: cap?.hoursAvailable ?? null,
        timezone: tz?.timezone ?? null,
      };
    }),
  );
}

// Read tools should be best-effort: a failure in one signal must not abort
// the whole enrichment pass (graceful degradation per spec §8.2).
async function safeRead<I, O>(
  tool: ReadTool<I, O>,
  session: { tenant_id: string; user_id: string },
  input: I,
): Promise<O | null> {
  try {
    return await tool.execute({ session, input });
  } catch {
    return null;
  }
}
